// Ata da reunião como contexto garantido dos participantes (sem depender da busca por palavras do cérebro).
// Ao concluir a reunião a ata entra na fila de cada participante do escritório; na próxima mensagem ou tarefa dele ela vai
// junto, uma única vez por reunião (data/meeting-context.json). Só agentes do escritório: terminais [CLI] não recebem nada.
import path from 'node:path';
import { config } from './config.mjs';
import { getAgent } from './agents.mjs';
import { readJson, writeJson } from './store.mjs';

const MAX_PENDING = 3;
const MAX_CHARS = 3000;
const file = () => path.join(config.data, 'meeting-context.json');
const load = () => {
  const d = readJson(file(), {});
  return { pending: d.pending && typeof d.pending === 'object' ? d.pending : {}, delivered: d.delivered && typeof d.delivered === 'object' ? d.delivered : {} };
};
const save = (d) => writeJson(file(), d);
const dateLabel = (t) => new Date(t).toLocaleDateString('pt-BR');

/** Põe a ata na fila de cada participante (só do escritório). Chamar de novo para a mesma reunião não duplica nem reentrega. */
export function queueMinutes({ id, objective, participants, doneAt, minutes }, names = {}) {
  const d = load();
  const who = participants.map((p) => names[p] || p).join(', ');
  let added = 0;
  for (const agentId of participants) {
    if (!getAgent(agentId)) continue;
    const given = d.delivered[id] ?? [];
    const queue = d.pending[agentId] ?? [];
    if (given.includes(agentId) || queue.some((q) => q.meetingId === id)) continue;
    d.pending[agentId] = [...queue, { meetingId: id, objective, date: dateLabel(doneAt || Date.now()), participants: who, minutes: String(minutes).slice(0, MAX_CHARS) }].slice(-MAX_PENDING);
    added++;
  }
  if (added) save(d);
  return added;
}

/** Texto de contexto para o próximo turno do agente ('' se não há ata pendente). Entregar uma vez: depois some da fila. */
export function takeMeetingContext(agentId) {
  const d = load();
  const queue = d.pending[agentId];
  if (!queue?.length) return '';
  delete d.pending[agentId];
  for (const q of queue) d.delivered[q.meetingId] = [...new Set([...(d.delivered[q.meetingId] ?? []), agentId])];
  save(d);
  return queue.map((q) => `# Reunião concluída: ${q.objective}\nData: ${q.date}\nParticipantes: ${q.participants}\n\n${q.minutes}`).join('\n\n');
}

/** system + ata(s) pendentes do agente. */
export const withMeetingContext = (agentId, system) => {
  const ctx = takeMeetingContext(agentId);
  return ctx ? `${system}\n\n# Decisões de reuniões recentes (contexto, já combinado com você)\n${ctx}` : system;
};
