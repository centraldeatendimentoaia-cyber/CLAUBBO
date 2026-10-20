// Teste de ponta a ponta de cabeçalhos de segurança, URL malformada e registro de auditoria (bridge real em porta livre, dados temporários).
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const freePort = () => new Promise<number>((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address() as net.AddressInfo; s.close(() => resolve(port)); }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Res { status: number; body: any; headers: http.IncomingHttpHeaders }
const raw = (port: number, method: string, p: string, headers: Record<string, string> = {}, body?: unknown) => new Promise<Res>((resolve, reject) => {
  const data = body === undefined ? undefined : JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
    let text = ''; res.on('data', (d) => (text += d));
    res.on('end', () => { let b: any = text; try { b = JSON.parse(text); } catch { /* html */ } resolve({ status: res.statusCode ?? 0, body: b, headers: res.headers }); });
  });
  req.on('error', reject); if (data) req.write(data); req.end();
});

let port = 0, dir = '', child: ChildProcess;
const tok = () => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'acesso.json'), 'utf8')).pagina as string;
const page = (m: string, p: string, body?: unknown) => raw(port, m, p, { origin: `http://127.0.0.1:${port}`, 'x-v2-token': tok() }, body);
const audit = () => { try { return fs.readFileSync(path.join(dir, 'data', 'auditoria.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

beforeAll(async () => {
  port = await freePort(); const dead = await freePort();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-seg-http-'));
  child = spawn(process.execPath, [path.join(here, '..', 'bridge.mjs')], {
    env: { ...process.env, BRIDGE_PORT: String(port), CLAUBBO_URL: `http://127.0.0.1:${dead}`, V2_DATA: path.join(dir, 'data'), V2_HOME: dir, V2_BRAIN: path.join(dir, 'brain'), V2_OLD_DATA: path.join(dir, 'nada'), V2_SECRETS: path.join(dir, 'segredos'), V2_TELEGRAM: 'off', V2_CLAUDE_BIN: process.execPath, V2_CLAUDE_PRE: JSON.stringify([path.join(here, 'fake-claude.mjs')]), V2_CONFIRMACAO: 'sim' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) { const r = await raw(port, 'GET', '/api/health').catch(() => null); if (r?.status === 200) return; await sleep(250); }
  throw new Error('bridge não subiu');
}, 60_000);
afterAll(async () => { child?.kill(); await sleep(500); fs.rmSync(dir, { recursive: true, force: true }); });

describe('cabeçalhos de segurança', () => {
  const frames = (h: http.IncomingHttpHeaders) => { expect(h['content-security-policy']).toMatch(/frame-ancestors 'none'/); expect(h['x-frame-options']).toBe('DENY'); expect(h['x-content-type-options']).toBe('nosniff'); };
  it('a página, a API e as recusas levam CSP com frame-ancestors none e X-Frame-Options DENY', async () => {
    for (const r of [await raw(port, 'GET', '/'), await raw(port, 'GET', '/api/health'), await raw(port, 'POST', '/api/build/rooms', {}, {}), await raw(port, 'GET', '/', { host: 'evil.example:' + port })]) frames(r.headers);
  });
  it('a CSP só deixa a página carregar script próprio e não usa eval', async () => {
    const csp = String((await raw(port, 'GET', '/')).headers['content-security-policy']);
    expect(csp).toMatch(/script-src 'self'(;|$)/); expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/); expect(csp).toMatch(/object-src 'none'/); expect(csp).toMatch(/connect-src 'self'/);
  });
});

describe('erros de entrada não derrubam o servidor', () => {
  it('%-escape malformado na URL da página dá 400 e o servidor segue de pé', async () => {
    const r = await raw(port, 'GET', '/%E0%A4%A');
    expect(r.status).toBe(400); frames2(r.headers);
    expect((await raw(port, 'GET', '/api/health')).status).toBe(200);
  });
  it('requisição HTTP quebrada leva 400 e o servidor segue de pé', async () => {
    const reply = await new Promise<string>((resolve) => { const s = net.connect(port, '127.0.0.1', () => s.write('GET / HTTP/1.1\r\nHost: x\r\n\x00bad\r\n\r\n')); let t = ''; s.on('data', (d) => (t += d)); s.on('close', () => resolve(t)); s.on('error', () => resolve(t)); setTimeout(() => { s.destroy(); }, 1500); });
    expect(reply).toMatch(/^HTTP\/1\.1 400/);
    expect((await raw(port, 'GET', '/api/health')).status).toBe(200);
  });
});
const frames2 = (h: http.IncomingHttpHeaders) => expect(h['x-frame-options']).toBe('DENY');

describe('auditoria de rotas que apagam ou sobrescrevem', () => {
  it('PUT e DELETE deixam linha com quem, método, caminho e status; sem corpo nem token', async () => {
    const made = await page('POST', '/api/build/rooms', { name: 'Sala Auditada' });
    expect(made.status).toBe(201);
    const id = made.body.id as string;
    expect((await page('PUT', `/api/build/rooms/${id}`, { name: 'Sala Renomeada Secreta' })).status).toBe(200);
    expect((await page('DELETE', `/api/build/rooms/${id}`)).status).toBe(200);
    await sleep(200);
    const lines = audit();
    expect(lines.some((l) => l.method === 'PUT' && l.path === `/api/build/rooms/${id}` && l.who === 'pagina' && l.status === 200 && l.at)).toBe(true);
    expect(lines.some((l) => l.method === 'DELETE' && l.path === `/api/build/rooms/${id}` && l.status === 200)).toBe(true);
    const text = fs.readFileSync(path.join(dir, 'data', 'auditoria.jsonl'), 'utf8');
    expect(text).not.toContain('Renomeada Secreta'); expect(text).not.toContain(tok());
  });
  it('a recusa também é registrada, com o status; leitura e criação simples não entram', async () => {
    const before = audit().length;
    expect((await page('DELETE', '/api/build/rooms/nao-existe')).status).toBeGreaterThanOrEqual(400);
    await page('GET', '/api/build/rooms'); await page('POST', '/api/build/rooms', { name: 'So criar' });
    await sleep(200);
    const novos = audit().slice(before);
    expect(novos).toHaveLength(1); expect(novos[0]).toMatchObject({ method: 'DELETE', path: '/api/build/rooms/nao-existe' });
    expect(novos[0].status).toBeGreaterThanOrEqual(400);
  });
  it('sem token a escrita nem chega ao registro (403 antes)', async () => {
    const before = audit().length;
    expect((await raw(port, 'DELETE', '/api/build/rooms/x', { origin: `http://127.0.0.1:${port}` })).status).toBe(403);
    await sleep(200);
    expect(audit()).toHaveLength(before);
  });
});

describe('conta do agente do Escritório e ditado', () => {
  it('GET /api/agents/escritorio:<id>/account devolve a conta do agente em vez de 404', async () => {
    const mk = await page('POST', '/api/ops/agents', { id: 'conta-teste', name: 'Conta Teste', role: 'Teste' });
    expect(mk.status).toBe(201);
    const r = await raw(port, 'GET', `/api/agents/${encodeURIComponent('escritorio:conta-teste')}/account`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('account'); expect(r.body).toHaveProperty('email');
  });
  it('agente que não existe continua 404', async () => {
    expect((await raw(port, 'GET', `/api/agents/${encodeURIComponent('escritorio:nao-existe')}/account`)).status).toBe(404);
    expect((await raw(port, 'GET', `/api/agents/${encodeURIComponent('x:1')}/account`)).status).toBe(404);
  });
  it('ditado: a consulta responde 200 "indisponível" e o envio, 503', async () => {
    const q = await raw(port, 'GET', '/api/dictation');
    expect(q.status).toBe(200); expect(q.body).toMatchObject({ available: false, error: 'ditado indisponível' });
    const p = await page('POST', '/api/dictation', {});
    expect(p.status).toBe(503); expect(p.body.error).toBe('ditado indisponível');
    expect((await raw(port, 'GET', '/api/dictation/abc')).status).toBe(503);
  });
});
