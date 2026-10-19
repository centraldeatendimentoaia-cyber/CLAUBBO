// Horário de trabalho de um agente: início, fim e dias da semana (0 = domingo ... 6 = sábado), no fuso do servidor.
// Sem horário (null) = sempre em serviço. Fora do horário o agente vai sozinho para o lounge; dentro, volta para a estação.
// Turno que passa da meia-noite (ex.: 22:00 às 06:00) vale: o dia marcado é o dia em que o turno COMEÇA.

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Valida e normaliza o horário vindo da rede. Devolve { ok, hours } (hours null = sem horário) ou { ok:false, error }. */
export function cleanHours(input) {
  if (input === null || input === undefined || input === '' || input === false) return { ok: true, hours: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'horário: formato inválido' };
  const start = String(input.start ?? '').trim();
  const end = String(input.end ?? '').trim();
  if (!start && !end && !(Array.isArray(input.days) && input.days.length)) return { ok: true, hours: null };
  if (!HHMM.test(start) || !HHMM.test(end)) return { ok: false, error: 'horário: use HH:MM (ex.: 09:00 e 18:00)' };
  if (start === end) return { ok: false, error: 'horário: o fim não pode ser igual ao início' };
  const days = [...new Set((Array.isArray(input.days) ? input.days : ALL_DAYS).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) return { ok: false, error: 'horário: marque pelo menos um dia da semana' };
  return { ok: true, hours: { start, end, days } };
}

/** O agente está em horário de trabalho em `now`? (`now` injetável nos testes.) */
export function inService(hours, now = new Date()) {
  if (!hours) return true;
  const d = new Date(now);
  const min = d.getHours() * 60 + d.getMinutes();
  const s = toMin(hours.start);
  const e = toMin(hours.end);
  const today = d.getDay();
  if (s < e) return hours.days.includes(today) && min >= s && min < e;
  // passa da meia-noite: a parte da noite conta no dia do início; a da madrugada, no dia seguinte ao início
  if (min >= s) return hours.days.includes(today);
  if (min < e) return hours.days.includes((today + 6) % 7);
  return false;
}

const DAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const dayLetters = (days) => DAY_LETTERS.map((l, i) => (days.includes(i) ? l : '·')).join(' ');

/** Texto mostrado na interface. */
export function describeHours(hours) {
  if (!hours) return 'sem horário · sempre em serviço. Fora do horário ele vai para o lounge sozinho; dentro, volta para a estação';
  return `${hours.start} às ${hours.end} · ${dayLetters(hours.days)} · fora do horário ele vai para o lounge sozinho; dentro, volta para a estação`;
}
