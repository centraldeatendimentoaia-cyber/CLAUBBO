// Uso das contas (janela de 5 horas e semanal). Vem dos eventos de limite que o próprio Claude Code emite a cada
// execução (stream-json): nada de ler token, nada de chamar endpoint à parte. Guardado em data/usage.json.
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

const file = () => path.join(config.data, 'usage.json');

/** `windows` = unifiedWindows do evento: { five_hour: { utilization 0..1, resetsAt segundos }, seven_day: {...} }. */
export function recordUsage(accountId, windows) {
  if (!windows || typeof windows !== 'object') return;
  const conv = (w) => (w && typeof w.utilization === 'number' ? { utilization: Math.round(Math.min(1, Math.max(0, w.utilization)) * 100), resetsAt: w.resetsAt ? w.resetsAt * 1000 : undefined } : undefined);
  const entry = { fiveHour: conv(windows.five_hour), sevenDay: conv(windows.seven_day), at: Date.now() };
  if (!entry.fiveHour && !entry.sevenDay) return;
  const all = readJson(file(), {});
  all[accountId] = entry;
  writeJson(file(), all);
}

/** Uso mais recente de uma conta (ou de todas). Janelas já vencidas deixam de valer: a utilização volta a ser desconhecida. */
export function usageOf(accountId) {
  const e = readJson(file(), {})[accountId];
  if (!e) return undefined;
  const now = Date.now();
  const live = (w) => (w && (!w.resetsAt || w.resetsAt > now) ? w : undefined);
  const out = { fiveHour: live(e.fiveHour), sevenDay: live(e.sevenDay), at: e.at };
  return out.fiveHour || out.sevenDay ? out : undefined;
}
