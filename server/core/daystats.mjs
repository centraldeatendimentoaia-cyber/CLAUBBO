// "Meu dia": acumula o tempo dos agentes por status (inclusive "esperando você") a cada poll e responde
// GET /api/stats e GET /api/stats/days. Usa o mesmo acumulador do navegador (shared/daystats.ts, empacotado em
// vendor/daystats.mjs por server/build-shared.mjs). Os dias ficam em data/stats/AAAA-MM-DD.json (dia no fuso do servidor).
// Só acrescenta: nenhum arquivo é apagado; os dias mais antigos que a retenção apenas deixam de aparecer na lista.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';
import {
  canonicalTimeZone, dayKeyOf, daysFromHours, fileDaysForQuery, parseDayFile, parseDayKey, queryDay, RETENTION_DAYS, StatsBook, StatsTracker, systemTimeZone,
} from './vendor/daystats.mjs';

const dir = () => path.join(config.data, 'stats');
const fileOf = (key) => path.join(dir(), `${key}.json`);
const fileTz = systemTimeZone();

const loader = (key) => {
  const raw = readJson(fileOf(key), null);
  return raw ? parseDayFile(raw, key) : null;
};

let book = new StatsBook((t) => dayKeyOf(t, fileTz), loader);
let tracker = new StatsTracker(book, { startedAt: Date.now() });

/** Zera a memória e recomeça (usado pelos testes, que trocam a pasta de dados). */
export function resetStats(startedAt = Date.now()) {
  book = new StatsBook((t) => dayKeyOf(t, fileTz), loader);
  tracker = new StatsTracker(book, { startedAt });
}

/** Alimenta o acumulador com o estado atual do escritório (chame a cada poll). */
export function observeStats(view, now = Date.now()) {
  tracker.observe(view, now);
}

/** Grava os dias que mudaram. Devolve quantos arquivos escreveu. */
export function flushStats() {
  let n = 0;
  for (const d of book.list()) {
    if (!d.dirty) continue;
    writeJson(fileOf(d.key), d.toFile());
    d.dirty = false;
    n++;
  }
  return n;
}

const validTz = (tz) => canonicalTimeZone(String(tz || '')) || systemTimeZone();

/** Dias de arquivo que existem no disco (mais novos primeiro, no máximo a retenção). */
function diskDays() {
  try {
    return fs.readdirSync(dir()).map((f) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1]).filter(Boolean).sort().reverse().slice(0, RETENTION_DAYS);
  } catch { return []; }
}

/** GET /api/stats/days: dias com dados (hoje sempre aparece, mesmo sem dados). */
export function statsDays(tzIn, now = Date.now()) {
  const tz = validTz(tzIn);
  const today = dayKeyOf(now, tz);
  const days = new Set([today]);
  for (const key of new Set([...diskDays(), ...book.list().map((d) => d.key)])) for (const k of daysFromHours(book.day(key).hoursWithData(), tz)) days.add(k);
  return { tz, today, days: [...days].sort().reverse(), demoAvailable: false };
}

/** GET /api/stats?day=AAAA-MM-DD&tz=...: o dia pedido (sem dados vira um dia de zeros). */
export function statsDay(dayIn, tzIn, now = Date.now()) {
  const tz = validTz(tzIn);
  const today = dayKeyOf(now, tz);
  const day = dayIn ? String(dayIn) : today;
  if (!parseDayKey(day)) return { ok: false, status: 400, error: `dia inválido: ${day} (use AAAA-MM-DD)` };
  const datas = fileDaysForQuery(day, tz, fileTz).map((k) => book.day(k));
  return { ok: true, body: { source: 'real', demoAvailable: false, today, serverTime: now, stats: queryDay(datas, day, tz, now) } };
}
