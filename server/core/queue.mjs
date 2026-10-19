// Fila de execuções: no máximo `concurrency` ao mesmo tempo e uma por agente (o mesmo agente nunca responde duas
// coisas juntas). Prioridade menor roda antes: chat 0, tarefa 1, reunião 2.
import { config } from './config.mjs';

const waiting = [];
const busyAgents = new Set();
let running = 0;

export const PRIORITY = { chat: 0, task: 1, meeting: 2 };

/** Agenda `fn` para o agente. Resolve com o retorno de fn; rejeita com o erro dela. */
export function enqueue(agentId, priority, fn) {
  return new Promise((resolve, reject) => {
    waiting.push({ agentId, priority, fn, resolve, reject, seq: waiting.length });
    pump();
  });
}

function pump() {
  while (running < config.concurrency) {
    const i = waiting.map((w, idx) => [w, idx]).filter(([w]) => !busyAgents.has(w.agentId)).sort((a, b) => a[0].priority - b[0].priority || a[1] - b[1])[0]?.[1];
    if (i === undefined) return;
    const [job] = waiting.splice(i, 1);
    running++;
    busyAgents.add(job.agentId);
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => { running--; busyAgents.delete(job.agentId); pump(); });
  }
}

export const queueSize = () => waiting.length + running;
