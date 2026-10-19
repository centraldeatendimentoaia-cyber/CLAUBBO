// Teste do retorno automático das respostas dos terminais ao remetente (Claude falso, dados temporários, nada de rede).
// Roda com: node server/test/retorno-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-retorno-'));
const home = path.join(tmp, 'home');
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{}');
Object.assign(process.env, {
  V2_DATA: path.join(tmp, 'data'), V2_BRAIN: path.join(tmp, 'brain'), V2_HOME: home, V2_OLD_DATA: path.join(tmp, 'nada'),
  V2_CLAUDE_BIN: process.execPath, V2_CLAUDE_PRE: JSON.stringify([path.join(here, 'fake-claude.mjs')]), V2_CONCURRENCY: '2', V2_RETORNO_LIMITE: '3',
});
const { createAgent, getAgent } = await import('../core/agents.mjs');
const { history, receiveReturn } = await import('../core/chat.mjs');
const { tick, track, readLog, buildMessage } = await import('../core/retorno.mjs');
const { lastReplySince } = await import('../core/transcript.mjs');

const until = async (fn, what, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 40)); }
  assert.fail(`tempo esgotado esperando: ${what}`);
};
assert.ok(createAgent({ id: 'maestro', name: 'Maestro', role: 'Chefe' }).ok);

// ---- 1) pedido registra remetente e id; só agente do Escritório é acompanhado
const mk = (id, from, extra = {}) => ({ id, from, agentId: 'x:1', agentName: 'Marcelo', text: 'faça X', state: 'sent', ...extra });
let a = mk('p1', 'maestro'); track(a, (x) => !!getAgent(x));
assert.equal(a.retorno, 'aguardando'); assert.equal(a.from, 'maestro'); assert.ok(a.sentAt);
let b = mk('p0', 'agente'); track(b, (x) => !!getAgent(x));
assert.equal(b.retorno, undefined); // remetente que não é do Escritório não recebe retorno
let c = mk('p9', 'maestro', { state: 'failed' }); track(c, () => true);
assert.equal(c.retorno, undefined);

// ---- 2) watcher: espera o terminal ficar ocioso (2 verificações) e o turno terminar
const delivered = [];
const reqs = [a];
let agents = [{ id: 'x:1', status: 'working', sessionId: 's1' }];
let reply = { ok: true, texto: 'Pronto: alterei o arquivo A.', concluido: true };
const deps = () => ({ requests: reqs, agents, read: () => reply, deliver: (to, text, meta, wake) => { delivered.push({ to, text, meta, wake }); return receiveReturn(to, text, meta, wake); }, save: () => {}, now: () => Date.now() });
await tick(deps()); assert.equal(delivered.length, 0); // trabalhando
agents = [{ id: 'x:1', status: 'idle', sessionId: 's1' }];
await tick(deps()); assert.equal(delivered.length, 0); // 1ª verificação ociosa
reply = { ok: true, texto: 'Pronto: alterei o arquivo A.', concluido: false };
await tick(deps()); assert.equal(delivered.length, 0); // ocioso mas turno ainda aberto
reply = { ok: true, texto: 'Pronto: alterei o arquivo A.', concluido: true };
await tick(deps());
assert.equal(delivered.length, 1); assert.equal(delivered[0].to, 'maestro'); assert.equal(delivered[0].wake, true);
assert.ok(delivered[0].text.includes('pedido p1') && delivered[0].text.includes('Marcelo') && delivered[0].text.includes('Pronto: alterei o arquivo A.'));
assert.equal(a.retorno, 'entregue');
await tick(deps()); assert.equal(delivered.length, 1); // não entrega duas vezes

// ---- 3) o remetente é acordado e responde sozinho (novo turno com o Claude falso)
const h = await until(() => { const m = history('maestro'); return m.length >= 2 && m.at(-1).who === 'agent' ? m : null; }, 'remetente acordado respondeu');
assert.equal(h[0].who, 'user'); assert.equal(h[0].auto, 'terminal'); assert.equal(h[0].pedidoId, 'p1');
assert.ok(h.at(-1).text.startsWith('[claude]') && h.at(-1).text.includes('RETORNO AUTOMÁTICO'));

// ---- 4) resposta longa: resumo + arquivo com o texto completo; segredos omitidos
const longa = 'Parágrafo importante.\n\n' + 'Linha de relatório com várias palavras. '.repeat(120) + ' token sk-ant-api03-ABCDEFGHIJKLMNOP FIM-LONGA';
const l = mk('p2', 'maestro'); track(l, () => true); reqs.length = 0; reqs.push(l);
reply = { ok: true, texto: longa, concluido: true };
await tick(deps()); await tick(deps());
const msg = delivered.at(-1).text;
assert.ok(msg.includes('Resumo:') && !msg.includes('FIM-LONGA') && msg.includes('retorno-p2.md'));
const file = path.join(tmp, 'data', 'run', 'respostas', 'retorno-p2.md');
const body = fs.readFileSync(file, 'utf8');
assert.ok(body.includes('FIM-LONGA') && !body.includes('sk-ant-api03'));
await until(() => history('maestro').length >= 4, 'segundo despertar');

// ---- 5) limite por noite (3): o 4º entrega a mensagem mas NÃO acorda, e tudo fica no log com data/hora
for (const id of ['p3', 'p4']) {
  const r = mk(id, 'maestro'); track(r, () => true); reqs.length = 0; reqs.push(r); reply = { ok: true, texto: `resposta ${id}`, concluido: true };
  await tick(deps()); await tick(deps());
}
assert.equal(delivered.at(-2).wake, true); // 3º despertar
assert.equal(delivered.at(-1).wake, false); // 4º: acima do teto
const agentReplies = () => history('maestro').filter((m) => m.who === 'agent').length;
await until(() => agentReplies() === 3, 'três despertares respondidos'); // um por retorno que acordou
await new Promise((r) => setTimeout(r, 500));
assert.equal(agentReplies(), 3); // o 4º retorno ficou só registrado: ninguém foi acordado
assert.equal(history('maestro').filter((m) => m.auto === 'terminal').length, 4);
const log = readLog();
assert.equal(log.length, 4); assert.ok(log.every((e) => !Number.isNaN(Date.parse(e.at)) && e.pedidoId && e.para === 'maestro'));
assert.equal(log.filter((e) => e.acordou).length, 3); assert.match(log.at(-1).motivo, /limite/); assert.equal(log.at(-1).resultado, 'entregue_sem_acordar');

// ---- 6) dois pedidos ao mesmo terminal: o segundo espera o primeiro e usa a janela depois dele
const T0 = Date.now() - 10_000;
const r1 = mk('q1', 'maestro', { sentAt: T0 }), r2 = mk('q2', 'maestro', { sentAt: T0 + 5000 });
r1.retorno = r2.retorno = 'aguardando';
const calls = [];
await tick({ requests: [r2, r1], agents, read: (s, desde, ate) => { calls.push([desde, ate]); return { ok: true, texto: 'ok', concluido: true }; }, deliver: () => ({ ok: true }), save: () => {}, now: () => Date.now() });
await tick({ requests: [r2, r1], agents, read: (s, desde, ate) => { calls.push([desde, ate]); return { ok: true, texto: 'ok', concluido: true }; }, deliver: () => ({ ok: true }), save: () => {}, now: () => Date.now() });
assert.equal(r1.retorno, 'entregue_sem_acordar'); assert.equal(r2.retorno, 'aguardando'); assert.deepEqual(calls[0], [T0 - 1000, T0 + 4000]);
// ---- 7) pedido antigo (12 h sem resposta) é encerrado sem entregar
const velho = mk('q3', 'maestro', { sentAt: 1 }); velho.retorno = 'aguardando';
await tick({ requests: [velho], agents, read: () => ({ ok: true, texto: 'x', concluido: true }), deliver: () => assert.fail('não deve entregar'), save: () => {}, now: () => 13 * 3600_000 });
assert.equal(velho.retorno, 'sem_retorno');

// ---- 8) leitura real do transcript: só texto do agente depois do instante do pedido
const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const dir = path.join(home, '.claude', 'projects', 'proj'); fs.mkdirSync(dir, { recursive: true });
const rec = (type, content, ts) => JSON.stringify({ type, timestamp: new Date(ts).toISOString(), message: { role: type, content } });
fs.writeFileSync(path.join(dir, `${SID}.jsonl`), [
  rec('assistant', [{ type: 'text', text: 'resposta antiga' }], 1_000_000), rec('user', 'pedido novo', 2_000_000),
  rec('assistant', [{ type: 'text', text: 'Resposta final do pedido novo.' }], 2_005_000),
].join('\n') + '\n');
const lr = lastReplySince(SID, 1_999_000);
assert.deepEqual([lr.ok, lr.texto, lr.concluido], [true, 'Resposta final do pedido novo.', true]);
assert.equal(lastReplySince(SID, 3_000_000).texto, '');
assert.ok(buildMessage({ item: mk('z', 'maestro'), text: 'curta', file: '' }).startsWith('[Retorno automático · pedido z · terminal Marcelo]'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('retorno-check: ok');
process.exit(0);
