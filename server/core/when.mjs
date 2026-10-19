// "Quando" de uma rotina, escrito em português: "dias úteis às 8h", "toda segunda e quinta às 9h30",
// "de hora em hora das 9 às 17", "todo dia 5 às 10h". Devolve uma descrição estruturada e sabe dizer se está na hora.
//   { kind: 'weekly', days: [0..6], at: 'HH:MM' }        (todo dia = os 7 dias)
//   { kind: 'hourly', every: N, from: h, to: h }         (nas horas cheias entre from e to)
//   { kind: 'monthly', day: 1..28, at: 'HH:MM' }
const DAYS = [['domingo', 0], ['segunda', 1], ['terca', 2], ['quarta', 3], ['quinta', 4], ['sexta', 5], ['sabado', 6]];
const NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const plain = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');
/** Quanto tempo depois do horário a rotina ainda vale a pena rodar (se o computador estava desligado, não acumula). */
const GRACE_MS = 6 * 3600_000;

function parseTime(t) {
  const m = /(?:as\s*)?\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/.exec(t) || /\bas\s+(\d{1,2})\b/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}

export function parseWhen(input) {
  const t = plain(input).replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, error: 'diga quando: ex. "dias úteis às 8h"' };

  // de hora em hora / a cada N horas, com janela opcional "das 9 às 17"
  const hourly = /(?:de hora em hora|a cada (\d{1,2}) horas?)(?:.*?das (\d{1,2})\s*h?(?:\s*(?:as|a|ate)\s*(\d{1,2})))?/.exec(t);
  if (hourly) {
    const every = Number(hourly[1] ?? 1);
    const from = hourly[2] !== undefined ? Number(hourly[2]) : 0;
    const to = hourly[3] !== undefined ? Number(hourly[3]) : 23;
    if (every < 1 || every > 12 || from > 23 || to > 23 || to < from) return { ok: false, error: 'janela de horas inválida' };
    return { ok: true, when: { kind: 'hourly', every, from, to } };
  }

  const at = parseTime(t);
  if (!at) return { ok: false, error: 'faltou o horário: ex. "às 8h" ou "às 9h30"' };

  const monthly = /(?:todo )?dia (\d{1,2})(?: de cada mes| do mes)?/.exec(t);
  if (monthly && /\bmes\b|dia \d/.test(t) && !/segunda|terca|quarta|quinta|sexta|sabado|domingo/.test(t)) {
    const day = Number(monthly[1]);
    if (day < 1 || day > 28) return { ok: false, error: 'dia do mês de 1 a 28' };
    return { ok: true, when: { kind: 'monthly', day, at } };
  }

  let days = [];
  if (/dias? uteis|segunda a sexta|de segunda a sexta/.test(t)) days = [1, 2, 3, 4, 5];
  else if (/fim de semana|finais? de semana/.test(t)) days = [0, 6];
  else if (/todo dia|todos os dias|diariamente|todo santo dia/.test(t)) days = [0, 1, 2, 3, 4, 5, 6];
  else for (const [name, n] of DAYS) if (new RegExp(`\\b${name}s?\\b`).test(t)) days.push(n);
  if (!days.length) return { ok: false, error: 'diga os dias: "todo dia", "dias úteis" ou "toda segunda e quinta"' };
  return { ok: true, when: { kind: 'weekly', days: [...new Set(days)].sort(), at } };
}

export function describeWhen(w) {
  if (w.kind === 'hourly') return w.every === 1 ? `de hora em hora, das ${w.from}h às ${w.to}h` : `a cada ${w.every} horas, das ${w.from}h às ${w.to}h`;
  if (w.kind === 'monthly') return `todo dia ${w.day} às ${w.at}`;
  const d = w.days.join(',');
  const label = d === '0,1,2,3,4,5,6' ? 'todo dia' : d === '1,2,3,4,5' ? 'dias úteis' : d === '0,6' ? 'fins de semana' : w.days.map((n) => NAMES[n]).join(' e ');
  return `${label} às ${w.at}`;
}

const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(date); d.setHours(h, m, 0, 0); return d.getTime(); };

/** Último horário previsto que já passou e ainda está dentro da tolerância; ou null. */
export function lastSlot(w, now = Date.now()) {
  const date = new Date(now);
  let slot = null;
  if (w.kind === 'weekly') {
    for (const back of [0, 1]) { // hoje e ontem (rotina das 23h que o relógio já virou)
      const d = new Date(now - back * 86400_000);
      if (w.days.includes(d.getDay())) { const s = at(d, w.at); if (s <= now) { slot = s; break; } }
    }
  } else if (w.kind === 'monthly') {
    const s = at(new Date(date.getFullYear(), date.getMonth(), w.day), w.at);
    slot = s <= now ? s : null;
  } else {
    for (let h = w.to; h >= w.from; h--) if ((h - w.from) % w.every === 0) { const s = at(date, `${pad(h)}:00`); if (s <= now) { slot = s; break; } }
  }
  const grace = w.kind === 'hourly' ? 45 * 60_000 : GRACE_MS; // de hora em hora: horário perdido não acumula
  return slot !== null && now - slot <= grace ? slot : null;
}

/** Está na hora? Sim se há um horário previsto recente que ainda não rodou (`lastRun` em ms). */
export function isDue(w, lastRun = 0, now = Date.now()) {
  const slot = lastSlot(w, now);
  return slot !== null && lastRun < slot;
}
