// Catálogo de agentes para contratar (server/catalog/agentes.json, só dados). "Contratar" cria o agente pelo mesmo
// caminho de sempre (createAgent), com tudo já preenchido. O catálogo nunca traz sistema, comando nem fantasia.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgent, getAgent, loadAgents } from './agents.mjs';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'catalog', 'agentes.json');
export const CATEGORIES = ['direcao', 'marketing', 'produto', 'vendas', 'administrativo', 'inteligencia'];
const ID = /^[a-z0-9][a-z0-9-]{0,30}$/;
const text = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const names = (v, max, len = 40) => (Array.isArray(v) ? v.map((x) => text(x, len)).filter(Boolean).slice(0, max) : []);

/** Valida um item do catálogo. Devolve null se inválido. */
export function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const id = text(e.id, 31).toLowerCase();
  if (!ID.test(id) || !text(e.name, 32) || !text(e.role, 80)) return null;
  return {
    id, name: text(e.name, 32), role: text(e.role, 80), does: text(e.does, 400), brief: text(e.brief, 2000),
    category: CATEGORIES.includes(e.category) ? e.category : 'administrativo', type: e.type === 'dev' ? 'dev' : 'pensador',
    tools: names(e.tools, 24), skills: names(e.skills, 24), needs: names(e.needs, 12, 120),
    model: ['sonnet', 'opus', 'haiku', 'fable'].includes(e.model) ? e.model : 'sonnet', effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(e.effort) ? e.effort : 'low',
  };
}

/** Lê o catálogo (ou `items`, nos testes). Itens inválidos e ids repetidos são ignorados. */
export function loadCatalog(items) {
  let raw = items;
  if (!raw) { try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { raw = []; } }
  const seen = new Set();
  const out = [];
  for (const e of Array.isArray(raw) ? raw : []) {
    const c = cleanEntry(e);
    if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
  }
  return out;
}

/** Catálogo marcando quem já foi contratado. */
export const listCatalog = (items) => { const have = new Set(loadAgents().map((a) => a.id)); return loadCatalog(items).map((c) => ({ ...c, hired: have.has(c.id) })); };

/** Contrata: cria o agente a partir do item do catálogo. `room` e `account` são escolhas do dono. */
export function hire(id, { room = '', account = '', name = '' } = {}, items) {
  const c = loadCatalog(items).find((x) => x.id === id);
  if (!c) return { ok: false, status: 404, error: 'esse agente não está no catálogo' };
  if (getAgent(c.id)) return { ok: false, status: 409, error: `${c.name} já foi contratado` };
  const r = createAgent({ id: c.id, name: text(name, 32) || c.name, role: c.role, does: c.does, brief: c.brief, type: c.type, tools: c.tools, skills: c.skills, model: c.model, effort: c.effort, room, ...(account ? { account } : {}) });
  return r.ok ? { ok: true, agent: r.agent } : { ok: false, status: 400, error: r.errors?.join('; ') || 'não consegui contratar' };
}
