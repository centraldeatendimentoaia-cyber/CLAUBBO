// Teste de ponta a ponta dos jogos: bridge real em porta livre, dados temporários, sem tocar em D:\escritorio-v2\data.
// Pelo HTTP local a pessoa é o "dono"; a equipe só entra pela rede (cookie do QR code) e fica coberta nos testes de acesso.
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
const somaCarteiras = () => Object.values(JSON.parse(fs.readFileSync(data('carteiras.json'), 'utf8')).contas as Record<string, { saldo: number }>).reduce((s, c) => s + c.saldo, 0);
const linhasAuditoria = () => fs.readFileSync(data('auditoria.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const novoAgente = async (id: string) => expect((await page('POST', '/api/ops/agents', { id, name: id, role: 'Teste' })).status).toBe(201);

beforeAll(async () => {
  port = await freePort();
  const dead = await freePort();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-jogos-http-'));
  // Conta Principal "conectada" de mentira (arquivo vazio na pasta temporária) e turno lento: a tarefa fica em andamento e o agente, ocupado.
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', '.credentials.json'), '{}');
  child = spawn(process.execPath, [path.join(here, '..', 'bridge.mjs')], {
    env: { ...process.env, BRIDGE_PORT: String(port), CLAUBBO_URL: `http://127.0.0.1:${dead}`, V2_DATA: data(''), V2_HOME: dir, V2_BRAIN: path.join(dir, 'brain'), V2_SECRETS: path.join(dir, 'segredos'), V2_TELEGRAM: 'off', V2_CLAUDE_BIN: process.execPath, V2_CLAUDE_PRE: JSON.stringify([path.join(here, 'fake-claude.mjs')]), V2_CONFIRMACAO: 'nao', FAKE_DELAY_MS: '60000' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) { const r = await raw(port, 'GET', '/api/health').catch(() => null); if (r?.status === 200) return; await sleep(250); }
  throw new Error('bridge não subiu');
}, 60_000);
afterAll(async () => { child.kill(); await sleep(500); fs.rmSync(dir, { recursive: true, force: true }); });

describe('partida inteira pelo servidor', () => {
  let id = '', jogada: any;
  it('a carteira nasce com 100 moedas', async () => {
    const r = await page('GET', '/api/carteira');
    expect(r.status).toBe(200); expect(r.body.saldo).toBe(100); expect(r.body.extrato).toEqual([]);
  });
  it('desafiar um agente ocioso reserva as duas apostas', async () => {
    await novoAgente('jogador-a');
    const r = await page('POST', '/api/jogos/desafio', { agente: 'jogador-a', aposta: 5 });
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ ok: true, rodada: 1, placar: { pessoa: 0, agente: 0 } });
    id = r.body.id;
    expect((await page('GET', '/api/carteira')).body.saldo).toBe(95);
    expect(somaCarteiras()).toBe(200);
  });
  it('recarregar no meio da partida retoma o estado', async () => {
    const r = await page('GET', `/api/jogos/${id}`);
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ ok: true, rodada: 1, placar: { pessoa: 0, agente: 0 } });
  });
  it('rodada repetida (clique duplo ou outra aba) conta uma vez e a segunda recebe 409', async () => {
    const [a, b] = await Promise.all([page('POST', `/api/jogos/${id}/jogada`, { gesto: 'pedra', rodada: 1 }), page('POST', `/api/jogos/${id}/jogada`, { gesto: 'pedra', rodada: 1 })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    jogada = a.status === 200 ? a.body : b.body;
    expect(jogada.rodada).toMatchObject({ numero: 1, gestoPessoa: 'pedra' });
  });
  it('joga até o fim; a moeda se conserva e o humor aparece no snapshot', async () => {
    let r = jogada;
    for (let n = 2; !r.fim && n <= 5; n++) {
      const res = await page('POST', `/api/jogos/${id}/jogada`, { gesto: 'papel', rodada: n });
      expect(res.status).toBe(200); r = res.body;
    }
    expect(r.fim).toBe(true);
    const esperado = { pessoa: 105, agente: 95, empate: 100 }[r.resultado as 'pessoa' | 'agente' | 'empate'];
    expect((await page('GET', '/api/carteira')).body.saldo).toBe(esperado);
    expect(somaCarteiras()).toBe(200);
    expect((await page('GET', '/api/carteira')).body.extrato.length).toBeGreaterThan(0);
    const meu = ((await page('GET', '/api/snapshot')).body.agents as any[]).find((a) => a.sessionId === 'jogador-a');
    expect(['animado', 'neutro', 'chateado']).toContain(meu?.humor);
  });
  it('jogar partida encerrada é 409 e o intervalo de 10 s com o mesmo agente é 429', async () => {
    expect((await page('POST', `/api/jogos/${id}/jogada`, { gesto: 'pedra', rodada: 1 })).status).toBe(409);
    expect((await page('POST', '/api/jogos/desafio', { agente: 'jogador-a', aposta: 5 })).status).toBe(429);
  });
  it('a auditoria registra abertura, jogadas e fim com o nome, sem o gesto', () => {
    const jogos = linhasAuditoria().filter((l) => String(l.path).includes('/api/jogos/'));
    expect(jogos.some((l) => l.path === `/api/jogos/desafio#${id}` && l.nome === 'dono')).toBe(true);
    expect(jogos.some((l) => String(l.path).startsWith(`/api/jogos/${id}/fim#`))).toBe(true);
    expect(JSON.stringify(jogos)).not.toMatch(/pedra|papel|tesoura/);
  });
});

describe('quem não pode jogar e casos recusados', () => {
  it('agente (x-v2-agente) recebe 403 nas quatro rotas e escrita sem token também', async () => {
    await novoAgente('jogador-b');
    expect((await agente('GET', '/api/carteira')).status).toBe(403);
    for (const f of [agente, semToken]) {
      expect((await f('POST', '/api/jogos/desafio', { agente: 'jogador-b', aposta: 5 })).status).toBe(403);
      expect((await f('POST', '/api/jogos/abc/jogada', { gesto: 'pedra', rodada: 1 })).status).toBe(403);
    }
    expect((await agente('GET', '/api/jogos/abc')).status).toBe(403);
  });
  it('aposta fora de 5/10/25 é 400; agente inexistente é 404; partida inexistente é 404', async () => {
    expect((await page('POST', '/api/jogos/desafio', { agente: 'jogador-b', aposta: 7 })).status).toBe(400);
    expect((await page('POST', '/api/jogos/desafio', { agente: 'nao-existe', aposta: 5 })).status).toBe(404);
    expect((await page('GET', '/api/jogos/naoexiste')).status).toBe(404);
  });
});

describe('id do agente como o menu do mapa manda', () => {
  // Regressão: o menu "Desafiar" usa o id do snapshot (`escritorio:<id>`) e o servidor respondia 404 "agente não encontrado".
  it('desafiar com `escritorio:<id>` abre a partida do agente certo', async () => {
    await novoAgente('jogador-d');
    const r = await page('POST', '/api/jogos/desafio', { agente: 'escritorio:jogador-d', aposta: 5 });
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ ok: true, rodada: 1 });
    const aberta = JSON.parse(fs.readFileSync(data('jogos.json'), 'utf8')).partidas[r.body.id];
    expect(aberta.agentId).toBe('jogador-d'); // a carteira e o humor do agente são do id puro
    expect((await page('POST', '/api/jogos/desafio', { agente: 'escritorio:jogador-d', aposta: 5 })).status).toBe(409); // a trava de "uma partida aberta" vale
  });
  it('agente de terminal (andar 2) continua sem jogo: 404', async () => {
    expect((await page('POST', '/api/jogos/desafio', { agente: '.claude:123', aposta: 5 })).status).toBe(404);
  });
});

describe('agente ocupado', () => {
  it('com tarefa em andamento recusa o desafio com 409 e nenhuma moeda sai', async () => {
    await novoAgente('jogador-c');
    expect((await page('POST', '/api/ops/tasks', { agent: 'jogador-c', text: 'tarefa de teste' })).status).toBe(201);
    for (let i = 0; i < 20; i++) { // espera a tarefa sair de "next" para "doing" (turno lento do agente falso)
      const t = JSON.parse(fs.readFileSync(data('tasks.json'), 'utf8')).find((x: any) => x.agent === 'jogador-c');
      if (t?.state === 'doing') break; await sleep(100);
    }
    const antes = (await page('GET', '/api/carteira')).body.saldo, somaAntes = somaCarteiras();
    const r = await page('POST', '/api/jogos/desafio', { agente: 'jogador-c', aposta: 5 });
    expect(r.status).toBe(409);
    expect((await page('GET', '/api/carteira')).body.saldo).toBe(antes);
    expect(somaCarteiras()).toBe(somaAntes);
  });
});

describe('equipe na barra', () => {
  it('lista o dono com a skin JMAL, sem hash nem token, e o nome de quem pergunta', async () => {
    const r = await page('GET', '/api/equipe');
    expect(r.status).toBe(200); expect(r.body.eu).toBe('dono');
    expect(r.body.equipe[0]).toMatchObject({ nome: 'dono', rotulo: 'JMAL', costume: 'jmal' });
    expect(JSON.stringify(r.body)).not.toMatch(/hash|token/);
  });
  it('o dono salva o personagem; o servidor mantém a fantasia JMAL mesmo se o corpo pedir outra', async () => {
    const corpo = { seed: 42, look: 'm', parts: { hair: '#112233', hairStyle: 'bob' }, costume: 'reaper' };
    const r = await page('POST', '/api/equipe/dono/personagem', corpo);
    expect(r.status).toBe(200); expect(r.body.pessoa).toMatchObject({ seed: 42, look: 'm', costume: 'jmal', custom: true });
    expect((await page('GET', '/api/equipe')).body.equipe[0]).toMatchObject({ seed: 42, parts: { hair: '#112233' } });
  });
  it('corpo inválido é 400, pessoa inexistente é 404, agente e escrita sem token são 403', async () => {
    expect((await page('POST', '/api/equipe/dono/personagem', { seed: 1, look: 'm', parts: { hairStyle: 'raio' } })).status).toBe(400);
    expect((await page('POST', '/api/equipe/ninguem/personagem', { seed: 1, look: 'm', parts: {} })).status).toBe(404);
    expect((await agente('POST', '/api/equipe/dono/personagem', { seed: 1, look: 'm', parts: {} })).status).toBe(403);
    expect((await semToken('POST', '/api/equipe/dono/personagem', { seed: 1, look: 'm', parts: {} })).status).toBe(403);
    expect((await agente('GET', '/api/equipe')).status).toBe(403);
  });
  it('a gravação entra na auditoria com o nome', () => {
    expect(linhasAuditoria().some((l) => l.path === '/api/equipe/dono/personagem' && l.nome === 'dono')).toBe(true);
  });
  it('o reset volta ao personagem sorteado', async () => {
    const r = await page('POST', '/api/equipe/dono/personagem', { reset: true });
    expect(r.status).toBe(200); expect(r.body.pessoa).toMatchObject({ custom: false, costume: 'jmal' }); expect(r.body.pessoa.parts).toBeUndefined();
  });
});
