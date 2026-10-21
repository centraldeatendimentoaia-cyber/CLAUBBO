// Tarefas: o dono descreve em português, escolhe o agente (e, se quiser, a sala), e o agente entrega. A fila respeita o
// limite de execuções simultâneas. A entrega vira mensagem no chat do agente e nota em Entregas/.
//
// Agente do tipo "dev" (mexe em código) segue outro fluxo, com aprovação em cada etapa: plano → implementação → testes.
// Só roda dentro da pasta do projeto da sala (precisa ser um repositório git sem alterações), mostra o diff antes de cada
// aprovação, commita ao final para você poder desfazer e nunca faz push nem deploy.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { addActivity } from './activity.mjs';
import { events } from './events.mjs';
import { getAgent } from './agents.mjs';
import { systemFor, writeDelivery } from './brain.mjs';
import { withMeetingContext } from './meeting-context.mjs';
import { pushMessage } from './chat.mjs';
import * as live from './live.mjs';
import { enqueue, PRIORITY } from './queue.mjs';
import { runTurn } from './runner.mjs';
import { newId, readJson, writeJson } from './store.mjs';

const file = () => path.join(config.data, 'tasks.json');
const loadAll = () => readJson(file(), []);
const saveAll = (tasks) => writeJson(file(), tasks.slice(-300));
const update = (id, patch) => {
  const tasks = loadAll();
  const t = tasks.find((x) => x.id === id);
  if (t) {
    Object.assign(t, patch);
    saveAll(tasks);
  }
  return t;
};
const get = (id) => loadAll().find((x) => x.id === id);
const titleOf = (text) => text.split(/\r?\n/)[0].slice(0, 80);
const TOOL = /^[A-Za-z0-9_*().: -]{1,100}$/;

/** Quem sabe a pasta de projeto de uma sala (a ponte injeta; sala sem pasta devolve vazio). */
let projectOf = () => '';
export const setProjectResolver = (fn) => { projectOf = fn; };

export const listTasks = () => loadAll();

export function createTask({ agent: agentId, text, room, model, effort, routine, allow }) {
  const agent = getAgent(agentId);
  if (!agent) return { ok: false, status: 404, error: 'agente não encontrado' };
  const body = String(text ?? '').trim().slice(0, 8000);
  if (!body) return { ok: false, status: 400, error: 'descreva a tarefa' };
  const allowOnce = (Array.isArray(allow) ? allow : []).map(String).filter((x) => TOOL.test(x)).slice(0, 10);
  const t = { id: newId(), agent: agentId, text: body, title: titleOf(body), room: String(room || ''), state: 'next', addedAt: Date.now(), model: model || '', effort: effort || '', ...(routine ? { routine } : {}), ...(allowOnce.length ? { allowOnce } : {}) };
  if (agent.type === 'dev') {
    const project = projectOf(t.room || agent.room);
    if (!project) return { ok: false, status: 400, error: 'agente dev precisa de uma sala com a pasta do projeto (defina em Construtor > Sala e agentes)' };
    t.project = project;
    t.dev = { stage: 'plan', awaiting: false, stages: [] };
  }
  saveAll([...loadAll(), t]);
  addActivity({ kind: 'task', agent: agentId, agentName: agent.name, room: agent.room, task: t.id, text: `Nova tarefa: ${t.title}` });
  enqueue(agentId, PRIORITY.task, () => (agent.type === 'dev' ? runDev(t.id) : run(t.id))).catch(() => {});
  return { ok: true, task: t };
}

/** Refaz uma tarefa já terminada liberando ferramentas que ficaram bloqueadas (decisão do dono, só para esta tarefa). */
export function retryWithTools(id, allow) {
  const t = get(id);
  if (!t) return { ok: false, status: 404, error: 'tarefa não encontrada' };
  if (t.state !== 'done') return { ok: false, status: 409, error: 'a tarefa ainda não terminou' };
  return createTask({ agent: t.agent, text: t.text, room: t.room, model: t.model, effort: t.effort, allow });
}

async function run(taskId) {
  const t0 = get(taskId);
  if (!t0 || t0.state !== 'next') return; // removida antes da vez
  const agent = getAgent(t0.agent);
  if (!agent) {
    update(taskId, { state: 'done', error: 'o agente foi removido', doneAt: Date.now() });
    return;
  }
  update(taskId, { state: 'doing', startedAt: Date.now() });
  live.begin(agent.id, { kind: 'task', text: t0.title, room: t0.room, task: taskId });
  try {
    const turn = { ...agent, model: t0.model || agent.model, effort: t0.effort || agent.effort };
    const r = await runTurn({ agent: turn, system: withMeetingContext(agent.id, systemFor(agent, t0.text)), prompt: `Tarefa do dono:\n${t0.text}\n\nEntregue o resultado final completo, pronto para uso.`, allowOnce: t0.allowOnce });
    const note = writeDelivery({ agent, title: t0.title, text: r.text });
    update(taskId, { state: 'done', doneAt: Date.now(), result: r.text, note: path.basename(note), modelUsed: r.model, denied: r.denials?.length ? [...new Set(r.denials)] : undefined });
    pushMessage(agent.id, 'agent', `Entrega da tarefa "${t0.title}":\n\n${r.text}`);
    addActivity({ kind: 'task', agent: agent.id, agentName: agent.name, room: agent.room, task: taskId, text: `${agent.name} entregou: ${t0.title}` });
  } catch (e) {
    update(taskId, { state: 'done', doneAt: Date.now(), error: e.message });
    pushMessage(agent.id, 'agent', `A tarefa "${t0.title}" falhou: ${e.message}`, { error: true });
    addActivity({ kind: 'system', agent: agent.id, agentName: agent.name, room: agent.room, task: taskId, text: `${agent.name} falhou em "${t0.title}": ${e.message}` });
  } finally {
    live.end(agent.id);
  }
}

// ---------------------------------------------------------------- agentes dev
const git = (cwd, ...args) =>
  new Promise((resolve, reject) => execFile('git', args, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out, errOut) => (err ? reject(new Error((errOut || err.message).trim().slice(0, 300))) : resolve(out))));

const STAGE_NAME = { plan: 'Plano', implement: 'Implementação', test: 'Testes' };
const NEXT = { plan: 'implement', implement: 'test' };

function stagePrompt(t, stage, feedback) {
  const approvedPlan = t.dev.stages.find((s) => s.stage === 'plan' && s.approved)?.text;
  const base = {
    plan: `Tarefa do dono:\n${t.text}\n\nLeia o projeto e proponha um plano curto e concreto: arquivos que vai mexer, o que muda em cada um e como vai testar. NÃO altere nada ainda.`,
    implement: `Tarefa do dono:\n${t.text}\n\nPlano aprovado:\n${approvedPlan}\n\nAplique o plano agora, só dentro do escopo dele. Rode os testes ou o lint se existirem. Termine resumindo o que mudou.`,
    test: `Tarefa do dono:\n${t.text}\n\nRode os testes e o build do projeto. Se algo falhar por causa da sua mudança, corrija. Reporte o que passou e o que falhou, com os comandos que rodou.`,
  }[stage];
  return feedback ? `${base}\n\nO dono recusou a versão anterior desta etapa. O que ele pediu: ${feedback}` : base;
}

async function runDev(taskId, feedback) {
  const t0 = get(taskId);
  if (!t0 || !t0.dev) return;
  const agent = getAgent(t0.agent);
  if (!agent) return void update(taskId, { state: 'done', error: 'o agente foi removido', doneAt: Date.now() });
  const stage = t0.dev.stage;
  update(taskId, { state: 'doing', startedAt: t0.startedAt || Date.now(), dev: { ...t0.dev, awaiting: false } });
  live.begin(agent.id, { kind: 'task', text: `${STAGE_NAME[stage]}: ${t0.title}`, room: t0.room, task: taskId });
  try {
    if (!fs.existsSync(path.join(t0.project, '.git'))) throw new Error(`"${t0.project}" não é um repositório git: crie o repositório antes (git init) para o commit poder ser desfeito`);
    if (stage === 'plan') {
      const dirty = (await git(t0.project, 'status', '--porcelain')).trim();
      if (dirty) throw new Error('o projeto tem alterações não commitadas: commite ou guarde antes, para o escritório conseguir separar o que o agente mudar');
    }
    const r = await runTurn({ agent, system: withMeetingContext(agent.id, systemFor(agent, t0.text)), prompt: stagePrompt(t0, stage, feedback), dev: { stage, cwd: t0.project } });
    const diff = stage === 'plan' ? undefined : await diffOf(t0.project);
    const cur = get(taskId);
    const stages = [...cur.dev.stages.filter((s) => s.stage !== stage), { stage, text: r.text, approved: false }];
    update(taskId, { state: 'waiting', ...(diff ? { diff } : {}), dev: { ...cur.dev, awaiting: true, stages } });
    pushMessage(agent.id, 'agent', `${STAGE_NAME[stage]} de "${t0.title}" pronto para sua aprovação em Operações > Tarefas.\n\n${r.text}`);
    addActivity({ kind: 'task', agent: agent.id, agentName: agent.name, room: agent.room, task: taskId, text: `${agent.name} espera sua aprovação (${STAGE_NAME[stage].toLowerCase()}): ${t0.title}` });
    events.emit('task_waiting', { taskId, agent: agent.name });
  } catch (e) {
    update(taskId, { state: 'done', doneAt: Date.now(), error: e.message });
    addActivity({ kind: 'system', agent: agent.id, agentName: agent.name, room: agent.room, task: taskId, text: `${agent.name} falhou em "${t0.title}": ${e.message}` });
  } finally {
    live.end(agent.id);
  }
}

async function diffOf(cwd) {
  const stat = (await git(cwd, 'diff', '--stat')).trim();
  const patch = (await git(cwd, 'diff')).slice(0, 20_000);
  return { stat: stat || '(sem alterações)', patch };
}

/** Aprova a etapa em espera: avança; depois dos testes, commita (nunca faz push). */
export async function approve(id) {
  const t = get(id);
  if (!t?.dev || t.state !== 'waiting' || !t.dev.awaiting) return { ok: false, status: 409, error: 'a tarefa não está esperando aprovação' };
  const stage = t.dev.stage;
  const stages = t.dev.stages.map((s) => (s.stage === stage ? { ...s, approved: true } : s));
  if (NEXT[stage]) {
    update(id, { state: 'next', dev: { stage: NEXT[stage], awaiting: false, stages } });
    enqueue(t.agent, PRIORITY.task, () => runDev(id)).catch(() => {});
    return { ok: true };
  }
  update(id, { dev: { ...t.dev, awaiting: false } }); // reserva antes do primeiro await: uma segunda aprovação leva 409 e não comita em dobro
  try {
    await git(t.project, 'add', '-A');
    const staged = (await git(t.project, 'diff', '--cached', '--name-only')).trim();
    let hash = '';
    if (staged) {
      await git(t.project, 'commit', '-m', `Escritório: ${t.title}`);
      hash = (await git(t.project, 'rev-parse', '--short', 'HEAD')).trim();
    }
    update(id, { state: 'done', doneAt: Date.now(), commit: hash, result: stages.map((s) => `## ${STAGE_NAME[s.stage]}\n${s.text}`).join('\n\n'), dev: { ...t.dev, awaiting: false, stages } });
    const agent = getAgent(t.agent);
    addActivity({ kind: 'task', agent: t.agent, agentName: agent?.name ?? '', room: agent?.room ?? '', task: id, text: `Commit ${hash || '(nada a commitar)'}: ${t.title}` });
    return { ok: true, commit: hash };
  } catch (e) {
    update(id, { dev: { ...t.dev, awaiting: true } }); // não commitou: volta a esperar o dono
    return { ok: false, status: 500, error: `não consegui commitar: ${e.message}` };
  }
}

/** Recusa a etapa: o agente refaz a mesma etapa com o que o dono pediu. */
export function reject(id, feedback) {
  const t = get(id);
  if (!t?.dev || t.state !== 'waiting' || !t.dev.awaiting) return { ok: false, status: 409, error: 'a tarefa não está esperando aprovação' };
  const fb = String(feedback ?? '').trim().slice(0, 1000);
  update(id, { state: 'next', dev: { ...t.dev, awaiting: false } });
  enqueue(t.agent, PRIORITY.task, () => runDev(id, fb)).catch(() => {});
  return { ok: true };
}

export function removeTask(id) {
  const tasks = loadAll();
  const t = tasks.find((x) => x.id === id);
  if (!t) return { ok: false, status: 404, error: 'tarefa não encontrada' };
  if (t.state === 'doing') return { ok: false, status: 409, error: 'a tarefa está rodando agora' };
  saveAll(tasks.filter((x) => x.id !== id));
  return { ok: true };
}
