import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { IPV4, hostAllowed, isLoopback, newPhoneToken, phoneGate } from './acesso.mjs';

const TOKEN = newPhoneToken();
const req = (method: string, cookie = '') => ({ method, headers: cookie ? { cookie } : {} });
const url = (p: string) => new URL(p, 'http://x');

describe('modo celular', () => {
  it('aceita o IP da rede no Host só quando o modo celular está ligado', () => {
    expect(hostAllowed('192.168.0.10:4530', 4530)).toBe(false);
    expect(hostAllowed('192.168.0.10:4530', 4530, '192.168.0.10')).toBe(true);
    expect(hostAllowed('192.168.0.11:4530', 4530, '192.168.0.10')).toBe(false);
    expect(hostAllowed('192.168.0.10:4531', 4530, '192.168.0.10')).toBe(false);
    expect(hostAllowed('127.0.0.1:4530', 4530, '192.168.0.10')).toBe(true);
  });

  it('só aceita IPv4 como V2_LAN_HOST', () => {
    for (const ok of ['192.168.0.10', '10.0.0.2', '172.16.5.200']) expect(IPV4.test(ok)).toBe(true);
    for (const bad of ['', 'evil.example', '192.168.0.256', '192.168.0', '192.168.0.1:4530', '0.0.0.0/0', '192.168.0.1 ']) expect(IPV4.test(bad)).toBe(false);
  });

  it('reconhece o próprio computador', () => {
    for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect(isLoopback(a)).toBe(true);
    for (const a of ['192.168.0.20', '::ffff:192.168.0.20', '', undefined]) expect(isLoopback(a)).toBe(false);
  });

  it('nega sem token e sem cookie', () => {
    const g = phoneGate(req('GET'), url('/'), TOKEN, 4530);
    expect(g.action).toBe('deny');
    expect(g.status).toBe(403);
  });

  it('nega token errado na URL', () => {
    expect(phoneGate(req('GET'), url('/?t=errado'), TOKEN, 4530).action).toBe('deny');
  });

  it('com o token do QR code grava o cookie e tira o token da URL', () => {
    const g = phoneGate(req('GET'), url(`/?t=${TOKEN}`), TOKEN, 4530);
    expect(g.action).toBe('redirect');
    expect(g.location).toBe('/');
    expect(g.cookie).toContain(`v2_cel_4530=${TOKEN}`);
    expect(g.cookie).toContain('HttpOnly');
    expect(g.cookie).toContain('SameSite=Strict');
    expect(phoneGate(req('GET'), url(`/api/snapshot?x=1&t=${TOKEN}`), TOKEN, 4530).location).toBe('/api/snapshot?x=1');
  });

  it('com o cookie libera a leitura', () => {
    expect(phoneGate(req('GET', `v2_cel_4530=${TOKEN}`), url('/api/snapshot'), TOKEN, 4530).action).toBe('allow');
    expect(phoneGate(req('GET', 'v2_cel_4530=outro'), url('/api/snapshot'), TOKEN, 4530).action).toBe('deny');
  });

  it('nunca deixa escrever, nem com token e cookie válidos', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(phoneGate(req(m, `v2_cel_4530=${TOKEN}`), url(`/api/chat?t=${TOKEN}`), TOKEN, 4530)).toMatchObject({ action: 'deny', status: 403 });
    }
  });

  it('sem token configurado nada passa', () => {
    expect(phoneGate(req('GET', 'v2_cel_4530='), url('/?t='), '', 4530).action).toBe('deny');
  });
});
