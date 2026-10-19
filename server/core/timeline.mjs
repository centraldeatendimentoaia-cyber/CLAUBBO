// Linha do tempo do escritório (botão de timelapse): grava o estado do escritório a cada poll em
// data/timeline/AAAA-MM-DD.jsonl (formato de shared/timeline.ts: keyframe a cada 5 min, deltas entre eles, "end" quando o
// servidor para) e serve GET /api/timeline/days e GET /api/timeline/AAAA-MM-DD. Só acrescenta: nenhum arquivo é apagado.
// Os resumos de atividade já saem mascarados por compactSnapshot (sem detalhe de comando, tarefa ou transcript).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { compactSnapshot, dayKey, diffFrames, isDayKey, keyframeOf } from './vendor/timeline.mjs';

export const KEYFRAME_EVERY_MS = 5 * 60_000;
/** Limite de tamanho do arquivo de um dia: passou disso, grava "end" e para até a virada do dia. */
export const DAY_LIMIT_BYTES = 40 * 1024 * 1024;

const dir = () => path.join(config.data, 'timeline');
const fileOf = (day) => path.join(dir(), `${day}.jsonl`);

let prev = null; // último estado gravado
let lastKey = 0; // horário do último keyframe
let curDay = '';
let stopped = false; // dia no limite de tamanho
let booted = false;

function append(day, rec) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.appendFileSync(fileOf(day), `${JSON.stringify(rec)}\n`, 'utf8');
}

const sizeOf = (day) => { try { return fs.statSync(fileOf(day)).size; } catch { return 0; } };

/** Chamado a cada poll com o snapshot completo do escritório. */
export function observeTimeline(snap, now = Date.now(), every = KEYFRAME_EVERY_MS) {
  const day = dayKey(now);
  if (day !== curDay) { curDay = day; prev = null; stopped = false; }
  if (stopped) return;
  if (sizeOf(day) >= DAY_LIMIT_BYTES) { append(day, { t: 'end', at: now, reason: 'limit' }); stopped = true; return; }
  const next = compactSnapshot(snap);
  if (!prev || now - lastKey >= every) {
    append(day, keyframeOf(next, now, every, !booted));
    booted = true; lastKey = now; prev = next;
    return;
  }
  const d = diffFrames(prev, next);
  if (d) append(day, { t: 'd', at: now, ...d });
  prev = next;
}

/** Marca que o servidor parou (a próxima subida começa com um keyframe "boot"). */
export function endTimeline(now = Date.now()) {
  if (!curDay || stopped) return;
  try { append(curDay, { t: 'end', at: now, reason: 'stop' }); } catch { /* saindo: sem o fim marcado */ }
  stopped = true;
}

const atOf = (line) => { try { const n = JSON.parse(line)?.at; return Number.isFinite(n) ? n : null; } catch { return null; } };

/** { recording, days: [{ day, bytes, from, to }] }, do dia mais novo para o mais antigo. */
export function timelineDays() {
  const days = [];
  let names = [];
  try { names = fs.readdirSync(dir()); } catch { /* ainda sem gravação */ }
  for (const n of names) {
    const day = n.replace(/\.jsonl$/, '');
    if (n !== `${day}.jsonl` || !isDayKey(day)) continue;
    const lines = fs.readFileSync(fileOf(day), 'utf8').split('\n').filter((l) => l.trim());
    const from = lines.length ? atOf(lines[0]) : null;
    const to = lines.length ? atOf(lines[lines.length - 1]) : null;
    if (from !== null && to !== null) days.push({ day, bytes: sizeOf(day), from, to });
  }
  return { recording: true, days: days.sort((a, b) => b.day.localeCompare(a.day)) };
}

/** Texto do arquivo do dia, ou null (dia inválido ou sem gravação). */
export function timelineDay(day) {
  if (!isDayKey(day)) return null;
  try { return fs.readFileSync(fileOf(day), 'utf8'); } catch { return null; }
}

/** Só para testes: volta ao estado de processo recém-iniciado. */
export function resetTimeline() { prev = null; lastKey = 0; curDay = ''; stopped = false; booted = false; }
