// Presença ao vivo de ponta a ponta: bridge real em porta livre, dados temporários. Pelo HTTP local a pessoa é o "dono";
// as regras de equipe e celular ficam cobertas em acesso-celular.test.ts (phoneGate libera só /api/presenca).
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

interface Res { status: number; body: any }
const raw = (port: number, method: string, p: string, headers: Record<string, string> = {}, body?: unknown) => new Promise<Res>((resolve, reject) => {
  const data = body === undefined ? undefined : JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
    let text = ''; res.on('data', (d) => (text += d));
    res.on('end', () => { let b: any = text; try { b = JSON.parse(text); } catch { /* html */ } resolve({ status: res.statusCode ?? 0, body: b }); });
  });
  req.on('error', reject); if (data) req.write(data); req.end();
});

let port = 0, dir = '', child: ChildProcess;
const data = (f: string) => path.join(dir, 'data', f);
const tok = (k: 'pagina' | 'agentes') => JSON.parse(fs.readFileSync(data('acesso.json'), 'utf8'))[k] as string;
const origin = () => `http://127.0.0.1:${port}`;
const page = (m: string, p: string, body?: unknown) => raw(port, m, p, { origin: origin(), 'x-v2-token': tok('pagina') }, body);
const agente = (m: string, p: string, body?: unknown) => raw(port, m, p, { origin: origin(), 'x-v2-agente': tok('agentes') }, body);
const semToken = (m: string, p: string, body?: unknown) => raw(port, m, p, { origin: origin() }, body);

/** Abre o /api/stream e junta os eventos `presenca` que chegam (a lista mais recente fica em `ultima`). */
function abrirStream(headers: Record<string, string> = {}) {
  const listas: any[][] = [];
  const req = http.request({ host: '127.0.0.1', port, path: '/api/stream', headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (d: string) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
        if (bloco.startsWith('event: presenca')) listas.push(JSON.parse(bloco.split('\ndata: ')[1]));
      }
    });
  });
  req.on('error', () => {}); req.end();
  return { listas, ultima: () => listas[listas.length - 1], fechar: () => req.destroy() };
}
const espera = async (cond: () => boolean, ms = 3000) => { const t = Date.now(); while (!cond() && Date.now() - t < ms) await sleep(40); };

beforeAll(async () => {
  port = await freePort();
  const dead = await freePort();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-presenca-http-'));
  child = spawn(process.execPath, [path.join(here, '..', 'bridge.mjs')], {
    env: { ...process.env, BRIDGE_PORT: String(port), CLAUBBO_URL: `http://127.0.0.1:${dead}`, V2_DATA: data(''), V2_HOME: dir, V2_BRAIN: path.join(dir, 'brain'), V2_SECRETS: path.join(dir, 'segredos'), V2_TELEGRAM: 'off', V2_CONFIRMACAO: 'nao' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) { const r = await raw(port, 'GET', '/api/health').catch(() => null); if (r?.status === 200) return; await sleep(250); }
  throw new Error('bridge não subiu');
}, 60_000);
afterAll(async () => { child.kill(); await sleep(500); fs.rmSync(dir, { recursive: true, force: true }); });

const pos = { andar: 1, x: 10.5, y: 8, dir: 'down' };

describe('presença pelo servidor', () => {
  it('a página (dono) avisa a posição e a lista chega pelo stream', async () => {
    const s = abrirStream();
    await espera(() => s.listas.length > 0); // lista inicial, vazia
    expect(s.ultima()).toEqual([]);
    expect((await page('POST', '/api/presenca', pos)).status).toBe(200);
    await espera(() => s.ultima()?.length === 1);
    expect(s.ultima()).toEqual([{ nome: 'dono', papel: 'dono', ...pos }]);
    s.fechar();
  });

  it('fechar o stream tira a pessoa do mapa (sem esperar o prazo)', async () => {
    const a = abrirStream();
    await espera(() => a.listas.length > 0);
    await sleep(150); // passa do limite de taxa do aviso anterior
    expect((await page('POST', '/api/presenca', { ...pos, x: 11 })).status).toBe(200);
    const b = abrirStream(); // outra página qualquer só observa
    await espera(() => b.ultima()?.length === 1);
    a.fechar();
    b.fechar();
    const c = abrirStream();
    await espera(() => c.listas.length > 0);
    // a e b eram da mesma pessoa; as duas fecharam, então ela some
    await espera(() => c.ultima()?.length === 0);
    expect(c.ultima()).toEqual([]);
    c.fechar();
  });

  it('sair tira a pessoa na hora', async () => {
    const s = abrirStream();
    await espera(() => s.listas.length > 0);
    await sleep(150);
    await page('POST', '/api/presenca', pos);
    await espera(() => s.ultima()?.length === 1);
    expect((await page('POST', '/api/presenca/sair')).status).toBe(200);
    await espera(() => s.ultima()?.length === 0);
    expect(s.ultima()).toEqual([]);
    s.fechar();
  });

  it('limite de taxa: dois avisos colados, o segundo volta 429', async () => {
    await sleep(150);
    expect((await page('POST', '/api/presenca', pos)).status).toBe(200);
    expect((await page('POST', '/api/presenca', { ...pos, x: 12 })).status).toBe(429);
    await page('POST', '/api/presenca/sair');
  });

  it('dado inválido volta 422', async () => {
    await sleep(150);
    expect((await page('POST', '/api/presenca', { ...pos, dir: 'x' })).status).toBe(422);
    expect((await page('POST', '/api/presenca', { ...pos, andar: 'um' })).status).toBe(422);
  });

  it('o token dos agentes e quem não tem token não entram (403); o stream deles não recebe a lista', async () => {
    expect((await agente('POST', '/api/presenca', pos)).status).toBe(403);
    expect((await semToken('POST', '/api/presenca', pos)).status).toBe(403);
    const s = abrirStream({ 'x-v2-agente': tok('agentes') });
    await sleep(600);
    expect(s.listas).toEqual([]);
    s.fechar();
  });
});
