import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { createNotifier, messageFor } from './notify.mjs';

const TOKEN = '1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const cfg = (content: object | null) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'v2-tg-')), 'telegram.json');
  if (content) fs.writeFileSync(f, JSON.stringify(content));
  return f;
};

describe('mensagens', () => {
  it('só tipo do evento e nomes', () => {
    expect(messageFor({ type: 'system_failed', agent: 'Ana', system: 'Loja' })).toBe('🔴 Loja (Ana) caiu e não voltou. O escritório parou de tentar.');
    expect(messageFor({ type: 'system_back', agent: 'Ana', system: 'Loja' })).toContain('voltou ao ar');
    expect(messageFor({ type: 'url_down', agent: 'Ana', system: 'Site' })).toContain('fora do ar');
    expect(messageFor({ type: 'qualquer-coisa', agent: 'Ana' })).toBeNull();
  });
  it('campos extras (caminho, comando, erro) nunca entram no texto', () => {
    const t = messageFor({ type: 'system_failed', agent: 'Ana', system: 'Loja', folder: 'D:/segredo/proj', command: 'npm start', error: 'senha=123' });
    expect(t).not.toMatch(/segredo|npm start|senha/);
  });
});

describe('envio', () => {
  it('envia para a API do Telegram com o token e o chat configurados', async () => {
    const calls: { url: string; body: any }[] = [];
    const n = createNotifier({ configFile: cfg({ token: TOKEN, chatId: '987654321' }), fetchFn: async (url: string, o: any) => { calls.push({ url, body: JSON.parse(o.body) }); return { ok: true, status: 200 }; }, log: () => {} });
    expect(await n.notify({ type: 'system_back', agent: 'Ana', system: 'Loja' })).toEqual({ sent: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(calls[0].body).toMatchObject({ chat_id: '987654321', text: '✅ Loja (Ana) voltou ao ar.' });
  });
  it('sem configuração: não envia, avisa uma vez e nunca lança', async () => {
    const logs: string[] = [];
    let called = false;
    const n = createNotifier({ configFile: cfg(null), fetchFn: async () => { called = true; return { ok: true, status: 200 }; }, log: (m: string) => logs.push(m) });
    expect((await n.notify({ type: 'system_back', agent: 'A', system: 'B' })).sent).toBe(false);
    await n.notify({ type: 'system_failed', agent: 'A', system: 'B' });
    expect(called).toBe(false);
    expect(logs).toHaveLength(1);
    expect(n.configured()).toBe(false);
  });
  it('token ou chat em formato errado é tratado como não configurado', () => {
    expect(createNotifier({ configFile: cfg({ token: 'abc', chatId: '1' }) }).configured()).toBe(false);
  });
  it('falha de rede e HTTP de erro não lançam e o token nunca aparece no log', async () => {
    const logs: string[] = [];
    const bad = createNotifier({ configFile: cfg({ token: TOKEN, chatId: '987654321' }), fetchFn: async () => { throw new Error(`fetch failed https://api.telegram.org/bot${TOKEN}/sendMessage`); }, log: (m: string) => logs.push(m) });
    expect((await bad.notify({ type: 'system_failed', agent: 'A', system: 'B' })).sent).toBe(false);
    const http = createNotifier({ configFile: cfg({ token: TOKEN, chatId: '987654321' }), fetchFn: async () => ({ ok: false, status: 401 }), log: (m: string) => logs.push(m) });
    expect((await http.notify({ type: 'system_failed', agent: 'A', system: 'B' })).sent).toBe(false);
    expect(logs).toHaveLength(2);
    expect(logs.join('\n')).not.toContain(TOKEN);
  });
  it('não repete o mesmo aviso em 60 segundos', async () => {
    let t = 1000;
    let n = 0;
    const nt = createNotifier({ configFile: cfg({ token: TOKEN, chatId: '987654321' }), now: () => t, fetchFn: async () => { n++; return { ok: true, status: 200 }; }, log: () => {} });
    await nt.notify({ type: 'url_down', agent: 'A', system: 'B' });
    t += 30_000;
    expect((await nt.notify({ type: 'url_down', agent: 'A', system: 'B' })).reason).toBe('repetido');
    t += 40_000;
    await nt.notify({ type: 'url_down', agent: 'A', system: 'B' });
    expect(n).toBe(2);
  });
});
