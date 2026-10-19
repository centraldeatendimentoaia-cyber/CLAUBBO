// Custo por agente: cada resposta do Claude informa o gasto (total_cost_usd); aqui ele é somado por dia e por agente
// (data/costs.json, últimos 62 dias) e o dono pode pôr um limite diário (data/cost-limits.json). Passou do limite, o
// agente para de responder até o dia seguinte. O Codex não informa custo, então não entra na conta.
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

const KEEP_DAYS = 62;
const costsFile = () => path.join(config.data, 'costs.json');
const limitsFile = () => path.join(config.data, 'cost-limits.json');
export const dayOf = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const round = (n) => Math.round(n * 10000) / 10000;

/** Soma o gasto de uma resposta. Sem id de agente, sem valor ou valor inválido: ignora. */
export function recordCost(agentId, usd, now = Date.now()) {
  const v = Number(usd);
  if (!agentId || !Number.isFinite(v) || v <= 0) return;
  const all = readJson(costsFile(), {});
  const day = (all[dayOf(now)] ??= {});
  const cur = (day[agentId] ??= { usd: 0, turns: 0 });
  cur.usd = round(cur.usd + v);
  cur.turns += 1;
  for (const k of Object.keys(all).sort().slice(0, -KEEP_DAYS)) delete all[k];
  writeJson(costsFile(), all);
}

export const getLimits = () => { const l = readJson(limitsFile(), {}); return { default: Number(l.default) > 0 ? Number(l.default) : 0, agents: l.agents && typeof l.agents === 'object' ? l.agents : {} }; };

/** `default` = limite diário (US$) de todo agente sem limite próprio; 0 = sem limite. `agents` = { id: US$ }. */
export function setLimits(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, status: 400, error: 'formato inválido' };
  const money = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(round(n), 100000) : 0; };
  const cur = getLimits();
  const next = { default: input.default !== undefined ? money(input.default) : cur.default, agents: { ...cur.agents } };
  if (input.agents && typeof input.agents === 'object') for (const [id, v] of Object.entries(input.agents)) { const n = money(v); if (n) next.agents[id] = n; else delete next.agents[id]; }
  writeJson(limitsFile(), next);
  return { ok: true, limits: next };
}

/** Gasto de hoje e do mês por agente. */
export function costSummary(now = Date.now()) {
  const all = readJson(costsFile(), {});
  const today = all[dayOf(now)] ?? {};
  const month = {};
  const prefix = dayOf(now).slice(0, 7);
  for (const [d, agents] of Object.entries(all)) if (d.startsWith(prefix)) for (const [id, c] of Object.entries(agents)) { const m = (month[id] ??= { usd: 0, turns: 0 }); m.usd = round(m.usd + c.usd); m.turns += c.turns; }
  return { today, month, limits: getLimits() };
}

/** Quanto este agente ainda pode gastar hoje, ou null se não há limite. */
export function budgetLeft(agentId, now = Date.now()) {
  const l = getLimits();
  const cap = l.agents[agentId] || l.default;
  if (!cap) return null;
  return round(cap - (readJson(costsFile(), {})[dayOf(now)]?.[agentId]?.usd ?? 0));
}
