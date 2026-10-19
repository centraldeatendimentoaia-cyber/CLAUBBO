// Conversa com o agente (Escritório v2): mostra o histórico de GET /api/conversation/:agentId (o chat do Escritório) e
// se atualiza enquanto a gaveta do agente está aberta e logo depois de uma mensagem enviada. O envio continua na
// caixa de mensagem (ui/composer.ts, POST /api/messages). Só texto: o conteúdo vem do servidor como textContent.
import { h } from './dom';

interface Turn {
  at: number;
  who: 'user' | 'agent';
  text: string;
  images?: string[];
  auto?: string; // retorno automático de um terminal (não foi o João quem escreveu)
}

const POLL_MS = 2500;

export class Conversation {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private agentId = '';
  private timer: number | null = null;
  private signature = '';

  constructor() {
    this.list = h('div', { class: 'ui-chat' });
    this.el = h('div', {}, this.list);
  }

  /** Mostra a conversa de um agente (ou para de atualizar quando `agentId` é vazio). */
  show(agentId: string): void {
    if (agentId === this.agentId) return;
    this.agentId = agentId;
    this.signature = '';
    this.list.replaceChildren();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (!agentId) return;
    void this.refresh();
    this.timer = window.setInterval(() => void this.refresh(), POLL_MS);
  }

  /** Atualiza já (depois de enviar uma mensagem). */
  refreshNow(): void {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const id = this.agentId;
    if (!id) return;
    try {
      const res = await fetch(`/api/conversation/${encodeURIComponent(id)}`);
      if (!res.ok || id !== this.agentId) return;
      const data = (await res.json()) as { messages?: Turn[] };
      this.render(data.messages ?? []);
    } catch {
      // Sem conexão: tenta de novo no próximo ciclo.
    }
  }

  private render(turns: Turn[]): void {
    const sig = turns.map((t) => `${t.at}:${t.who}:${t.text.length}:${t.images?.length ?? 0}`).join('|');
    if (sig === this.signature) return;
    this.signature = sig;
    const stick = this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 24;
    this.list.replaceChildren(
      ...(turns.length
        ? turns.slice(-30).map((t) =>
            h(
              'div',
              { class: `ui-chat__turn ui-chat__turn--${t.who}` },
              h('span', { class: 'ui-chat__who', text: t.auto ? 'Retorno automático do terminal' : t.who === 'user' ? 'Você' : 'Agente' }),
              ...(t.images ?? []).map((name) => h('img', { class: 'ui-chat__img', attrs: { src: `/api/chat-image/${encodeURIComponent(name)}`, alt: 'Imagem enviada', loading: 'lazy' } })),
              h('p', { class: 'ui-chat__text', text: t.text }),
            ),
          )
        : [h('p', { class: 'ui-muted ui-small', text: 'Nenhuma conversa ainda. Escreva abaixo.' })]),
    );
    if (stick) this.list.scrollTop = this.list.scrollHeight;
  }
}
