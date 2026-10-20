// Uso das contas (janela de 5 horas e semanal). Vem dos eventos de limite que o próprio Claude Code emite a cada
// execução (stream-json): nada de ler token, nada de chamar endpoint à parte. Guardado em data/usage.json.
import fs from 'node:fs';
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

/** Uso do Codex: o `rate_limits` que ele grava nos arquivos de sessão (<dir>/sessions/AAAA/MM/DD/rollout-*.jsonl).
 *  Só renova enquanto alguma sessão do Codex roda. Lê a cauda dos 3 arquivos mais novos. Sem token, sem rede. */
export function codexUsageOf(dir) {
  try {
    const root = path.join(dir, 'sessions');
    const newest = (d) => fs.readdirSync(d).sort().reverse();
    const files = [];
    for (const y of newest(root)) for (const m of newest(path.join(root, y))) for (const d of newest(path.join(root, y, m))) {
      for (const f of newest(path.join(root, y, m, d))) if (f.endsWith('.jsonl')) files.push(path.join(root, y, m, d, f));
      if (files.length >= 3) break;
    }
    for (const f of files.slice(0, 3).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)) {
      const size = fs.statSync(f).size, len = Math.min(size, 512 * 1024), fd = fs.openSync(f, 'r');
      const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, size - len); fs.closeSync(fd);
      const lines = buf.toString('utf8').split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('"rate_limits"')) continue;
        let rl; try { const j = JSON.parse(lines[i]); rl = j.payload?.rate_limits ?? j.rate_limits; } catch { continue; }
        if (!rl) continue;
        const out = { at: fs.statSync(f).mtimeMs };
        // shortcut: janela ≤ 10 h vira "5h"; qualquer outra (semana, ou mês no plano free) vira "semana", o rótulo da barra.
        for (const w of [rl.primary, rl.secondary]) {
          if (!w || typeof w.used_percent !== 'number') continue;
          const v = { utilization: Math.round(Math.min(100, Math.max(0, w.used_percent))), resetsAt: w.resets_at ? w.resets_at * 1000 : undefined };
          const key = w.window_minutes <= 600 ? 'fiveHour' : 'sevenDay';
          if (!out[key]) out[key] = v;
        }
        const live = (w) => (w && (!w.resetsAt || w.resetsAt > Date.now()) ? w : undefined);
        out.fiveHour = live(out.fiveHour); out.sevenDay = live(out.sevenDay);
        if (out.fiveHour || out.sevenDay) return out;
      }
    }
  } catch { /* sem sessões do Codex: sem números */ }
  return undefined;
}
