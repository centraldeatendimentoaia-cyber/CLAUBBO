// Reuniões entre agentes: objetivo, participantes (sem limite fixo, só o bom senso de 20) e rodadas (1 a 10). Em cada
// rodada cada participante fala uma vez, em até 120 palavras, vendo o que os outros já disseram. No fim o facilitador
// (o primeiro participante) escreve a ata em Reunioes/. Conversa sem objetivo e sem fim não existe: toda reunião tem
// rodadas contadas e pode ser cancelada.
import path from 'node:path';
import { config } from './config.mjs';
import { addActivity } from './activity.mjs';
import { getAgent } from './agents.mjs';
import { systemFor, writeMinutes } from './brain.mjs';
import { pushMessage } from './chat.mjs';
import { queueMinutes } from './meeting-context.mjs';
import * as live from './live.mjs';
import { enqueue, PRIORITY } from './queue.mjs';
import { runTurn } from './runner.mjs';
import { createTask } from './tasks.mjs';
import { events } from './events.mjs';
import { newId, readJson, writeJson } from './store.mjs';

export const MAX_PARTICIPANTS = 20;
const file = () => path.join(config.data, 'meetings.json');
const loadAll = () => readJson(file(), []);
const saveAll = (m) => writeJson(file(), m.slice(-60));
const controllers = new Map();

const TERMINAL = new Set(['done', 'cancelled', 'error', 'interrupted']);

/** Atualiza a reunião. Uma reunião que já terminou (ou foi cancelada) não muda mais: uma fala ou ata que chegue atrasada não a "ressuscita". */
function update(id, patch) {
  const all = loadAll();
  const m = all.find((x) => x.id === id);
  if (m && !(TERMINAL.has(m.state) && patch.state !== m.state)) {
    Object.assign(m, patch);
    saveAll(all);
  }
  return m;
}

/**
 * Ao ligar o servidor: reunião que estava em andamento (ou na fila, ou escrevendo a ata) perdeu o processo que a tocava e
 * nunca vai terminar. Vira "interrupted", com a hora, e passa a valer a mesma proteção do cancelamento (sem ata, sem nota,
 * sem mensagem; falas atrasadas não a reabrem). Reuniões done, cancelled ou error não mudam. Devolve os ids marcados.
 */
export function interruptRunning(now = Date.now()) {
  const all = loadAll();
  const hit = all.filter((m) => (m.state === 'running' || m.state === 'queued') && !controllers.has(m.id));
  if (!hit.length) return [];
  for (const m of hit) Object.assign(m, { state: 'interrupted', interruptedAt: now, doneAt: now, speaking: '' });
  saveAll(all);
  return hit.map((m) => m.id);
}

const fold = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plain = (t, max) => String(t).replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Resumo curto tirado da ata (que já vem em "## Decisão" e "## Próximos passos"): { decisions[], steps[{ id, text, owner }] }.
 * `owner` = o participante citado no passo (id do agente), ou '' se ninguém for citado. Sem chamar o modelo de novo.
 */
export function buildSummary(minutes, people = []) {
  const sections = [];
  for (const line of String(minutes ?? '').split(/\r?\n/)) {
    const head = /^#{1,4}\s*(.+?)\s*$/.exec(line);
    if (head) sections.push({ key: fold(head[1]), lines: [] });
    else if (sections.length) sections[sections.length - 1].lines.push(line);
  }
  const body = (re) => sections.filter((x) => re.test(x.key)).flatMap((x) => x.lines);
  const item = (l) => /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(l)?.[1];
  const decisions = body(/^decis/).map((l) => plain(item(l) ?? l, 300)).filter(Boolean).slice(0, 5);
  const steps = body(/^proximos passos/).map(item).filter(Boolean).map((t) => plain(t, 400)).filter(Boolean).slice(0, 10)
    .map((text, i) => ({ id: `s${i + 1}`, text, owner: people.find((p) => fold(text).includes(fold(p.name)))?.id ?? '' }));
  return { decisions, steps };
}

const withSummary = (m) => (m.state === 'done' && m.minutes && !m.summary ? { ...m, summary: buildSummary(m.minutes, m.participants.map((id) => getAgent(id)).filter(Boolean)) } : m);
export const listMeetings = () => loadAll().map(withSummary);
export const getMeeting = (id) => { const m = loadAll().find((x) => x.id === id); return m && withSummary(m); };

/** Transforma um "próximo passo" da reunião em tarefa de um agente (o dono da frase, ou o escolhido). Uma vez por passo. */
export function stepToTask(meetingId, stepId, agentId) {
  const all = loadAll();
  const raw = all.find((x) => x.id === meetingId);
  if (!raw) return { ok: false, status: 404, error: 'reunião não encontrada' };
  if (raw.state !== 'done') return { ok: false, status: 409, error: 'a reunião ainda não terminou' };
  const m = withSummary(raw);
  const step = m.summary?.steps.find((x) => x.id === stepId);
  if (!step) return { ok: false, status: 404, error: 'próximo passo não encontrado' };
  if (step.task) return { ok: false, status: 409, error: 'este passo já virou tarefa' };
  const agent = String(agentId || step.owner || '').trim();
  if (!agent) return { ok: false, status: 400, error: 'escolha o agente da tarefa' };
  const r = createTask({ agent, text: `${step.text}\n\n(Próximo passo da reunião: ${m.objective})` });
  if (!r.ok) return r;
  raw.summary = { ...m.summary, steps: m.summary.steps.map((x) => (x.id === stepId ? { ...x, task: r.task.id, agent } : x)) };
  saveAll(all);
  return { ok: true, task: r.task };
}
/** Agentes em reunião agora: { agentId -> { speaking } }. */
export function inMeeting() {
  const out = new Map();
  for (const m of loadAll()) if (m.state === 'running') for (const p of m.participants) out.set(p, { meeting: m.id, speaking: m.speaking === p, objective: m.objective });
  return out;
}

export function createMeeting({ objective, participants, rounds }) {
  const goal = String(objective ?? '').trim().slice(0, 300);
  if (!goal) return { ok: false, status: 400, error: 'diga o objetivo da reunião em uma frase' };
  const ids = [...new Set(Array.isArray(participants) ? participants.map(String) : [])];
  if (ids.length < 2) return { ok: false, status: 400, error: 'escolha ao menos 2 participantes' };
  if (ids.length > MAX_PARTICIPANTS) return { ok: false, status: 400, error: `no máximo ${MAX_PARTICIPANTS} participantes` };
  const missing = ids.filter((id) => !getAgent(id));
  if (missing.length) return { ok: false, status: 404, error: `agente não encontrado: ${missing.join(', ')}` };
  const r = Math.min(10, Math.max(1, Math.trunc(Number(rounds)) || 3));
  const m = { id: newId(), objective: goal, participants: ids, rounds: r, state: 'queued', turns: [], createdAt: Date.now() };
  saveAll([...loadAll(), m]);
  run(m.id).catch((e) => update(m.id, { state: 'error', error: e.message, doneAt: Date.now() }));
  return { ok: true, meeting: m };
}

/** Aprova ou recusa a ata de uma reunião concluída. Só decide uma vez (a decisão já tomada não muda). */
export function decideMinutes(id, decision) {
  const all = loadAll();
  const m = all.find((x) => x.id === id);
  if (!m) return { ok: false, status: 404, error: 'reunião não encontrada' };
  if (m.state !== 'done' || !m.minutes) return { ok: false, status: 409, error: 'a ata ainda não está pronta' };
  if (m.approval) return { ok: false, status: 409, error: 'a ata já foi decidida' };
  if (decision !== 'approved' && decision !== 'rejected') return { ok: false, status: 400, error: 'decisão inválida' };
  Object.assign(m, { approval: decision, approvedAt: Date.now() }); // direto: update() não mexe em reunião encerrada
  saveAll(all);
  return { ok: true };
}

export function cancelMeeting(id) {
  const m = getMeeting(id);
  if (!m) return { ok: false, status: 404, error: 'reunião não encontrada' };
  if (m.state !== 'running' && m.state !== 'queued') return { ok: false, status: 409, error: 'a reunião já terminou' };
  controllers.get(id)?.abort();
  update(id, { state: 'cancelled', doneAt: Date.now(), speaking: '' });
  return { ok: true };
}

/** Espera `p`, mas rejeita na hora se `signal` abortar (a fila pode segurar o pedido; cancelar não espera a vez). */
const abortable = (p, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(new Error('cancelado'));
  signal.addEventListener('abort', () => reject(new Error('cancelado')), { once: true });
  p.then(resolve, reject);
});

const said = (turns) => (turns.length ? turns.map((t) => `${t.name}: ${t.text}`).join('\n\n') : '(ninguém falou ainda)');

async function run(id) {
  const ctl = new AbortController();
  controllers.set(id, ctl);
  const m0 = update(id, { state: 'running', startedAt: Date.now() });
  const people = m0.participants.map((p) => getAgent(p)).filter(Boolean);
  for (const p of people) live.begin(p.id, { kind: 'meeting', text: 'Em reunião', meeting: id });
  addActivity({ kind: 'meeting', text: `Reunião começou: ${m0.objective} (${people.map((p) => p.name).join(', ')})` });
  const alive = () => getMeeting(id)?.state === 'running';
  try {
    for (let round = 1; round <= m0.rounds && alive(); round++) {
      for (const p of people) {
        if (!alive()) break;
        update(id, { speaking: p.id });
        const turns = getMeeting(id).turns;
        const prompt = `Você está numa reunião com ${people.filter((x) => x.id !== p.id).map((x) => `${x.name} (${x.role || 'agente'})`).join(', ')}.\nObjetivo: ${m0.objective}\nRodada ${round} de ${m0.rounds}.\n\nO que já foi dito:\n${said(turns)}\n\nFale agora, uma vez, em no máximo 120 palavras, do ponto de vista do seu papel. Traga algo novo, não repita. Se concordar, diga o que muda na prática.`;
        let text;
        try {
          const r = await abortable(enqueue(p.id, PRIORITY.meeting, () => runTurn({ agent: { ...p, model: p.model || 'sonnet', effort: 'low' }, system: systemFor(p, m0.objective), prompt, signal: ctl.signal })), ctl.signal);
          text = r.text.split(/\s+/).slice(0, 140).join(' ');
        } catch (e) {
          if (!alive()) break;
          text = `(não conseguiu falar: ${e.message})`;
        }
        if (!alive()) break; // cancelada enquanto ele falava: a fala em curso é descartada
        const cur = getMeeting(id);
        if (cur) update(id, { turns: [...cur.turns, { round, agent: p.id, name: p.name, text }] });
        addActivity({ kind: 'meeting', agent: p.id, agentName: p.name, text: `${p.name}: ${text}` });
      }
    }
    if (!alive()) return;
    update(id, { speaking: people[0].id });
    const done = getMeeting(id);
    const scribe = people[0];
    let minutes;
    try {
      const r = await abortable(enqueue(scribe.id, PRIORITY.meeting, () =>
        runTurn({ agent: { ...scribe, model: scribe.model || 'sonnet', effort: 'low' }, system: systemFor(scribe, done.objective), prompt: `Escreva a ata desta reunião.\nObjetivo: ${done.objective}\n\nConversa:\n${said(done.turns)}\n\nFormato: "## Decisão" (uma frase), "## Próximos passos" (lista com responsável e prazo, se houver) e "## Pontos em aberto". Seja curto.`, signal: ctl.signal }),
      ), ctl.signal);
      minutes = r.text;
    } catch {
      if (!alive()) return; // cancelada durante a ata: sem ata, sem mensagem
      minutes = `## Conversa\n\n${said(done.turns)}`;
    }
    if (!alive()) return;
    const note = writeMinutes({ objective: done.objective, participants: people, text: minutes });
    update(id, { state: 'done', doneAt: Date.now(), note: path.basename(note), minutes, summary: buildSummary(minutes, people), speaking: '' });
    pushMessage(scribe.id, 'agent', `Reunião concluída: ${done.objective}\n\n${minutes}`);
    // a ata segue como contexto para TODOS os participantes na próxima mensagem ou tarefa (core/meeting-context.mjs)
    queueMinutes({ id, objective: done.objective, participants: done.participants, doneAt: Date.now(), minutes }, Object.fromEntries(people.map((p) => [p.id, p.name])));
    addActivity({ kind: 'meeting', agent: scribe.id, agentName: scribe.name, text: `Reunião concluída: ${done.objective}` });
    events.emit('meeting_done', { meetingId: id, agent: scribe.name });
  } finally {
    for (const p of people) live.end(p.id);
    controllers.delete(id);
  }
}
