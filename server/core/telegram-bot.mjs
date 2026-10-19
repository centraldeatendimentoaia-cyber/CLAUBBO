// Aprovar ou recusar tarefa e ata pelo Telegram, com os botões do aviso (notify.mjs). Recebe por polling local
// (getUpdates, sem webhook, nada precisa ficar exposto). Regras:
//  - só vale o chat configurado em telegram.json (qualquer outro chat é ignorado em silêncio);
//  - só decide o que está esperando: tarefa em "waiting" com aprovação pendente, ata pronta e ainda sem decisão;
//  - o token nunca vai para log nem para resposta: erros viram uma frase genérica;
//  - desligável: "poll": false em telegram.json (lido a cada ciclo) ou stop().
import { readCredentials } from './notify.mjs';

const DATA = /^(ap|rj):([tm]):([A-Za-z0-9_-]{1,40})$/;

export function createTelegramBot({ configFile, tasks, meetings, fetchFn = fetch, log = console.log, intervalMs = 4000 }) {
  let offset = 0;
  let timer = null;
  let running = false;
  let warned = false;

  async function api(c, method, body) {
    const res = await fetchFn(`https://api.telegram.org/bot${c.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return res.json();
  }

  /** Aplica a decisão pedida. Devolve o texto curto de resposta ao toque. */
  async function decide(action, kind, id) {
    const approve = action === 'ap';
    if (kind === 't') {
      const t = tasks.get(id);
      if (!t || t.state !== 'waiting' || !t.dev?.awaiting) return 'Essa tarefa não está esperando aprovação.';
      const r = approve ? await tasks.approve(id) : tasks.reject(id, 'Recusado pelo Telegram.');
      return r.ok ? (approve ? 'Tarefa aprovada.' : 'Tarefa recusada.') : 'Não foi possível decidir agora.';
    }
    const r = meetings.decide(id, approve ? 'approved' : 'rejected');
    return r.ok ? (approve ? 'Ata aprovada.' : 'Ata recusada.') : r.status === 409 ? 'Essa ata já foi decidida ou ainda não está pronta.' : 'Não foi possível decidir agora.';
  }

  async function handle(c, update) {
    const q = update.callback_query;
    if (!q || String(q.message?.chat?.id ?? '') !== c.chatId) return; // outro chat: ignora, sem resposta
    const m = DATA.exec(String(q.data ?? ''));
    let text = 'Comando desconhecido.';
    if (m) {
      try { text = await decide(m[1], m[2], m[3]); } catch { text = 'Não foi possível decidir agora.'; }
    }
    await api(c, 'answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
    if (m && /aprovad|recusad/.test(text)) {
      await api(c, 'editMessageReplyMarkup', { chat_id: c.chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    }
  }

  /** Um ciclo: busca as atualizações novas e trata cada uma. Nunca lança. */
  async function pollOnce() {
    const c = readCredentials(configFile);
    if (!c || !c.poll) return { polled: false };
    try {
      const r = await api(c, 'getUpdates', { offset, timeout: 0, allowed_updates: ['callback_query'] });
      for (const u of Array.isArray(r?.result) ? r.result : []) {
        offset = Math.max(offset, Number(u.update_id) + 1);
        await handle(c, u);
      }
      warned = false;
      return { polled: true };
    } catch {
      if (!warned) { warned = true; log('Telegram: não consegui buscar as respostas (sem rede ou tempo esgotado).'); }
      return { polled: false };
    }
  }

  function loop() {
    timer = setTimeout(async () => {
      if (running) await pollOnce();
      if (running) loop();
    }, intervalMs);
    timer.unref?.();
  }

  return {
    pollOnce,
    start() { if (running) return; running = true; loop(); },
    stop() { running = false; clearTimeout(timer); },
    isRunning: () => running,
  };
}
