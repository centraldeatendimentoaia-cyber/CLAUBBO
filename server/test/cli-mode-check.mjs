// Teste do modo de aprovação dos pedidos aos terminais: bridge real em outra porta, dados temporários e um Claubbo falso.
// Roda com: node server/test/cli-mode-check.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Detecção de pedido sensível: proibições ("não publicar") e verbos de código ("remova o conceito") não retêm; ordens reais retêm.
const { manualReason } = await import('../core/cli-mode.mjs');
for (const t of ['Limites: não publicar, não fazer deploy, não apagar arquivos.', 'Remova o conceito de limite máximo do app e salve, excluindo o campo antigo.', 'Redefinir não apaga blocos nem dados do usuário.', 'o público-alvo vê a publicidade', 'sem apagar nada, rode os testes']) assert.equal(manualReason(t), null, t);
for (const t of ['não faça deploy agora, mas publique a página', 'não deixe de fazer deploy', 'nunca publique; depois apague a pasta', 'apague tudo', 'Limites: não publicar. Pague o boleto']) assert.ok(manualReason(t), t);

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp =fs.mkdtempSync(path.join(os.tmpdir(), 'v2-mode-'));
// Portas livres escolhidas pelo sistema: duas execuções ao mesmo tempo (ex.: dois agentes rodando o check) não colidem.
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const HAB_PORT = await freePort(), PORT = await freePort(), BASE = `http://127.0.0.1:${PORT}`;
const delivered = [];
let habStatus = 'working'; // estado do terminal falso
const SID = 'cccccccc-1111-2222-3333-444444444444';
const hab = http.createServer((req, res) => {
  let body = ''; req.on('data', (d) => (body += d));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/snapshot') return res.end(JSON.stringify({ rooms: [{ id: 'r1', name: 'sala' }], accounts: [], agents: [{ id: 'x:1', name: 'Teste', roomId: 'r1', status: habStatus, canMessage: true, account: 'x', sessionId: SID }], meta: {} }));
    if (req.url === '/api/messages' && req.method === 'POST') { delivered.push(JSON.parse(body).text); res.statusCode = 201; return res.end(JSON.stringify({ id: `m${delivered.length}` })); }
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((r) => hab.listen(HAB_PORT, '127.0.0.1', r));
fs.mkdirSync(path.join(tmp, '.claude', 'projects', 'p'), { recursive: true });
fs.writeFileSync(path.join(tmp, '.claude', '.credentials.json'), '{}');
const startBridge = () => spawn(process.execPath, [path.join(here, '..', 'bridge.mjs')], {
  env: { ...process.env, BRIDGE_PORT: String(PORT), CLAUBBO_URL: `http://127.0.0.1:${HAB_PORT}`, V2_DATA: path.join(tmp, 'data'), V2_HOME: tmp, V2_BRAIN: path.join(tmp, 'brain'), V2_CLAUDE_BIN: process.execPath, V2_CLAUDE_PRE: JSON.stringify([path.join(here, 'fake-claude.mjs')]), V2_CONFIRMACAO: 'sim' }, // sem janela do Windows no teste
  stdio: 'ignore',
});
let child = startBridge();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitBridge = async () => { for (let i = 0; i < 40; i++) { const r = await call('/api/cli/agents').catch(() => null); if (r?.body.agents?.length) return; await sleep(300); } };
const call = async (p, opts = {}) => { const r = await fetch(BASE + p, opts); return { status: r.status, body: await r.json().catch(() => ({})) }; };
// tokens da instalação (data/acesso.json): a página manda o seu junto com o Origin; sem Origin quem fala é um agente (servidor MCP)
const tok = (k) => { try { return JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'acesso.json'), 'utf8'))[k]; } catch { return ''; } };
const post = (p, body, origin) => call(p, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin, 'x-v2-token': tok('pagina') } : { 'x-v2-agente': tok('agentes') }) }, body: JSON.stringify(body) });
const ask = (text) => post('/api/cli/requests', { agentId: 'x:1', text, from: 'maestro-dev' });
try {
  for (let i = 0; i < 40; i++) { // espera a bridge subir e enxergar o terminal falso
    const r = await call('/api/cli/agents').catch(() => null);
    if (r?.body.agents?.length) break;
    await new Promise((r2) => setTimeout(r2, 300));
  }
  // 0) painel de acompanhamento: conta do terminal (sem conta no snapshot, nome/e-mail nulos; agente inexistente = 404)
  const acc = await call(`/api/agents/${encodeURIComponent("x:1")}/account`);
  assert.equal(acc.status, 200); assert.deepEqual(acc.body, { account: "x", name: null, email: null });
  assert.equal((await call(`/api/agents/${encodeURIComponent("nao:existe")}/account`)).status, 404);
  // 1) padrão: manual, e o pedido espera o clique
  assert.equal((await call('/api/cli/mode')).body.mode, 'manual');
  let r = await ask('rode os testes do projeto');
  assert.equal(r.body.estado, 'esperando_aprovacao'); assert.equal(delivered.length, 0);
  // 2) quem não é a página (agente/curl sem Origin ou com Origin de fora) não troca o modo
  assert.equal((await post('/api/cli/mode', { mode: 'auto' })).status, 403);
  assert.equal((await post('/api/cli/mode', { mode: 'auto' }, 'http://evil.example')).status, 403);
  assert.equal((await call('/api/cli/mode')).body.mode, 'manual');
  assert.equal((await post('/api/cli/mode', { mode: 'xis' }, BASE)).status, 400);
  // 3) a página liga o automático: pedido comum é entregue na hora e registrado em log
  assert.equal((await post('/api/cli/mode', { mode: 'auto' }, BASE)).body.mode, 'auto');
  r = await ask('liste os arquivos da pasta src e resuma');
  assert.equal(r.body.estado, 'enviado_automaticamente'); assert.deepEqual(delivered, ['liste os arquivos da pasta src e resuma']);
  const log = fs.readFileSync(path.join(tmp, 'data', 'cli-auto-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log.length, 1); assert.equal(log[0].agentName, 'Teste'); assert.equal(log[0].text, 'liste os arquivos da pasta src e resuma'); assert.ok(log[0].at);
  // 4) pedidos sensíveis continuam esperando o clique, mesmo no automático
  for (const t of ['faça o deploy do site', 'Publique a nova versão', 'efetue o pagamento da fatura', 'apague os arquivos antigos', 'delete a pasta data', 'rm -rf build', 'faça git push na main', 'exclua o banco de dados', 'pague o boleto']) {
    r = await ask(t);
    assert.equal(r.body.estado, 'esperando_aprovacao', t);
  }
  assert.equal(delivered.length, 1);
  // o log do automático registra também cada retenção, com o motivo e o trecho
  const log2 = fs.readFileSync(path.join(tmp, 'data', 'cli-auto-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log2[0].decisao, 'liberado');
  const heldLog = log2.find((x) => x.text === 'faça o deploy do site');
  assert.equal(heldLog.decisao, 'retido'); assert.equal(heldLog.motivo, 'deploy / publicação'); assert.equal(heldLog.trecho, 'deploy');
  const lista = (await call('/api/cli/requests')).body.requests;
  assert.ok(lista.filter((x) => x.state === 'pending' && x.text !== 'rode os testes do projeto').every((x) => x.manualReason));
  // 5) o clique do João ainda entrega um pedido pendente
  const pend = lista.find((x) => x.state === 'pending' && x.manualReason);
  assert.equal((await post(`/api/cli/requests/${pend.id}/approve`, {}, BASE)).body.state, 'sent'); assert.equal(delivered.length, 2);
  // 6) volta ao manual: tudo espera de novo
  assert.equal((await post('/api/cli/mode', { mode: 'manual' }, BASE)).body.mode, 'manual');
  assert.equal((await ask('liste os arquivos')).body.estado, 'esperando_aprovacao'); assert.equal(delivered.length, 2);
  for (const x of (await call('/api/cli/requests')).body.requests.filter((q) => q.state === 'pending')) await post(`/api/cli/requests/${x.id}/reject`, {}, BASE); // libera a fila (teto de 10 pendentes)
  // 6b) o modo e a lista de escritórios sobrevivem ao reinício do servidor; "não faça push/deploy" não retém, e o retido diz o trecho
  assert.equal((await post('/api/cli/mode', { mode: 'auto' }, BASE)).body.mode, 'auto');
  assert.equal((await post('/api/offices', { name: 'Teste', url: '4601' })).status, 403); // sem a origem da página
  assert.equal((await post('/api/offices', { name: 'Fora', url: 'http://exemplo.com:80' }, BASE)).status, 400);
  assert.equal((await post('/api/offices', { name: 'Teste', url: '4601' }, BASE)).status, 201);
  child.kill(); await sleep(800);
  child = startBridge(); await waitBridge();
  assert.equal((await call('/api/cli/mode')).body.mode, 'auto', 'automático continua ligado depois de reiniciar');
  assert.ok((await call('/api/offices')).body.offices.some((o) => o.name === 'Teste' && o.url === 'http://127.0.0.1:4601'), 'lista de escritórios sobreviveu');
  const before = delivered.length;
  r = await ask('rode os testes. Limites: não faça push/deploy, não apague arquivos.');
  assert.equal(r.body.estado, 'enviado_automaticamente'); assert.equal(delivered.length, before + 1);
  r = await ask('faça o deploy do site');
  assert.equal(r.body.estado, 'esperando_aprovacao'); assert.match(r.body.aviso, /trecho: "deploy"/);
  assert.equal((await call('/api/cli/requests')).body.requests.find((x) => x.id === r.body.pedidoId).manualTrecho, 'deploy');
  assert.equal((await post('/api/cli/mode', { mode: 'manual' }, BASE)).body.mode, 'manual');
  child.kill(); await sleep(800);
  child = startBridge(); await waitBridge();
  assert.equal((await call('/api/cli/mode')).body.mode, 'manual', 'manual continua depois de reiniciar');
  assert.equal((await ask('rode os testes')).body.estado, 'esperando_aprovacao');
  for (const x of (await call('/api/cli/requests')).body.requests.filter((q) => q.state === 'pending')) await post(`/api/cli/requests/${x.id}/reject`, {}, BASE);
  // 7) retorno automático pela bridge real: pedido aprovado -> terminal responde e fica ocioso -> a resposta chega ao remetente e o acorda
  assert.equal((await post('/api/ops/agents', { id: 'maestro-dev', name: 'Maestro Dev', role: 'Chefe' }, BASE)).status, 201);
  r = await post('/api/cli/requests', { agentId: 'x:1', text: 'rode os testes', from: 'maestro-dev' });
  assert.equal(r.body.estado, 'esperando_aprovacao');
  const pid = r.body.pedidoId;
  assert.equal((await post(`/api/cli/requests/${pid}/approve`, {}, BASE)).body.state, 'sent');
  const item = (await call('/api/cli/requests')).body.requests.find((x) => x.id === pid);
  assert.equal(item.from, 'maestro-dev'); assert.equal(item.retorno, 'aguardando'); assert.ok(item.sentAt);
  const rec = (type, content, ts) => JSON.stringify({ type, timestamp: new Date(ts).toISOString(), message: { role: type, content } });
  fs.writeFileSync(path.join(tmp, '.claude', 'projects', 'p', `${SID}.jsonl`), [rec('user', 'rode os testes', Date.now() + 500), rec('assistant', [{ type: 'text', text: 'Testes rodaram: 12 ok, 0 falhas.' }], Date.now() + 900)].join('\n') + '\n');
  habStatus = 'idle';
  let conv;
  for (let i = 0; i < 60; i++) { // a bridge confere a cada 3 s (2 verificações ociosas)
    conv = (await call('/api/conversation/maestro-dev')).body.messages || [];
    if (conv.some((m) => m.who === 'agent')) break;
    await new Promise((r2) => setTimeout(r2, 500));
  }
  assert.ok(conv[0].auto === 'terminal' && conv[0].pedidoId === pid && conv[0].text.includes('Testes rodaram: 12 ok'), 'retorno chegou ao remetente');
  assert.ok(conv.some((m) => m.who === 'agent' && m.text.includes('RETORNO AUTOMÁTICO')), 'remetente foi acordado e respondeu');
  const rlog = fs.readFileSync(path.join(tmp, 'data', 'cli-retorno-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rlog.length, 1); assert.equal(rlog[0].pedidoId, pid); assert.equal(rlog[0].acordou, true);
  assert.equal((await call('/api/cli/requests')).body.requests.find((x) => x.id === pid).retorno, 'entregue');
  // 8) terminal ao vivo e histórico do dia (bridge real): chat no teto de 200, autor certo, dia local, sobrevive a reinício
  const { dayKey } = await import('../core/terminal-feed.mjs');
  const chatFile = path.join(tmp, 'data', 'chat', 'maestro-dev.json');
  const base = Date.now() - 2000;
  const mk = (i) => ({ at: base + i * 5, who: i % 2 ? 'agent' : 'user', text: `mensagem ${i} ação ✓` });
  const saveChat = (messages) => { fs.writeFileSync(`${chatFile}.t`, JSON.stringify({ agent: 'maestro-dev', messages })); fs.renameSync(`${chatFile}.t`, chatFile); };
  let chatMsgs = Array.from({ length: 200 }, (_, i) => mk(i));
  saveChat(chatMsgs);
  const readSse = (url, events, ctl) => (async () => {
    const res = await fetch(BASE + url, { signal: ctl.signal });
    const dec = new TextDecoder();
    let buf = '';
    for await (const c of res.body) {
      buf += dec.decode(c, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) { const m = /^event: (\w+)\ndata: (.*)$/s.exec(part); if (m) events.push({ type: m[1], data: JSON.parse(m[2]) }); }
    }
  })().catch(() => {});
  const until = async (fn, label) => { for (let i = 0; i < 50; i++) { if (fn()) return; await sleep(200); } assert.fail(label); };
  const events = [];
  const ctl = new AbortController();
  readSse(`/api/agents/${encodeURIComponent('escritorio:maestro-dev')}/terminal`, events, ctl);
  await until(() => events.some((e) => e.type === 'init' && e.data.entries.length === 200), 'init com as 200 mensagens');
  // chega uma mensagem do dono com o chat cheio: a mais antiga sai e a nova tem que aparecer (antes, só aparecia depois de recarregar)
  chatMsgs = [...chatMsgs.slice(1), { at: base + 5000, who: 'user', text: 'nova do dono' }];
  saveChat(chatMsgs);
  await until(() => events.some((e) => e.type === 'append'), 'append da mensagem nova com o chat no teto');
  let appended = events.filter((e) => e.type === 'append').flatMap((e) => e.data);
  assert.equal(appended.length, 1); assert.equal(appended[0].kind, 'user'); assert.equal(appended[0].text, 'nova do dono');
  // retorno automático de terminal: não vira texto do dono
  chatMsgs = [...chatMsgs.slice(1), { at: base + 5001, who: 'user', auto: 'terminal', text: '[Retorno automático · pedido x1 · terminal Aline]\nresultado ok' }];
  saveChat(chatMsgs);
  await until(() => events.filter((e) => e.type === 'append').length >= 2, 'append do retorno automático');
  appended = events.filter((e) => e.type === 'append').flatMap((e) => e.data);
  assert.equal(appended.length, 2); assert.equal(appended[1].kind, 'system'); assert.match(appended[1].detail, /resultado ok/);
  assert.equal(events.filter((e) => e.type === 'init').length, 1, 'o stream não recomeçou nem repetiu mensagens');
  ctl.abort();
  // histórico do dia: a conversa de hoje (aberta -> terminal ao vivo) e a atividade do dia aparecem, pelo dia LOCAL
  const today = dayKey(base);
  const hist = async () => (await call('/api/sessions/recent')).body;
  let sess = (await hist()).sessions;
  const mine = sess.find((s) => s.sessionId === `escritorio-maestro-dev-${today}`);
  assert.ok(mine && mine.open === true && mine.agentId === 'escritorio:maestro-dev' && mine.lastAt >= base, 'conversa de hoje no histórico');
  assert.ok(sess.some((s) => s.sessionId === `escritorio-atividade-${today}`), 'atividade de hoje no histórico');
  const sevents = [];
  const sctl = new AbortController();
  readSse(`/api/sessions/${encodeURIComponent(mine.account)}/${encodeURIComponent(mine.sessionId)}/terminal`, sevents, sctl);
  await until(() => sevents.some((e) => e.type === 'init'), 'conversa do dia aberta pelo histórico');
  const day = sevents.find((e) => e.type === 'init').data.entries;
  assert.equal(day.length, 200); assert.ok(day.every((e, i) => !i || e.at >= day[i - 1].at), 'em ordem de horário');
  sctl.abort();
  assert.equal((await call('/api/sessions/principal/escritorio-maestro-dev-1999-01-01/terminal')).status, 404);
  // o histórico continua depois de reiniciar o servidor (está em disco)
  child.kill(); await sleep(800);
  child = startBridge(); await waitBridge();
  sess = (await hist()).sessions;
  assert.ok(sess.some((s) => s.sessionId === `escritorio-maestro-dev-${today}`) && sess.some((s) => s.sessionId === `escritorio-atividade-${today}`), 'histórico depois do reinício');
  console.log('cli-mode-check: ok');
} finally {
  child.kill(); hab.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(0);
