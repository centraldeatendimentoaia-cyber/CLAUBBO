// Visão do painel da holding: o que espera decisão, o que avaliar, como foram as rotinas hoje, o elenco e o que acabou de acontecer.
import { buildPending } from './pendencias.mjs';
import { isDue } from './when.mjs';

const TZ = 'America/Sao_Paulo';
const DIA_MS = 24 * 3600e3;
const TICKER_MAX = 12;

const diaSP = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(ms); // AAAA-MM-DD
/** Dia da semana (0 = domingo), dia do mês e minutos desde a meia-noite em São Paulo. */
function relogioSP(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(ms).map((x) => [x.type, x.value]));
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), dom: Number(p.day), min: Number(p.hour) * 60 + Number(p.minute) };
}
const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Ainda falta um horário hoje (em São Paulo) ou há um horário recente que não rodou? */
function temHorarioPendente(when, ultimaMs, now) {
  if (!when) return false;
  if (isDue(when, ultimaMs, now)) return true;
  const r = relogioSP(now);
  if (when.kind === 'weekly') return when.days.includes(r.dow) && minutos(when.at) > r.min;
  if (when.kind === 'monthly') return when.day === r.dom && minutos(when.at) > r.min;
  for (let h = when.from; h <= when.to; h++) if ((h - when.from) % when.every === 0 && h * 60 > r.min) return true;
  return false;
}

function resumoRotinas(routines, now) {
  const hoje = diaSP(now);
  let rodaram = 0, falharam = 0, previstas = 0;
  const lista = routines.map((r) => {
    const doDia = (r.history ?? []).filter((e) => diaSP(e.finishedAt) === hoje).sort((a, b) => b.finishedAt - a.finishedAt);
    const ultima = (r.history ?? []).reduce((m, e) => Math.max(m, e.finishedAt), 0) || undefined;
    let estado = 'aguarda';
    if (r.paused) estado = 'pausada';
    else if (doDia.length) { estado = doDia[0].ok ? 'ok' : 'falhou'; if (doDia[0].ok) rodaram++; else falharam++; }
    else if (temHorarioPendente(r.when, ultima ?? 0, now)) previstas++;
    return { id: r.id, title: r.title, agent: r.agent, whenLabel: r.whenLabel, estado, ...(ultima ? { ultima } : {}) };
  });
  return { rodaram, falharam, previstas, lista };
}

/** `deps`: { tasks, cliRequests, proposals, calls, routines, activity, xp: { elenco(), xpHoje(now), avaliada(taskId) } }. */
export function buildHolding(deps, now = Date.now()) {
  const { tasks = [], routines = [], activity = [], xp } = deps;
  return {
    pendencias: buildPending(deps, now),
    avaliar: tasks
      .filter((t) => t.state === 'done' && !t.error && now - t.doneAt <= DIA_MS && !xp.avaliada(t.id))
      .map((t) => ({ task: t.id, agent: t.agent, title: String(t.title ?? t.text ?? '').slice(0, 80), doneAt: t.doneAt })),
    rotinas: resumoRotinas(routines, now),
    elenco: xp.elenco(),
    xpHoje: xp.xpHoje(now),
    ticker: activity.slice(-TICKER_MAX).reverse().map((a) => ({ at: a.at, text: a.text })),
  };
}

/** Só `dono` decide tudo; `equipe` só o que não é exclusivo do dono; qualquer outro papel (ex.: agente) é negado. */
export function podeDecidir(pessoa, pending) {
  if (pessoa?.papel === 'dono') return true;
  return pessoa?.papel === 'equipe' && pending?.ownerOnly === false;
}

/** Itens que o lote pode aprovar. A lista vem sempre do servidor, nunca de ids enviados pelo cliente. */
export const lotesSeguros = (pendencias) => pendencias.filter((p) => p.safe === true);

/**
 * Reconfere, logo antes de agir (e depois de cada await desde o gate), que o item continua pendente no MESMO estágio
 * classificado e que a pessoa ainda pode decidi-lo. Fecha a janela em que o estágio muda (plan -> implement) durante a espera.
 */
export function confirmarAntesDeAgir({ pendingNow, pid, pessoa, estagio }) {
  const item = pendingNow().find((x) => x.id === pid);
  if (!item || (item.stage ?? null) !== (estagio ?? null)) return { ok: false, status: 409, error: 'o item mudou enquanto a decisão esperava; confira de novo' };
  if (!podeDecidir(pessoa, item)) return { ok: false, status: 403, error: 'só o dono pode decidir isto' };
  return { ok: true, item };
}
