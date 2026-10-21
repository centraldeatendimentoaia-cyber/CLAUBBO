// XP e nível dos agentes. Só entra XP por resultado verificado (clique do dono em "ficou bom" ou rotina concluída sem erro),
// nunca por volume de mensagens ou tokens. Cada evento tem chave única: repetir o clique ou reprocessar não soma de novo.
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

const TZ = 'America/Sao_Paulo';
export const XP_FICOU_BOM = 30;
export const XP_ROTINA = 5;
const file = () => path.join(config.data, 'xp.json');
// Objetos sem protótipo: um agente chamado "constructor" ou "__proto__" é só uma chave comum.
const limpo = (o) => Object.assign(Object.create(null), o);
const load = () => {
  const d = readJson(file(), null);
  return { agentes: limpo(d?.agentes), eventos: limpo(d?.eventos) };
};
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const diaSP = (ms) => fmtDia.format(ms);

/** Soma `pontos` ao agente uma única vez por `key`. Síncrono de ponta a ponta: não há await entre conferir e gravar. */
export function award(key, agent, pontos, now = Date.now()) {
  const d = load();
  if (d.eventos[key]) return { ok: true, duplicado: true };
  d.eventos[key] = { agent, pontos, at: now };
  d.agentes[agent] = (d.agentes[agent] ?? 0) + pontos;
  writeJson(file(), d);
  return { ok: true, duplicado: false };
}

/** nível = floor(sqrt(xp / 50)) + 1; progresso = fração (0 a 1, exclusivo) entre o início deste nível e o do próximo. */
export function levelOf(xp) {
  xp = Math.max(0, xp);
  const nivel = Math.floor(Math.sqrt(xp / 50)) + 1;
  const base = 50 * (nivel - 1) ** 2, proximo = 50 * nivel ** 2;
  return { nivel, progresso: (xp - base) / (proximo - base) };
}

export const xpOf = (agent) => load().agentes[agent] ?? 0;
export const xpHoje = (now = Date.now()) => Object.values(load().eventos).filter((e) => diaSP(e.at) === diaSP(now)).reduce((s, e) => s + e.pontos, 0);
/** A tarefa já recebeu o "ficou bom"? */
export const avaliada = (taskId) => !!load().eventos[`bom:${taskId}`];
export const elenco = () => Object.entries(load().agentes).map(([agent, xp]) => ({ agent, xp, ...levelOf(xp) }));

/**
 * "Ficou bom": só o dono. A tarefa e o agente vêm do servidor, nunca do corpo do pedido; só tarefa concluída e sem erro conta.
 * Chamar de novo para a mesma tarefa devolve 200 sem somar.
 */
export function ficouBom({ pessoa, taskId, tasks, getAgent }) {
  if (pessoa?.papel !== 'dono') return { ok: false, status: 403, error: 'só o dono pode avaliar' };
  const t = typeof taskId === 'string' ? tasks.find((x) => x.id === taskId) : undefined;
  if (!t) return { ok: false, status: 404, error: 'tarefa não encontrada' };
  if (t.state !== 'done' || t.error) return { ok: false, status: 409, error: 'só tarefa concluída sem erro pode ser avaliada' };
  if (!t.agent || !getAgent(t.agent)) return { ok: false, status: 404, error: 'agente não encontrado' };
  const r = award(`bom:${t.id}`, t.agent, XP_FICOU_BOM);
  return { ok: true, status: 200, duplicado: r.duplicado, agent: t.agent, xp: xpOf(t.agent) };
}
