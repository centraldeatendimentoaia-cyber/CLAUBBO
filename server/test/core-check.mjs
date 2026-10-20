// Teste do núcleo do Escritório v2 com um Claude e um Codex falsos (nada de rede, nada de crédito).
// Roda com: node server/test/core-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-core-'));
const home = path.join(tmp, 'home');
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{}'); // conta principal "conectada" (conteúdo nunca é lido)
Object.assign(process.env, {
  V2_DATA: path.join(tmp, 'data'), V2_BRAIN: path.join(tmp, 'brain'), V2_HOME: home,
  V2_CLAUDE_BIN: process.execPath, V2_CLAUDE_PRE: JSON.stringify([path.join(here, 'fake-claude.mjs')]),
  V2_CODEX_BIN: process.execPath, V2_CODEX_PRE: JSON.stringify([path.join(here, 'fake-codex.mjs')]), V2_CONCURRENCY: '2',
});
fs.mkdirSync(path.join(tmp, 'brain', 'Escritorio de Agentes', 'skills', 'pesquisa'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'brain', 'Escritorio de Agentes', 'skills', 'pesquisa', 'SKILL.md'), '---\nname: pesquisa\ndescription: como pesquisar\nagents: [ana]\n---\nPesquise antes de escrever.\n');
fs.writeFileSync(path.join(tmp, 'brain', 'CLAUDE.md'), 'Salão de beleza em Natal.');

const { createAgent, getAgent, updateAgent } = await import('../core/agents.mjs');
const { codexStatus, createAccount, listAccounts, removeAccount } = await import('../core/accounts.mjs');
const { history, sendMessage } = await import('../core/chat.mjs');
const { createTask, listTasks } = await import('../core/tasks.mjs');
const { createMeeting, getMeeting, stepToTask } = await import('../core/meetings.mjs');
const { listMcpServers, toolsFor } = await import('../core/runner.mjs');
const { BRAIN_DIR, systemFor } = await import('../core/brain.mjs');
assert.ok(fs.existsSync(path.join(tmp, 'brain', BRAIN_DIR, 'skills', 'pesquisa', 'SKILL.md')));
const live = await import('../core/live.mjs');

const until = async (fn, what, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 40)); }
  assert.fail(`tempo esgotado esperando: ${what}`);
};
let n = 0;
const ok = (msg) => console.log(`ok   ${++n}. ${msg}`);

// ---- agentes
assert.equal(createAgent({ id: 'Ana!', name: 'x' }).ok, false);
assert.ok(createAgent({ id: 'ana', name: 'Ana', role: 'Tráfego', tools: ['web', 'meta-ads', 'chrome'], skills: [] }).ok);
assert.ok(createAgent({ id: 'bia', name: 'Bia', role: 'Copy' }).ok);
assert.ok(createAgent({ id: 'cris', name: 'Cris', role: 'Social' }).ok);
assert.equal(createAgent({ id: 'ana', name: 'Ana' }).status, 409);
assert.equal(createAgent({ id: 'dud', account: 'nao-existe' }).ok, false);
ok('agentes: valida, cria e recusa duplicado e conta inexistente');

// ---- ferramentas por agente
const servers = await listMcpServers(true);
assert.deepEqual(servers.map((s) => s.id), ['meta-ads', 'claude_ai_Notion']);
const tools = toolsFor(getAgent('ana'), servers, {});
assert.ok(tools.allowed.includes('mcp__meta-ads__*') && tools.allowed.includes('WebSearch') && tools.chrome);
assert.ok(tools.denied.includes('Bash') && tools.denied.includes('mcp__meta-ads__delete_campaign'));
assert.ok(!tools.allowed.some((t) => t.includes('Notion')));
ok('ferramentas: só as do agente liberadas; Bash e escritas do Meta bloqueados');

// ---- contexto
const sys = systemFor(getAgent('ana'), 'campanha');
assert.ok(sys.includes('Pesquise antes de escrever') && sys.includes('Salão de beleza') && sys.includes('Você é Ana'));
assert.ok(!systemFor(getAgent('bia'), '').includes('Pesquise antes'));
ok('contexto: skill do agente, cérebro e identidade entram; skill de outro agente não');

// ---- chat
assert.equal(sendMessage('ninguem', 'oi').status, 404);
assert.equal(sendMessage('ana', '  ').status, 400);
assert.ok(sendMessage('ana', 'qual o plano?').ok);
await until(() => history('ana').length === 2, 'resposta do chat');
const reply = history('ana')[1];
assert.equal(reply.who, 'agent');
assert.match(reply.text, /^\[claude\] .*qual o plano\?/s);
ok('chat: mensagem do dono e resposta ficam no histórico');

sendMessage('ana', 'revise: use tom mais direto');
await until(() => history('ana').length === 4, 'resposta da revisão');
assert.match(fs.readFileSync(path.join(tmp, 'brain', BRAIN_DIR, 'feedback', 'ana.md'), 'utf8'), /\[regra\] use tom mais direto/);
assert.match(systemFor(getAgent('ana'), ''), /use tom mais direto/);
ok('revise: vira regra durável e entra no contexto seguinte');

// ---- tarefa
const t = createTask({ agent: 'bia', text: 'Escreva 3 títulos para o anúncio de Natal' });
assert.ok(t.ok);
const done = await until(() => listTasks().find((x) => x.id === t.task.id && x.state === 'done'), 'tarefa concluída');
assert.match(done.result, /Escreva 3 títulos|Tarefa do dono/);
assert.ok(fs.existsSync(path.join(tmp, 'brain', 'Entregas', done.note)));
assert.match(history('bia').at(-1).text, /Entrega da tarefa/);
assert.equal(live.current('bia'), undefined);
ok('tarefa: roda, grava a entrega no cérebro e no chat e libera o agente');

process.env.FAKE_FAIL = '1';
const bad = createTask({ agent: 'bia', text: 'vai falhar' });
const failed = await until(() => listTasks().find((x) => x.id === bad.task.id && x.state === 'done'), 'tarefa com erro');
assert.match(failed.error, /erro 3/);
delete process.env.FAKE_FAIL;
ok('tarefa: erro da ferramenta vira aviso, sem derrubar o servidor');

// ---- contas e Codex
assert.deepEqual(listAccounts().map((a) => [a.id, a.state]), [['principal', 'connected'], ['codex', 'disconnected']]);
const extra = createAccount({ name: 'Empresa X', provider: 'codex' });
assert.ok(extra.ok && extra.account.id === 'codex-empresa-x' && extra.account.state === 'disconnected');
assert.equal(createAccount({ name: '', provider: 'claude' }).ok, false);
assert.ok(updateAgent('cris', { account: 'codex-empresa-x' }).ok);
sendMessage('cris', 'oi');
await until(() => history('cris').length === 2, 'erro de conta sem login');
assert.match(history('cris')[1].text, /não está conectada.*codex login/s);
assert.deepEqual((await codexStatus(extra.account)).loggedIn, false);
assert.equal(listAccounts().find((a) => a.id === 'codex-empresa-x').cli.installed, true);
fs.writeFileSync(path.join(extra.account.configDir, 'auth.json'), '{}');
sendMessage('cris', 'agora vai');
await until(() => history('cris').length === 4, 'resposta do Codex');
assert.match(history('cris')[3].text, /^\[codex\] .*home=.*codex-empresa-x/s);
assert.equal((await codexStatus(extra.account, true)).loggedIn, true);
process.env.FAKE_CODEX_AUTH_FAIL = '1';
sendMessage('cris', 'sessão caiu');
await until(() => history('cris').length === 6, 'erro de login do Codex');
assert.match(history('cris')[5].text, /codex login/);
delete process.env.FAKE_CODEX_AUTH_FAIL;
assert.equal(removeAccount('codex-empresa-x', ['codex-empresa-x']).status, 409);
assert.equal(removeAccount('principal').status, 400);
ok('contas: Codex e várias contas, cada agente com o login da sua; conta em uso não sai');

const second = createAccount({ name: 'Segunda', provider: 'claude' });
fs.writeFileSync(path.join(second.account.configDir, '.credentials.json'), '{}');
updateAgent('bia', { account: second.account.id });
sendMessage('bia', 'oi segunda');
await until(() => history('bia').some((m) => /cfg=.*segunda/.test(m.text)), 'conta Claude secundária');
ok('contas: o Claude roda com o CLAUDE_CONFIG_DIR da conta do agente');

// ---- reunião
const small = createMeeting({ objective: 'Plano de Natal', participants: ['ana'] });
assert.equal(small.ok, false);
const meet = createMeeting({ objective: 'Plano de Natal', participants: ['ana', 'bia', 'cris'], rounds: 2 });
assert.ok(meet.ok);
await until(() => getMeeting(meet.meeting.id)?.state === 'running', 'reunião em andamento');
await until(() => getMeeting(meet.meeting.id).state === 'done', 'reunião concluída', 15000);
const m = getMeeting(meet.meeting.id);
assert.equal(m.turns.length, 6);
assert.deepEqual(m.turns.slice(0, 3).map((x) => x.agent), ['ana', 'bia', 'cris']);
assert.ok(fs.existsSync(path.join(tmp, 'brain', 'Reunioes', m.note)));
assert.match(fs.readFileSync(path.join(tmp, 'brain', 'Reunioes', m.note), 'utf8'), /\[\[Ana\]\]/);
assert.equal(live.current('ana'), undefined);
ok('reunião: 3 participantes, 2 rodadas, ata com links no cérebro e agentes liberados');

// resumo da ata (decisão + próximos passos) e passo vira tarefa de agente, uma vez só
assert.ok(m.summary && Array.isArray(m.summary.steps), 'a reunião concluída guarda o resumo');
const mf = path.join(tmp, 'data', 'meetings.json');
const saved = JSON.parse(fs.readFileSync(mf, 'utf8'));
Object.assign(saved.find((x) => x.id === m.id), { summary: undefined, minutes: ['## Decisão', 'Fechar a campanha de Natal.', '', '## Próximos passos', '- Bia escreve 3 textos até sexta', '- Revisar o orçamento', '', '## Pontos em aberto', '- verba'].join('\n') });
fs.writeFileSync(mf, JSON.stringify(saved));
const sm = getMeeting(m.id).summary;
assert.deepEqual(sm.decisions, ['Fechar a campanha de Natal.']);
assert.deepEqual(sm.steps.map((x) => [x.id, x.owner]), [['s1', 'bia'], ['s2', '']]);
assert.equal(stepToTask(m.id, 's2', '').status, 400); // sem dono e sem agente escolhido
const made = stepToTask(m.id, 's1', '');
assert.ok(made.ok && made.task.agent === 'bia' && made.task.text.includes('Bia escreve 3 textos') && made.task.text.includes('Plano de Natal'));
assert.equal(stepToTask(m.id, 's1', '').status, 409); // já virou tarefa
assert.equal(getMeeting(m.id).summary.steps[0].task, made.task.id);
assert.equal(stepToTask(m.id, 'zz', 'ana').status, 404);
assert.ok(stepToTask(m.id, 's2', 'ana').ok); // escolhendo o agente
await until(() => listTasks().filter((x) => x.agent === 'bia' || x.agent === 'ana').every((x) => x.state === 'done'), 'tarefas dos passos concluídas');
ok('reunião: resumo com decisões e próximos passos; cada passo vira tarefa de agente uma única vez');

const many = createMeeting({ objective: 'Muitos', participants: Array.from({ length: 21 }, (_, i) => `x${i}`) });
assert.equal(many.ok, false);
ok('reunião: teto de sanidade de 20 participantes, sem limite de 3');

// ---- uso das contas (vem do evento de limite que o Claude emite a cada execução)
const { usageOf } = await import('../core/usage.mjs');
const use = usageOf('principal');
assert.equal(use.fiveHour.utilization, 42);
assert.equal(use.sevenDay.utilization, 10);
ok('uso: janela de 5 h e semanal capturadas do evento de limite, sem ler token');

// ---- "quando" em português
const { parseWhen, describeWhen, isDue } = await import('../core/when.mjs');
const w = (t) => parseWhen(t).when;
assert.deepEqual(w('dias úteis às 8h'), { kind: 'weekly', days: [1, 2, 3, 4, 5], at: '08:00' });
assert.deepEqual(w('toda segunda e quinta às 9h30'), { kind: 'weekly', days: [1, 4], at: '09:30' });
assert.deepEqual(w('todo dia às 7h'), { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], at: '07:00' });
assert.deepEqual(w('aos domingos às 22:00'), { kind: 'weekly', days: [0], at: '22:00' });
assert.deepEqual(w('de hora em hora das 9 às 17'), { kind: 'hourly', every: 1, from: 9, to: 17 });
assert.deepEqual(w('a cada 3 horas das 8 às 20'), { kind: 'hourly', every: 3, from: 8, to: 20 });
assert.deepEqual(w('todo dia 5 às 10h'), { kind: 'monthly', day: 5, at: '10:00' });
assert.equal(parseWhen('às 8h').ok, false);
assert.equal(parseWhen('toda segunda').ok, false);
assert.equal(describeWhen(w('dias úteis às 8h')), 'dias úteis às 08:00');
const segunda = (h, mi = 0) => new Date(2026, 9, 19, h, mi).getTime(); // 19/10/2026 é segunda
assert.equal(isDue(w('dias úteis às 8h'), 0, segunda(8, 5)), true);
assert.equal(isDue(w('dias úteis às 8h'), segunda(8, 1), segunda(8, 5)), false); // já rodou neste horário
assert.equal(isDue(w('dias úteis às 8h'), 0, segunda(7, 59)), false);
assert.equal(isDue(w('dias úteis às 8h'), 0, segunda(15)), false); // computador ligado tarde: não acumula
assert.equal(isDue(w('toda terça às 8h'), 0, segunda(8, 5)), false);
assert.equal(isDue(w('de hora em hora das 9 às 17'), 0, segunda(12, 10)), true);
assert.equal(isDue(w('de hora em hora das 9 às 17'), 0, segunda(20)), false);
ok('quando: dias, horários, hora em hora, mensal, tolerância e "já rodou"');

// ---- rotinas
const { createRoutine, listRoutines, setPaused, tick, removeRoutine } = await import('../core/routines.mjs');
assert.equal(createRoutine({ agent: 'ninguem', text: 'x', when: 'todo dia às 8h' }).status, 404);
assert.equal(createRoutine({ agent: 'bia', text: 'x', when: 'quando der' }).ok, false);
const rt = createRoutine({ agent: 'bia', title: 'Pauta diária', text: 'Sugira o post de hoje', when: 'todo dia às 23h' });
assert.ok(rt.ok && rt.routine.whenLabel === 'todo dia às 23:00');
const before = listTasks().length;
const noite = segunda(23, 30);
assert.deepEqual(tick(noite), [rt.routine.id]);
assert.deepEqual(tick(noite), []); // já rodou neste horário
assert.equal(listTasks().length, before + 1);
assert.equal(listTasks().at(-1).routine, rt.routine.id);
setPaused(rt.routine.id, true);
assert.deepEqual(tick(segunda(23, 40) + 86400_000), []);
setPaused(rt.routine.id, false);
await until(() => listTasks().at(-1).state === 'done', 'tarefa da rotina');
assert.ok(removeRoutine(rt.routine.id).ok && listRoutines().length === 0);
ok('rotinas: dispara na hora, não repete, respeita pausa e vira tarefa do agente');

// ---- liberar ferramentas depois de o agente pedir
const { retryWithTools } = await import('../core/tasks.mjs');
const base = createTask({ agent: 'ana', text: 'Faça algo com o Meta' });
await until(() => listTasks().find((x) => x.id === base.task.id)?.state === 'done', 'tarefa base');
const again = retryWithTools(base.task.id, ['mcp__meta-ads__pause_campaign', 'rm -rf; evil!']);
assert.ok(again.ok);
assert.deepEqual(again.task.allowOnce, ['mcp__meta-ads__pause_campaign']);
await until(() => listTasks().find((x) => x.id === again.task.id)?.state === 'done', 'tarefa refeita');
assert.equal(retryWithTools('nao-existe', []).status, 404);
ok('liberar e refazer: só nomes de ferramenta válidos, só para essa tarefa');

// ---- agente dev: plano → implementação → testes, aprovação em cada etapa, commit no fim
const { execFileSync } = await import('node:child_process');
const { setProjectResolver, approve, reject } = await import('../core/tasks.mjs');
const proj = path.join(tmp, 'projeto');
fs.mkdirSync(proj, { recursive: true });
const gitIn = (...a) => execFileSync('git', a, { cwd: proj, encoding: 'utf8' });
gitIn('init', '-q');
gitIn('config', 'user.email', 't@t.t');
gitIn('config', 'user.name', 'teste');
fs.writeFileSync(path.join(proj, 'feature.txt'), 'inicio\n');
gitIn('add', '-A');
gitIn('commit', '-q', '-m', 'inicial');
setProjectResolver((room) => (room === 'sala-dev' ? proj : ''));
assert.ok(createAgent({ id: 'dev1', name: 'Dev', type: 'dev', room: 'sala-dev' }).ok);
assert.match(createTask({ agent: 'dev1', text: 'sem sala', room: 'nenhuma' }).error, /pasta do projeto/);
const dv = createTask({ agent: 'dev1', text: 'Acrescente uma linha ao feature.txt' });
assert.ok(dv.ok);
const at = (stage) => until(() => { const x = listTasks().find((y) => y.id === dv.task.id); return x?.state === 'waiting' && x.dev.stage === stage && x.dev.awaiting && x; }, `etapa ${stage}`);
let cur = await at('plan');
assert.equal(fs.readFileSync(path.join(proj, 'feature.txt'), 'utf8'), 'inicio\n'); // plano não altera nada
assert.equal(cur.diff, undefined);
assert.equal((await approve(dv.task.id)).ok, true);
cur = await at('implement');
assert.match(cur.diff.stat, /feature\.txt/);
assert.match(fs.readFileSync(path.join(proj, 'feature.txt'), 'utf8'), /linha nova/);
assert.ok(reject(dv.task.id, 'faça menor').ok);
assert.notEqual(listTasks().find((y) => y.id === dv.task.id).state, 'waiting'); // voltou para a fila
cur = await at('implement');
assert.match(cur.dev.stages.find((s) => s.stage === 'implement').text, /recusado=faça menor/); // o pedido do dono chega ao agente
assert.equal((await approve(dv.task.id)).ok, true);
await at('test');
const fin = await approve(dv.task.id);
assert.ok(fin.ok && /^[0-9a-f]{7,}$/.test(fin.commit));
assert.equal(listTasks().find((y) => y.id === dv.task.id).state, 'done');
assert.match(gitIn('log', '-1', '--format=%s'), /^Escritório: Acrescente uma linha/);
assert.equal(gitIn('status', '--porcelain').trim(), '');
assert.equal((await approve(dv.task.id)).status, 409); // nada mais esperando
ok('agente dev: plano sem alterar nada, diff antes do OK, recusa refaz, commit no fim, sem push');

fs.appendFileSync(path.join(proj, 'feature.txt'), 'sujeira\n');
const dirty = createTask({ agent: 'dev1', text: 'Com o repositório sujo' });
const dirtyDone = await until(() => listTasks().find((y) => y.id === dirty.task.id && y.state === 'done'), 'tarefa dev com repositório sujo');
assert.match(dirtyDone.error, /alterações não commitadas/);
ok('agente dev: repositório com alterações é recusado antes de começar');

// ---- catálogo e ficha da empresa
const { hire, listCatalog, loadCatalog } = await import('../core/catalog.mjs');
const { getCompany, setCompany } = await import('../core/company.mjs');
const cat = [
  { id: 'copy-pro', name: 'Copy Pro', role: 'Copywriter', does: 'Escreve anúncios', brief: 'Escreva curto.', category: 'marketing', tools: ['web'], model: 'opus' },
  { id: 'copy-pro', name: 'Duplicado', role: 'x' }, { id: 'Sem Id!', name: 'x', role: 'y' }, { name: 'sem id', role: 'y' },
  { id: 'dev-x', name: 'Dev X', role: 'Dev', type: 'dev', system: { type: 'local', command: 'calc' }, costume: 'jmal' },
];
assert.deepEqual(loadCatalog(cat).map((c) => c.id), ['copy-pro', 'dev-x']); // inválidos e repetidos saem
assert.ok(!('system' in loadCatalog(cat)[1]) && !('costume' in loadCatalog(cat)[1])); // catálogo nunca traz sistema nem fantasia
assert.equal(hire('nao-existe', {}, cat).status, 404);
const hired = hire('copy-pro', { name: 'Copy da Casa' }, cat);
assert.ok(hired.ok && hired.agent.name === 'Copy da Casa' && hired.agent.model === 'opus' && hired.agent.brief === 'Escreva curto.' && hired.agent.tools.includes('web'));
assert.equal(hire('copy-pro', {}, cat).status, 409); // já contratado
assert.ok(listCatalog(cat).find((c) => c.id === 'copy-pro').hired);
assert.ok(setCompany({ name: 'Salão Lavi', tone: 'acolhedor e direto', rules: 'nunca prometer desconto', extra: 'ignorado' }).ok);
assert.equal(getCompany().name, 'Salão Lavi');
assert.ok(!('extra' in getCompany()));
const sysCo = systemFor(getAgent('copy-pro'), '');
assert.ok(sysCo.includes('Salão Lavi') && sysCo.includes('acolhedor e direto') && sysCo.indexOf('# A empresa') < sysCo.indexOf('# Instruções fixas'));
assert.equal(setCompany([]).ok, false);
const { costSummary, setLimits } = await import('../core/costs.mjs');
assert.ok(sendMessage('copy-pro', 'oi').ok);
await until(() => history('copy-pro').some((x) => x.who === 'agent'), 'resposta do agente contratado');
const spent = costSummary().today['copy-pro'];
assert.ok(spent && spent.usd > 0 && spent.turns === 1, 'o gasto da resposta foi somado');
assert.ok(setLimits({ agents: { 'copy-pro': 0.0005 } }).ok);
assert.ok(sendMessage('copy-pro', 'de novo').ok);
await until(() => history('copy-pro').some((x) => x.error && /limite de gasto/.test(x.text)), 'freio de gasto do dia');
assert.equal(costSummary().today['copy-pro'].turns, 1, 'sem gasto novo quando o limite barra');
setLimits({ agents: { 'copy-pro': 0 } });
ok('custos: gasto somado por agente, limite diário barra a resposta e some ao zerar o limite');
ok('catálogo: contrata com tudo preenchido, recusa repetido/inválido, sem sistema nem fantasia; ficha da empresa entra no contexto de todo agente');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nnúcleo: ${n} verificações passaram`);
process.exit(0);
