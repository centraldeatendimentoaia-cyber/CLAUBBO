// XP e nível dos agentes. Só entra XP por resultado verificado (clique do dono em "ficou bom" ou rotina concluída sem erro),
// nunca por volume de mensagens ou tokens. Cada evento tem chave única: repetir o clique ou reprocessar não soma de novo.
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

const TZ = 'America/Sao_Paulo';
export const XP_FICOU_BOM = 30;
export const XP_ROTINA = 5;
export const XP_OBRIGADO = 10;
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
export function award(key, agent, pontos, now = Date.now(), extra = {}) {
  const d = load();
  if (d.eventos[key]) return { ok: true, duplicado: true };
  d.eventos[key] = { ...extra, agent, pontos, at: now };
  d.agentes[agent] = (d.agentes[agent] ?? 0) + pontos;
  // Poda: eventos com mais de 30 dias saem; os "bom:" e "obrigado:" ficam (são a trava de avaliação em dobro). O total dos agentes não muda.
  for (const [k, e] of Object.entries(d.eventos)) if (!k.startsWith('bom:') && !k.startsWith('obrigado:') && e.at < now - 30 * 86400e3) delete d.eventos[k];
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
/** Um retrato do XP lido uma única vez (o painel consulta várias tarefas por pedido). */
export function lerXp() {
  const d = load();
  return {
    elenco: () => Object.entries(d.agentes).map(([agent, xp]) => ({ agent, xp, ...levelOf(xp) })),
    xpHoje: (now = Date.now()) => Object.values(d.eventos).filter((e) => diaSP(e.at) === diaSP(now)).reduce((s, e) => s + e.pontos, 0),
    avaliada: (taskId) => !!d.eventos[`bom:${taskId}`],
  };
}
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

/**
 * Resultado verificado mais recente do agente que ainda não foi reconhecido (sem `bom:` nem `obrigado:`).
 * Vale tarefa concluída sem erro; `rotinas` são as execuções de rotina (mesmo formato de tarefa), sem repetir o que já está em `tasks`.
 */
export function resultadoPendente(agentId, { tasks = [], rotinas = [] } = {}) {
  const { eventos } = load();
  const vistos = new Set();
  const candidatos = [];
  for (const [lista, tipo] of [[tasks, null], [rotinas, 'rotina']]) {
    for (const t of lista) {
      if (t.agent !== agentId || t.state !== 'done' || t.error || vistos.has(t.id)) continue;
      vistos.add(t.id);
      candidatos.push({ id: t.id, tipo: tipo ?? (t.routine ? 'rotina' : 'tarefa'), doneAt: t.doneAt ?? 0 });
    }
  }
  const livres = candidatos.filter((c) => !eventos[`bom:${c.id}`] && !eventos[`obrigado:${c.id}`]).sort((a, b) => b.doneAt - a.doneAt);
  return livres[0] ? { id: livres[0].id, tipo: livres[0].tipo } : null;
}

/**
 * Agradecer ao agente pelo resultado mais recente ainda não reconhecido. Dono ou equipe com nome. O resultado é escolhido aqui,
 * nunca pela página. A chave `obrigado:<id>` é única: quem agradece primeiro leva o XP e os demais recebem 409.
 */
export function agradecer({ pessoa, agentId, tasks = [], rotinas = [], getAgent }) {
  if (!pessoa?.nome || (pessoa.papel !== 'dono' && pessoa.papel !== 'equipe')) return { ok: false, status: 403, error: 'sem permissão para agradecer' };
  if (!getAgent(agentId)) return { ok: false, status: 404, error: 'agente não encontrado' };
  const r = resultadoPendente(agentId, { tasks, rotinas });
  if (!r) {
    // Outra pessoa pode ter levado o resultado mais recente: avisa quem foi, em vez de só dizer que não há nada.
    const { eventos } = load();
    const recente = [...tasks, ...rotinas].filter((t) => t.agent === agentId && t.state === 'done' && !t.error).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))[0];
    const por = recente && eventos[`obrigado:${recente.id}`]?.por;
    if (por && por !== pessoa.nome) return { ok: false, status: 409, error: `já agradecido por ${por}` };
    return { ok: false, status: 409, error: 'sem resultado novo para agradecer' };
  }
  award(`obrigado:${r.id}`, agentId, XP_OBRIGADO, Date.now(), { por: pessoa.nome });
  return { ok: true, status: 200, agent: agentId, xp: xpOf(agentId), id: r.id };
}
