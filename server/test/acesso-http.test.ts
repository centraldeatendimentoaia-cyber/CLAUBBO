// Teste de ponta a ponta do acesso: bridge real em porta livre, dados temporários.
// Cobre: POST sem token recusado, Host de fora com 403, comando e pasta inválidos recusados, confirmação humana e o token dos agentes.
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
/** fetch não deixa trocar o Host; o http.request deixa. */
const raw = (port: number, method: string, p: string, headers: Record<string, string> = {}, body?: unknown) => new Promise<Res>((resolve, reject) => {
  const data = body === undefined ? undefined : JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
    let text = ''; res.on('data', (d) => (text += d));
    res.on('end', () => { let b: any = text; try { b = JSON.parse(text); } catch { /* html */ } resolve({ status: res.statusCode ?? 0, body: b, headers: res.headers }); });
  });
  req.on('error', reject); if (data) req.write(data); req.end();
});

interface Bridge { port: number; dir: string; child: ChildProcess; tok: (k: 'pagina' | 'agentes') => string; page: (m: string, p: string, body?: unknown, extra?: Record<string, string>) => Promise<Res>; agent: (m: string, p: string, body?: unknown) => Promise<Res> }
const bridges: Bridge[] = [];
async function startBridge(confirm: 'sim' | 'nao'): Promise<Bridge> {
  const port = await freePort(), dead = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-acesso-http-'));
  const child = spawn(process.execPath, [path.join(here, '..', 'bridge.mjs')], {
    env: { ...process.env, BRIDGE_PORT: String(port), CLAUBBO_URL: `http://127.0.0.1:${dead}`, V2_DATA: path.join(dir, 'data'), V2_HOME: dir, V2_BRAIN: path.join(dir, 'brain'), V2_SECRETS: path.join(dir, 'segredos'), V2_TELEGRAM: 'off', V2_CLAUDE_BIN: process.execPath, V2_CLAUDE_PRE: JSON.stringify([path.join(here, 'fake-claude.mjs')]), V2_CONFIRMACAO: confirm },
    stdio: 'ignore',
  });
  const tok = (k: 'pagina' | 'agentes') => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'data', 'acesso.json'), 'utf8'))[k]; } catch { return ''; } };
  const origin = `http://127.0.0.1:${port}`;
  const b: Bridge = {
    port, dir, child, tok,
    page: (m, p, body, extra = {}) => raw(port, m, p, { host: `127.0.0.1:${port}`, origin, 'x-v2-token': tok('pagina'), ...extra }, body),
    agent: (m, p, body) => raw(port, m, p, { host: `127.0.0.1:${port}`, 'x-v2-agente': tok('agentes') }, body),
  };
  bridges.push(b);
  for (let i = 0; i < 60; i++) { const r = await raw(port, 'GET', '/api/health', { host: `127.0.0.1:${port}` }).catch(() => null); if (r?.status === 200) return b; await sleep(250); }
  throw new Error('bridge não subiu');
}
afterAll(async () => { for (const b of bridges) b.child.kill(); await sleep(500); for (const b of bridges) fs.rmSync(b.dir, { recursive: true, force: true }); });

let no: Bridge, yes: Bridge, project: string;
beforeAll(async () => {
  [no, yes] = await Promise.all([startBridge('nao'), startBridge('sim')]);
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-proj-'));
}, 60_000);
afterAll(() => fs.rmSync(project, { recursive: true, force: true }));

describe('token', () => {
  it('o token nasce na primeira execução, em data/acesso.json', () => {
    expect(no.tok('pagina')).toMatch(/^[0-9a-f]{64}$/); expect(no.tok('agentes')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('POST sem token é recusado, mesmo com o Origin certo', async () => {
    const origin = `http://127.0.0.1:${no.port}`, host = `127.0.0.1:${no.port}`;
    const r = await raw(no.port, 'POST', '/api/build/rooms', { host, origin }, { name: 'Sala X' });
    expect(r.status).toBe(403); expect(r.body.error).toMatch(/token/);
    expect((await no.page('GET', '/api/build/rooms')).body.rooms.some((x: any) => x.name === 'Sala X')).toBe(false);
  });
  it('POST sem token e sem Origin (processo local qualquer) também é recusado', async () => {
    const r = await raw(no.port, 'POST', '/api/build/rooms', { host: `127.0.0.1:${no.port}` }, { name: 'Sala X' });
    expect(r.status).toBe(403);
  });
  it('POST, PUT e DELETE com token errado são recusados', async () => {
    const h = { host: `127.0.0.1:${no.port}`, origin: `http://127.0.0.1:${no.port}`, 'x-v2-token': 'f'.repeat(64) };
    for (const [m, p] of [['POST', '/api/build/rooms'], ['PUT', '/api/company'], ['DELETE', '/api/conversation/x'], ['POST', '/api/backups'], ['POST', '/api/cli/mode']]) expect((await raw(no.port, m, p, h, {})).status, `${m} ${p}`).toBe(403);
  });
  it('com o token da página a escrita passa', async () => {
    const r = await no.page('POST', '/api/build/rooms', { name: 'Sala Y' });
    expect(r.status).toBe(201);
  });
  it('leitura continua aberta (a proteção dos GETs é o Host)', async () => {
    expect((await raw(no.port, 'GET', '/api/health', { host: `127.0.0.1:${no.port}` })).status).toBe(200);
  });
  it('a página recebe o token em cookie HttpOnly + SameSite=Strict e escreve com ele', async () => {
    const r = await raw(no.port, 'GET', '/', { host: `127.0.0.1:${no.port}` });
    if (r.status !== 200) return; // sem dist/client não há HTML para servir
    const cookie = String(r.headers['set-cookie']?.[0] ?? '');
    expect(cookie).toMatch(new RegExp(`^v2_token_${no.port}=[0-9a-f]{64}; HttpOnly; SameSite=Strict`));
    const w = await raw(no.port, 'POST', '/api/build/rooms', { host: `127.0.0.1:${no.port}`, origin: `http://127.0.0.1:${no.port}`, cookie: cookie.split(';')[0] }, { name: 'Sala Z' });
    expect(w.status).toBe(201);
  });
});

describe('token dos agentes (servidor MCP)', () => {
  it('vale só para criar pedido, proposta e chamada; o resto é 403', async () => {
    expect((await no.agent('POST', '/api/cli/requests', { agentId: 'nao:existe', text: 'oi', from: 'x' })).status).toBe(404); // passou da guarda: o terminal é que não existe
    expect((await no.agent('POST', '/api/agent-proposals', { delete: 'ninguem', from: 'x' })).status).toBe(404);
    for (const [m, p] of [['POST', '/api/ops/agents'], ['POST', '/api/cli/requests/abc/approve'], ['POST', '/api/cli/mode'], ['POST', '/api/backups/2026-01-01_000000/restore'], ['PUT', '/api/build/rooms/x'], ['POST', '/api/agent-proposals/abc/approve']]) {
      const r = await no.agent(m, p, {});
      expect(r.status, `${m} ${p}`).toBe(403);
    }
  });
  it('sem token nenhum, até o pedido de agente é recusado', async () => {
    expect((await raw(no.port, 'POST', '/api/cli/requests', { host: `127.0.0.1:${no.port}` }, { agentId: 'x', text: 'oi' })).status).toBe(403);
  });
});

describe('Host', () => {
  it('Host evil.example:PORT recebe 403 (rotas de API e página)', async () => {
    for (const p of ['/api/health', '/api/snapshot', '/api/search?q=a', '/']) {
      const r = await raw(no.port, 'GET', p, { host: `evil.example:${no.port}` });
      expect(r.status, p).toBe(403);
    }
    expect((await raw(no.port, 'POST', '/api/build/rooms', { host: `evil.example:${no.port}`, 'x-v2-token': no.tok('pagina'), origin: `http://127.0.0.1:${no.port}` }, { name: 'x' })).status).toBe(403);
  });
  it('porta errada, sem porta e sem Host são recusados', async () => {
    for (const h of [`127.0.0.1:${no.port + 1}`, '127.0.0.1', `localhost.evil.example:${no.port}`]) expect((await raw(no.port, 'GET', '/api/health', { host: h })).status, h).toBe(403);
  });
  it('127.0.0.1, localhost e [::1] com a porta certa passam', async () => {
    for (const h of [`127.0.0.1:${no.port}`, `localhost:${no.port}`, `[::1]:${no.port}`]) expect((await raw(no.port, 'GET', '/api/health', { host: h })).status, h).toBe(200);
  });
});

describe('pasta do projeto e comando do sistema', () => {
  const room = async (b: Bridge) => (await b.page('GET', '/api/build/rooms')).body.rooms[0].id as string;
  it('pasta inválida é recusada com erro claro (400), nunca gravada', async () => {
    const id = await room(yes);
    for (const bad of ['relativo/proj', path.join(project, 'nao-existe'), `${project}&calc`, `${project};x`, path.parse(project).root, os.homedir(), ...(process.platform === 'win32' ? ['C:\\Windows\\System32'] : ['/etc'])]) {
      const r = await yes.page('PUT', `/api/build/rooms/${id}`, { project: bad });
      expect(r.status, bad).toBe(400); expect(r.body.error, bad).toMatch(/pasta do projeto/);
    }
    expect((await yes.page('GET', `/api/build/rooms/${id}`)).body.project).toBe('');
  });
  it('pasta válida passa com a confirmação "sim" e é recusada com "não"', async () => {
    const id = await room(yes), idNo = await room(no);
    const ok = await yes.page('PUT', `/api/build/rooms/${id}`, { project });
    expect(ok.status).toBe(200); expect(ok.body.project).toBe(path.normalize(project));
    const refused = await no.page('PUT', `/api/build/rooms/${idNo}`, { project, name: 'Renomeada' });
    expect(refused.status).toBe(403);
    const after = (await no.page('GET', `/api/build/rooms/${idNo}`)).body;
    expect(after.project).toBe(''); expect(after.name).not.toBe('Renomeada'); // recusado: nada mudou
  });
  it('reenviar a pasta que já está na sala não pede confirmação nova', async () => {
    const id = await room(yes);
    expect((await no.page('GET', '/api/build/rooms')).status).toBe(200);
    const r = await yes.page('PUT', `/api/build/rooms/${id}`, { project });
    expect(r.status).toBe(200);
  });
  it('sistema com comando fora da lista, com shell ou pasta ruim é recusado (400); o válido só entra com o "sim"', async () => {
    const mk = (b: Bridge, id: string, system: object) => b.page('POST', '/api/ops/agents', { id, name: id, role: 'Teste', system });
    const base = { type: 'local', name: 'Loja', folder: project, port: 3999 };
    for (const command of ['calc', 'npm start & calc', 'powershell -c x', 'node -e x', 'C:\\Windows\\System32\\cmd.exe', 'npx evil']) {
      const r = await mk(yes, 'sistema-ruim', { ...base, command });
      expect(r.status, command).toBe(400); expect(r.body.error, command).toMatch(/sistema/);
    }
    expect((await mk(yes, 'sistema-ruim', { ...base, folder: 'relativo', command: 'npm start' })).status).toBe(400);
    expect((await mk(yes, 'sistema-ruim', { ...base, folder: `${project}&calc`, command: 'npm start' })).status).toBe(400);
    expect((await yes.page('GET', '/api/ops/state')).body.agents.some((a: any) => a.id === 'sistema-ruim')).toBe(false);
    expect((await mk(no, 'sistema-bom', { ...base, command: 'npm start' })).status).toBe(403); // comando bom, mas o João não confirmou
    expect((await no.page('GET', '/api/ops/state')).body.agents.some((a: any) => a.id === 'sistema-bom')).toBe(false);
    expect((await mk(yes, 'sistema-bom', { ...base, command: 'npm start' })).status).toBe(201);
  });
  it('ligar o sistema com comando fora da lista (agents.json antigo ou editado à mão) é recusado e nada é executado', async () => {
    const file = path.join(yes.dir, 'data', 'agents.json');
    // Desliga a bridge ANTES de editar o arquivo: ela relê agents.json a cada ciclo, e uma leitura no meio da escrita o veria ilegível
    // (o store.mjs põe o arquivo ilegível de lado como .corrompido, e o agente sumiria: 404 em vez de 400).
    const exited = new Promise((resolve) => yes.child.once('exit', resolve));
    yes.child.kill(); await exited;
    const agents = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(agents) ? agents : agents.agents;
    const a = list.find((x: any) => x.id === 'sistema-bom');
    expect(a).toBeTruthy();
    const marker = path.join(project, 'executou.txt');
    a.system.command = `node -e x`; // fora da regra
    fs.writeFileSync(file, JSON.stringify(agents));
    const again = await startBridgeOn(yes);
    const r = await again.page('POST', '/api/systems/sistema-bom/start');
    expect(r.status).toBe(400); expect(fs.existsSync(marker)).toBe(false);
  }, 30_000);
});

/** Sobe de novo a bridge de `b` (mesmos dados, mesma porta). */
async function startBridgeOn(b: Bridge): Promise<Bridge> {
  const dead = await freePort();
  b.child = spawn(process.execPath, [path.join(here, '..', 'bridge.mjs')], {
    env: { ...process.env, BRIDGE_PORT: String(b.port), CLAUBBO_URL: `http://127.0.0.1:${dead}`, V2_DATA: path.join(b.dir, 'data'), V2_HOME: b.dir, V2_BRAIN: path.join(b.dir, 'brain'), V2_SECRETS: path.join(b.dir, 'segredos'), V2_TELEGRAM: 'off', V2_CLAUDE_BIN: process.execPath, V2_CLAUDE_PRE: JSON.stringify([path.join(here, 'fake-claude.mjs')]), V2_CONFIRMACAO: 'sim' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) { const r = await raw(b.port, 'GET', '/api/health', { host: `127.0.0.1:${b.port}` }).catch(() => null); if (r?.status === 200) return b; await sleep(250); }
  throw new Error('bridge não subiu de novo');
}
