// Botão "Entregas" da barra: o que os agentes terminaram. No Escritório v2 uma entrega é uma tarefa concluída com
// resultado (data/tasks.json). Função pura: recebe tarefas, agentes e salas e devolve DeliveryInfo[] (shared/types.ts),
// da mais nova para a mais antiga.
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';
import { dayKey } from './terminal-feed.mjs';
import { attachmentsOf } from './entregas.mjs';

const MAX = 40;

/** Texto sem markdown de uma linha, para a manchete. */
const plain = (s) => String(s).replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~|-]+/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

/** Primeira frase (até ~160 caracteres). */
function headlineOf(text) {
  const t = plain(text);
  const m = /^(.{20,160}?[.!?])(\s|$)/.exec(t);
  return m ? m[1] : t.slice(0, 160);
}

/** Último parágrafo com texto corrido, como resumo (só quando difere da manchete). */
function summaryOf(text, headline) {
  const paras = String(text).split(/\n\s*\n/).map(plain).filter((p) => p.length > 30);
  const last = paras.at(-1);
  return last && last !== headline && !headline.startsWith(last) ? last.slice(0, 400) : undefined;
}

// Entregas já vistas: data/deliveries-seen.json, { ids: [...] }. Só acrescenta (nunca remove um id).
const seenFile = () => path.join(config.data, 'deliveries-seen.json');
export const loadSeen = () => new Set((readJson(seenFile(), { ids: [] }).ids || []).map(String));
export function markSeen(ids) {
  const clean = (Array.isArray(ids) ? ids : []).map(String).filter((x) => x && x.length <= 200).slice(0, 200);
  const all = loadSeen();
  const fresh = [...new Set(clean)].filter((x) => !all.has(x));
  if (fresh.length) writeJson(seenFile(), { ids: [...all, ...fresh].slice(-2000) });
  return { ok: true, added: fresh.length };
}

/** Arquivos que o agente alterou na tarefa (agente dev: o diff guardado na tarefa); vazio quando não há. */
export function filesOf(t) {
  const out = [];
  for (const block of String(t.diff?.patch ?? '').split(/^diff --git /m).slice(1)) {
    const m = /^a\/(.+?) b\/(.+)$/m.exec(block);
    if (m) out.push({ path: m[2], ...(/^new file mode/m.test(block) ? { created: true } : {}) });
  }
  if (!out.length) for (const m of String(t.diff?.stat ?? '').matchAll(/^\s*(\S.*?)\s+\|\s+\d+/gm)) out.push({ path: m[1] });
  return out.slice(0, 50);
}

export function deliveriesFrom(tasks, agents, rooms, tz, seen = new Set()) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const out = [];
  for (const t of tasks) {
    const attachments = attachmentsOf(t.id);
    if (t.state !== 'done' || t.error || (!String(t.result ?? '').trim() && !attachments.length)) continue;
    const a = byId.get(t.agent);
    const finishedAt = Number(t.doneAt) || Number(t.addedAt) || 0;
    const room = rooms.find((r) => r.id === (t.room || a?.room));
    const text = String(t.result ?? '').trim() || '(arquivos entregues)';
    const headline = headlineOf(text);
    const summary = summaryOf(text, headline);
    const files = filesOf(t);
    out.push({
      id: `escritorio:${t.agent}:${t.id}`, account: a?.account || 'principal', sessionId: a ? `escritorio-${a.id}-${dayKey(finishedAt, tz)}` : `escritorio-${t.agent}-${dayKey(finishedAt, tz)}`,
      ...(a ? { agentId: `escritorio:${a.id}` } : {}), agentName: a?.name ?? t.agent, ...(room ? { project: room.name } : {}),
      request: plain(t.title || t.text).slice(0, 200), headline, ...(summary ? { summary } : {}), text,
      startedAt: Number(t.startedAt) || finishedAt, finishedAt, tools: 0, edited: files.length, attachments, ...(files.length ? { files } : {}), seen: seen.has(`escritorio:${t.agent}:${t.id}`),
    });
  }
  return out.sort((x, y) => y.finishedAt - x.finishedAt).slice(0, MAX);
}
