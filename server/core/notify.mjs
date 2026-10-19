// Aviso no celular pelo Telegram. O token do bot e o id do chat ficam num arquivo local FORA do projeto
// (`telegram.json` em config.secrets, ex.: %APPDATA%\escritorio-v2\telegram.json) com { "token": "...", "chatId": "..." }.
// O texto da mensagem leva só o tipo do evento e os nomes do agente e do sistema: nunca caminhos, comandos, conversas
// nem erros. O token nunca é escrito em log: os erros mostram só uma frase genérica.
import { readJson } from './store.mjs';

const DEDUPE_MS = 60_000;
const clipName = (v, fallback) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60) || fallback;

/** Texto do aviso, só com o tipo do evento e nomes. Evento desconhecido não gera mensagem. */
export function messageFor(ev) {
  const agent = clipName(ev.agent, 'agente');
  const system = clipName(ev.system, 'sistema');
  switch (ev.type) {
    case 'system_back': return `✅ ${system} (${agent}) voltou ao ar.`;
    case 'system_failed': return `🔴 ${system} (${agent}) caiu e não voltou. O escritório parou de tentar.`;
    case 'url_down': return `⚠️ ${system} (${agent}) está fora do ar.`;
    case 'url_back': return `✅ ${system} (${agent}) voltou ao ar.`;
    case 'meeting_done': return `📝 A reunião terminou (${agent}).`;
    case 'task_waiting': return `⏳ ${agent} tem uma tarefa esperando o seu Aprovar.`;
    default: return null;
  }
}

/** Lê token e chat do arquivo local; null quando faltam ou têm formato inválido. "poll": false no arquivo desliga o recebimento. */
export function readCredentials(configFile) {
  const c = readJson(configFile, null);
  const token = String(c?.token ?? '').trim();
  const chatId = String(c?.chatId ?? '').trim();
  return /^\d{5,}:[\w-]{20,}$/.test(token) && /^-?\d{3,}$/.test(chatId) ? { token, chatId, poll: c?.poll !== false } : null;
}

/** Botões do aviso: só o id da tarefa/ata no callback_data (limite do Telegram: 64 bytes). */
export function buttonsFor(ev) {
  const kind = ev.type === 'task_waiting' ? 't' : ev.type === 'meeting_done' ? 'm' : '';
  const id = String((kind === 't' ? ev.taskId : ev.meetingId) ?? '');
  if (!kind || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
  return { inline_keyboard: [[{ text: '✅ Aprovar', callback_data: `ap:${kind}:${id}` }, { text: '❌ Recusar', callback_data: `rj:${kind}:${id}` }]] };
}

export function createNotifier({ configFile, fetchFn = fetch, now = Date.now, log = console.log }) {
  const lastSent = new Map();
  let warned = false;
  const credentials = () => readCredentials(configFile);

  /** Envia o aviso. Nunca lança: falha de rede ou falta de configuração só viram uma linha de log sem segredo. */
  async function notify(ev) {
    const text = messageFor(ev);
    if (!text) return { sent: false, reason: 'evento sem mensagem' };
    const key = `${ev.type}|${ev.agent}|${ev.system}|${ev.taskId ?? ev.meetingId ?? ''}`;
    const t = now();
    if (t - (lastSent.get(key) ?? -Infinity) < DEDUPE_MS) return { sent: false, reason: 'repetido' };
    const c = credentials();
    if (!c) {
      if (!warned) { warned = true; log('Telegram não configurado: os avisos de sistema não serão enviados (veja o README).'); }
      return { sent: false, reason: 'sem configuração' };
    }
    lastSent.set(key, t);
    try {
      const res = await fetchFn(`https://api.telegram.org/bot${c.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: c.chatId, text, disable_web_page_preview: true, ...(buttonsFor(ev) ? { reply_markup: buttonsFor(ev) } : {}) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) { log(`Telegram: o envio falhou (HTTP ${res.status}).`); return { sent: false, reason: `http ${res.status}` }; }
      return { sent: true };
    } catch {
      log('Telegram: não consegui enviar o aviso (sem rede ou tempo esgotado).');
      return { sent: false, reason: 'rede' };
    }
  }

  return { notify, configured: () => !!credentials() };
}
