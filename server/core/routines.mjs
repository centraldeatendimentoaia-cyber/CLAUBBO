// Rotinas: tarefas na hora certa, descritas em português ("dias úteis às 8h"). A cada 30 s o escritório vê o que está na
// hora e cria a tarefa do agente. Se a conta do agente já passou de 80% da janela de 5 horas, a rotina espera (as
// tarefas que você pede na hora continuam valendo). Pausar, rodar agora e excluir sempre disponíveis.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { addActivity } from './activity.mjs';
import { getAgent } from './agents.mjs';
import { createTask, listTasks } from './tasks.mjs';
import { newId, readJson, writeJson } from './store.mjs';
import { usageOf } from './usage.mjs';
import { award, XP_ROTINA } from './xp.mjs';
import { describeWhen, isDue, parseWhen } from './when.mjs';

const BRAKE_PERCENT = 80;
const file = () => path.join(config.data, 'routines.json');
const loadAll = () => readJson(file(), { routines: [] }).routines || [];
const saveAll = (routines) => writeJson(file(), { routines });
const view = (r, history) => ({ ...r, whenLabel: describeWhen(r.when), ...(history ? { history: history.get(r.id) || [] } : {}) });

// Histórico: uma linha por execução terminada em data/routines-history.jsonl (só acrescenta). A execução é a tarefa que a
// rotina criou; ela entra no arquivo na primeira vez que alguém a vê terminada (tick de 30 s ou abrir a tela).
const HISTORY_SHOWN = 10;
const historyFile = () => path.join(config.data, 'routines-history.jsonl');
const readHistory = () => {
  try {
    return fs.readFileSync(historyFile(), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
};

/** Grava as execuções que terminaram desde a última vez. Devolve quantas linhas entraram. */
export function recordHistory(tasks = listTasks()) {
  const seen = new Set(readHistory().map((e) => e.task));
  const lines = [], premiar = [];
  for (const t of tasks) {
    if (!t.routine || t.state !== 'done' || seen.has(t.id)) continue;
    const ok = !t.error;
    lines.push(JSON.stringify({ routine: t.routine, task: t.id, startedAt: t.startedAt || t.addedAt, finishedAt: t.doneAt || Date.now(), ok, result: String(ok ? t.result ?? '' : t.error).slice(0, 300) }));
    if (ok && t.agent) premiar.push(t);
  }
  if (lines.length) fs.appendFileSync(historyFile(), `${lines.join('\n')}\n`);
  for (const t of premiar) award(`rotina:${t.id}`, t.agent, XP_ROTINA, t.doneAt || Date.now()); // chave única: segunda proteção contra repetir
  return lines.length;
}

/** Últimas 10 execuções por rotina, da mais nova para a mais antiga. */
function historyByRoutine() {
  const by = new Map();
  for (const e of readHistory()) by.set(e.routine, [...(by.get(e.routine) || []), e]);
  for (const [k, v] of by) by.set(k, v.sort((a, b) => b.finishedAt - a.finishedAt).slice(0, HISTORY_SHOWN));
  return by;
}

export function listRoutines() {
  try { recordHistory(); } catch { /* histórico nunca derruba a listagem */ }
  const history = historyByRoutine();
  return loadAll().map((r) => view(r, history));
}

export function createRoutine({ title, agent, text, when }) {
  const a = getAgent(agent);
  if (!a) return { ok: false, status: 404, error: 'agente não encontrado' };
  const body = String(text ?? '').trim().slice(0, 4000);
  if (!body) return { ok: false, status: 400, error: 'descreva o que o agente deve fazer' };
  const w = parseWhen(when);
  if (!w.ok) return { ok: false, status: 400, error: w.error };
  const r = { id: newId(), title: String(title || '').trim().slice(0, 80) || body.split(/\r?\n/)[0].slice(0, 80), agent, text: body, whenText: String(when).trim().slice(0, 120), when: w.when, paused: false, lastRun: 0, createdAt: Date.now() };
  saveAll([...loadAll(), r]);
  return { ok: true, routine: view(r) };
}

export function setPaused(id, paused) {
  const all = loadAll();
  const r = all.find((x) => x.id === id);
  if (!r) return { ok: false, status: 404, error: 'rotina não encontrada' };
  r.paused = !!paused;
  saveAll(all);
  return { ok: true, routine: view(r) };
}

export function removeRoutine(id) {
  const all = loadAll();
  if (!all.some((x) => x.id === id)) return { ok: false, status: 404, error: 'rotina não encontrada' };
  saveAll(all.filter((x) => x.id !== id));
  return { ok: true };
}

function fire(r, reason, at = Date.now()) {
  const res = createTask({ agent: r.agent, text: r.text, routine: r.id });
  if (res.ok) {
    const all = loadAll();
    const mine = all.find((x) => x.id === r.id);
    if (mine) { mine.lastRun = at; mine.lastTask = res.task.id; saveAll(all); }
    addActivity({ kind: 'system', agent: r.agent, text: `Rotina "${r.title}" ${reason}` });
  }
  return res;
}

export function runNow(id) {
  const r = loadAll().find((x) => x.id === id);
  if (!r) return { ok: false, status: 404, error: 'rotina não encontrada' };
  return fire(r, 'rodou agora');
}

/** Vê o que está na hora. `now` é injetável para os testes. Devolve os ids que dispararam. */
export function tick(now = Date.now()) {
  const fired = [];
  for (const r of loadAll()) {
    if (r.paused || !isDue(r.when, r.lastRun, now)) continue;
    const agent = getAgent(r.agent);
    if (!agent) continue;
    const u = usageOf(agent.account || 'principal');
    if (u?.fiveHour && u.fiveHour.utilization >= BRAKE_PERCENT) continue; // freio: espera a janela de 5 h renovar
    if (fire(r, 'disparou', now).ok) fired.push(r.id);
  }
  return fired;
}

let timer = null;
/** `extra` (opcional) roda no mesmo relógio de 30 s: o monitor de sistemas pega carona aqui. */
export function startScheduler(extra) {
  if (timer) return;
  timer = setInterval(() => {
    try { recordHistory(); tick(); } catch { /* uma rotina com defeito não derruba o servidor */ }
    if (extra) Promise.resolve().then(extra).catch(() => { /* o monitor nunca derruba o servidor */ });
  }, 30_000);
  timer.unref?.();
}
