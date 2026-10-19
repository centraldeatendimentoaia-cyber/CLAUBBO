// Busca global: uma frase em todas as conversas (data/chat/*.json e data/chat/arquivo/*.jsonl), nas entregas
// (tasks.json) e na atividade (activity.json). Sem acentos e sem diferença de maiúsculas. Segredos óbvios saem do texto
// antes de procurar e antes de devolver (o mesmo redact() do transcript). Credenciais nunca são lidas: só esses quatro lugares.
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './store.mjs';
import { redact } from './transcript.mjs';

export const MIN_QUERY = 2;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SNIPPET_SIDE = 70;
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024; // do arquivo morto lê no máximo o final de 8 MB por agente

/** Minúsculas e sem acento, guardando de qual posição do texto original veio cada letra. */
function fold(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const n = text[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const ch of n) { out += ch; map.push(i); }
  }
  return { out, map };
}

export const foldQuery = (q) => fold(String(q ?? '').trim().replace(/\s+/g, ' ')).out;

/** Trecho de `text` em volta da primeira ocorrência de `needle` (já dobrado). Devolve null se não achar. */
export function snippetOf(text, needle) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const { out, map } = fold(clean);
  const at = out.indexOf(needle);
  if (at < 0) return null;
  const from = map[at];
  const to = (map[at + needle.length - 1] ?? clean.length - 1) + 1;
  const a = Math.max(0, from - SNIPPET_SIDE);
  const b = Math.min(clean.length, to + SNIPPET_SIDE);
  return { before: (a > 0 ? '…' : '') + clean.slice(a, from), match: clean.slice(from, to), after: clean.slice(to, b) + (b < clean.length ? '…' : '') };
}

/**
 * Função pura. `src` = { chat: [{ agent, messages }], archive: [{ agent, messages }], tasks: [], activity: [] },
 * `names` = { agentId -> nome }. Devolve { results, total } com os mais recentes primeiro.
 */
export function searchAll(q, src, names = {}, limit = DEFAULT_LIMIT) {
  const needle = foldQuery(q);
  if (needle.length < MIN_QUERY) return { ok: false, error: `digite pelo menos ${MIN_QUERY} caracteres` };
  const max = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(limit)) || DEFAULT_LIMIT));
  const hits = [];
  const add = (kind, agent, at, raw, extra = {}) => {
    const text = redact(raw).text;
    const snippet = snippetOf(text, needle);
    if (snippet) hits.push({ kind, agent: agent || '', agentName: names[agent] || agent || '', at: Number(at) || 0, snippet, ...extra });
  };
  for (const [kind, list] of [['conversa', src.chat], ['conversa', src.archive]]) {
    for (const c of list || []) for (const m of c.messages || []) if (typeof m?.text === 'string') add(kind, c.agent, m.at, m.text, { who: m.who === 'user' ? 'dono' : 'agente' });
  }
  for (const t of src.tasks || []) {
    const before = hits.length;
    for (const raw of [t.title, t.text, t.result, t.note]) { if (typeof raw === 'string' && raw) add('entrega', t.agent, t.doneAt || t.addedAt, raw, { task: t.id }); if (hits.length > before) break; } // um resultado por tarefa
  }
  for (const a of src.activity || []) if (typeof a?.text === 'string') add('atividade', a.agent, a.at, a.text);
  hits.sort((x, y) => y.at - x.at);
  return { ok: true, total: hits.length, results: hits.slice(0, max) };
}

const lastBytes = (file, max) => {
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, 'r');
  try {
    const start = Math.max(0, size - max);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString('utf8');
    return start > 0 ? text.slice(text.indexOf('\n') + 1) : text; // descarta a linha cortada
  } finally { fs.closeSync(fd); }
};

/** Lê as fontes de `dataDir`. Arquivo estragado é ignorado. */
export function loadSources(dataDir) {
  const chatDir = path.join(dataDir, 'chat');
  const chat = [];
  const archive = [];
  let files = [];
  try { files = fs.readdirSync(chatDir); } catch { /* sem conversas ainda */ }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const j = readJson(path.join(chatDir, f), null);
    if (j && Array.isArray(j.messages)) chat.push({ agent: f.slice(0, -5), messages: j.messages });
  }
  let old = [];
  try { old = fs.readdirSync(path.join(chatDir, 'arquivo')); } catch { /* sem arquivo morto */ }
  for (const f of old) {
    if (!f.endsWith('.jsonl')) continue;
    try {
      const messages = lastBytes(path.join(chatDir, 'arquivo', f), MAX_ARCHIVE_BYTES).split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
      archive.push({ agent: f.slice(0, -6), messages });
    } catch { /* arquivo ilegível */ }
  }
  const tasks = readJson(path.join(dataDir, 'tasks.json'), []);
  const activity = readJson(path.join(dataDir, 'activity.json'), []);
  return { chat, archive, tasks: Array.isArray(tasks) ? tasks : [], activity: Array.isArray(activity) ? activity : [] };
}
