// Agentes criados pelo usuário (data/agents.json). Esta é a fonte da verdade. Formato de cada agente:
//   { id, name, role, does, brief, room, model, effort, account, tools[], skills[], type, appearance, lead, hours, system }
// `hours` = horário de trabalho ({ start, end, days } ou null = sempre em serviço); `system` = sistema do agente (system-config.mjs).
// O provedor (Claude ou Codex) vem da conta escolhida. `room` = id de uma sala do construtor.
import path from 'node:path';
import { config } from './config.mjs';
import { getAccount } from './accounts.mjs';
import { cleanHours } from './hours.mjs';
import { cleanSystem } from './system-config.mjs';
import { readJson, writeJson } from './store.mjs';

const ID = /^[a-z0-9][a-z0-9-]{0,30}$/;
const TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;
const MODELS = ['', 'sonnet', 'opus', 'fable', 'haiku'];
const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max'];
const clip = (v, max) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const list = (v, max) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean).slice(0, max);

/** Peças do boneco vindas do editor do personagem: só chaves conhecidas, valores curtos (cores #rrggbb ou nomes de estilo). */
const PART_KEYS = ['skin', 'hair', 'hairStyle', 'eyes', 'top', 'topAccent', 'topStyle', 'bottom', 'bottomStyle', 'shoes', 'accessory', 'accessoryColor', 'facialHair'];
function cleanParts(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const k of PART_KEYS) if (typeof v[k] === 'string' && /^[#\w-]{1,24}$/.test(v[k])) out[k] = v[k];
  return Object.keys(out).length ? out : null;
}

const file = () => path.join(config.data, 'agents.json');
export const loadAgents = () => (readJson(file(), { agents: [] }).agents || []).map((a) => normalize(a, null, true).agent).filter(Boolean);
export const saveAgents = (agents) => writeJson(file(), { version: 1, agents });
export const getAgent = (id) => loadAgents().find((a) => a.id === id);

/** Valida e normaliza um agente vindo da rede. `base` = agente atual (atualização parcial). */
/** `lenient` = relendo o que já foi salvo: uma pasta de projeto que sumiu não pode fazer o agente desaparecer. */
export function normalize(input, base, lenient = false) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['o agente deve ser um objeto'] };
  const src = { ...(base || {}), ...input };
  const id = String(src.id ?? '').toLowerCase().trim();
  if (!ID.test(id)) errors.push('id: só letras minúsculas, números e hífen (máx. 31)');
  const model = String(src.model ?? '').toLowerCase();
  if (!MODELS.includes(model) && !/^[\w.:/-]{1,64}$/.test(model)) errors.push('model inválido');
  const effort = String(src.effort ?? '').toLowerCase();
  if (!EFFORTS.includes(effort)) errors.push('effort: low, medium, high, xhigh ou max');
  const account = String(src.account ?? '').toLowerCase().trim() || 'principal';
  if (!getAccount(account)) errors.push(`conta "${account}" não existe`);
  const type = src.type === 'dev' ? 'dev' : 'pensador';
  const tools = list(src.tools, 24);
  const skills = list(src.skills, 24);
  for (const t of [...tools, ...skills]) if (!TOKEN.test(t)) errors.push(`nome inválido em tools/skills: "${t.slice(0, 30)}"`);
  const brief = String(src.brief ?? '').trim();
  if (brief.length > 2000) errors.push('brief: no máximo 2000 caracteres (a versão longa vai numa skill)');
  const hours = cleanHours(src.hours);
  if (!hours.ok) errors.push(hours.error);
  const system = cleanSystem(src.system, { checkFolder: !lenient });
  if (!system.ok) errors.push(system.error);
  if (errors.length) return { ok: false, errors };
  const ap = src.appearance && typeof src.appearance === 'object' ? src.appearance : {};
  return {
    ok: true,
    agent: {
      id, name: clip(src.name, 32) || id, role: clip(src.role, 80), does: clip(src.does, 400), brief, room: clip(src.room, 40), model, effort, account, tools, skills, type,
      appearance: { hair: clip(ap.hair, 32), skin: clip(ap.skin, 32), outfit: clip(ap.outfit, 32), color: clip(ap.color, 32) }, lead: src.lead === true, costume: src.costume === 'reaper' || src.costume === 'jmal' ? src.costume : '',
      ...(hours.hours ? { hours: hours.hours } : {}), ...(system.system ? { system: system.system } : {}),
      ...(cleanParts(src.parts) ? { parts: cleanParts(src.parts) } : {}), ...(Number.isInteger(src.seed) && src.seed >= 0 ? { seed: src.seed } : {}),
    },
  };
}

export function createAgent(input) {
  const n = normalize(input, null);
  if (!n.ok) return { ...n, status: 400 };
  const all = loadAgents();
  if (all.some((a) => a.id === n.agent.id)) return { ok: false, status: 409, errors: ['já existe um agente com esse id'] };
  saveAgents([...all, n.agent]);
  return { ok: true, agent: n.agent };
}

export function updateAgent(id, patch) {
  const all = loadAgents();
  const i = all.findIndex((a) => a.id === id);
  if (i < 0) return { ok: false, status: 404, errors: ['agente não encontrado'] };
  const n = normalize({ ...patch, id }, all[i], patch.system === undefined); // sem mexer no sistema, uma pasta que sumiu não trava o resto
  if (!n.ok) return { ...n, status: 400 };
  all[i] = n.agent;
  saveAgents(all);
  return { ok: true, agent: n.agent };
}

export function deleteAgent(id) {
  const all = loadAgents();
  if (!all.some((a) => a.id === id)) return { ok: false, status: 404, errors: ['agente não encontrado'] };
  saveAgents(all.filter((a) => a.id !== id));
  return { ok: true };
}
