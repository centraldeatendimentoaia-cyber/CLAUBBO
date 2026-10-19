// Terminal ao vivo e histórico do dia do Escritório v2. Funções puras (sem rede, sem disco): transformam o chat de um
// agente em entradas do terminal, calculam o que mudou desde o último envio e agrupam por dia no horário LOCAL.
//
// Autores no terminal de um agente do Escritório:
//   dono (João)                     -> 'user', texto como ele escreveu
//   agente respondendo              -> 'assistant' (ou 'system' com nível 'error' quando falhou)
//   retorno automático de terminal  -> 'system' (não é o dono falando): primeira linha + detalhes
// Nos terminais do andar 2 (Claude Code), o pedido que o Maestro mandou pelo Escritório vira um prompt do usuário no
// transcript; `relabelCliEntries` marca esses prompts com o nome de quem pediu, para não passarem por texto do dono.

const ONE_LINE = 200;

/** Fuso do dia do João: V2_TZ, senão o do computador, senão Brasília. */
export const defaultTz = () => process.env.V2_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';

/** "2026-10-18" no fuso `tz` (o dia local, não o UTC: 23h30 em Brasília ainda é o mesmo dia). */
export function dayKey(ms, tz = defaultTz()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

/** Id estável da entrada: o mesmo para a mesma mensagem mesmo quando as mais antigas saem da lista; repetidos no mesmo instante ganham sufixo. */
function idsFor(msgs) {
  const seen = new Map();
  return msgs.map((m) => {
    const base = `${m.who === 'user' ? 'u' : 'a'}${m.at}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  });
}

const firstLine = (t) => String(t ?? '').split(/\r?\n/, 1)[0];

/** Mensagens do chat -> entradas do terminal, na ordem em que foram gravadas. */
export function chatEntries(msgs) {
  const ids = idsFor(msgs);
  return msgs.map((x, i) => {
    const id = ids[i];
    const text = String(x.text ?? '');
    if (x.who === 'user') {
      if (x.auto) {
        const head = firstLine(text);
        const body = text.slice(head.length).trim();
        return { kind: 'system', id, at: x.at, text: body ? `${head} — ${body.slice(0, ONE_LINE)}${body.length > ONE_LINE ? '…' : ''}` : head, detail: text, level: 'info' };
      }
      return { kind: 'user', id, at: x.at, text };
    }
    if (x.error) return { kind: 'system', id, at: x.at, text, level: 'error' };
    return { kind: 'assistant', id, at: x.at, text };
  });
}

/**
 * O que enviar ao cliente do terminal agora. `sent` = ids que ele já recebeu (Set). O chat guarda só as últimas mensagens
 * (as mais antigas saem), então a comparação é por id e não pelo tamanho da lista.
 * Devolve { type: 'init' | 'append' | 'none', entries, sent }.
 */
export function diffFeed(sent, msgs) {
  const entries = chatEntries(msgs);
  const ids = new Set(entries.map((e) => e.id));
  const next = { entries, sent: ids };
  if (!sent) return { type: 'init', ...next };
  if (sent.size && ids.size && ![...ids].some((id) => sent.has(id))) return { type: 'init', ...next }; // conversa trocada ou apagada
  if (sent.size && !ids.size) return { type: 'init', ...next, entries: [] };
  const fresh = entries.filter((e) => !sent.has(e.id));
  return fresh.length ? { type: 'append', entries: fresh, sent: ids } : { type: 'none', entries: [], sent: ids };
}

// ---------------------------------------------------------------- terminais do andar 2

/**
 * Marca, nas entradas de um terminal de Claude Code, os prompts que vieram de um pedido do Escritório (texto igual ao de
 * um pedido já entregue a este terminal). Os outros prompts continuam como estão (o que o João digita). `requests` =
 * data/cli-requests.json; `nameOf(id)` devolve o nome do agente que pediu.
 */
export function relabelCliEntries(entries, requests, agentId, nameOf = (id) => id) {
  const sentTo = new Map();
  for (const r of requests) if (r.state === 'sent' && r.agentId === agentId) sentTo.set(String(r.text).trim(), r);
  if (!sentTo.size) return entries;
  return entries.map((e) => {
    if (e.kind !== 'user' || typeof e.text !== 'string') return e;
    const r = sentTo.get(e.text.trim());
    if (!r) return e;
    const how = r.auto ? 'enviado automaticamente' : 'aprovado por você';
    return { ...e, text: `↳ Pedido de ${nameOf(r.from)} (orquestrador, ${how}):\n${e.text}` };
  });
}

/**
 * Reescreve os eventos `init`/`append` de um stream SSE do Claubbo original, bloco a bloco. O que não for evento de
 * terminal (ping, comentário, JSON estranho) passa intacto. Devolve { out, rest }: o texto pronto e o pedaço final ainda
 * incompleto, que espera o próximo trecho.
 */
export function relabelSseChunk(buffer, relabel) {
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  const out = blocks.map((block) => {
    const m = /^event: (init|append)\ndata: (.*)$/s.exec(block);
    if (!m) return `${block}\n\n`;
    try {
      const data = JSON.parse(m[2]);
      const mapped = m[1] === 'init' ? { ...data, entries: relabel(Array.isArray(data.entries) ? data.entries : []) } : relabel(Array.isArray(data) ? data : []);
      return `event: ${m[1]}\ndata: ${JSON.stringify(mapped)}\n\n`;
    } catch {
      return `${block}\n\n`;
    }
  });
  return { out: out.join(''), rest };
}

// ---------------------------------------------------------------- histórico por dia

/**
 * Conversas de um agente agrupadas por dia local: [{ day: '2026-10-18', first, last, count, messages }], do dia mais
 * recente para o mais antigo. `since` (ms) corta os dias anteriores à janela.
 */
export function groupByDay(msgs, tz = defaultTz(), since = 0) {
  const days = new Map();
  for (const m of msgs) {
    if (!Number.isFinite(m.at) || m.at < since) continue;
    const key = dayKey(m.at, tz);
    const d = days.get(key) ?? { day: key, first: m.at, last: m.at, count: 0, messages: [] };
    d.first = Math.min(d.first, m.at);
    d.last = Math.max(d.last, m.at);
    d.count++;
    d.messages.push(m);
    days.set(key, d);
  }
  return [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** Une duas listas de mensagens (arquivo + atual) sem repetir e em ordem de horário (estável). */
export function mergeMessages(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) for (const m of list) {
    const key = `${m.at}|${m.who}|${m.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out.map((m, i) => [m, i]).sort((a, b) => a[0].at - b[0].at || a[1] - b[1]).map(([m]) => m);
}

/** Eventos do Escritório (data/activity.json) -> entradas 'system' do terminal, em ordem. */
export function activityEntries(items) {
  return [...items].sort((a, b) => a.at - b.at || a.id - b.id).map((e) => ({ kind: 'system', id: `act${e.id}`, at: e.at, text: `${e.agentName ? `${e.agentName}: ` : ''}${e.text}`, level: e.kind === 'system' ? 'warn' : 'info' }));
}
