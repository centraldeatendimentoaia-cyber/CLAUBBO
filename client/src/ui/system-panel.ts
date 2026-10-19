// Painel do sistema de um agente: ligar/desligar, visão embutida, logs ao vivo e conversa com o agente sobre o sistema.
// Fala com /api/systems/:id (estado e logs), /start, /stop e /chat da própria porta. Tudo que vem do servidor entra como textContent.
import { h } from './dom';

export interface SystemInfo { type: 'local' | 'url'; name: string; url: string; state: 'up' | 'down' | 'restarting' | 'unknown'; desired: boolean; canStart: boolean }
interface Turn { who: 'user' | 'agent'; text: string; error?: boolean }

const STATE_LABEL: Record<string, string> = { up: 'No ar', down: 'Fora do ar', restarting: 'Subindo…', unknown: 'Verificando…' };
const POLL_MS = 3000;

export class SystemPanel {
  readonly el: HTMLElement;
  private id = '';
  private agentName = '';
  private timer = 0;
  private info: SystemInfo | null = null;
  private frameUrl = '';
  private readonly title = h('strong', { class: 'sys-panel__title' });
  private readonly dot = h('span', { class: 'sys-panel__dot' });
  private readonly stateText = h('span', { class: 'sys-panel__state' });
  private readonly toggleBtn = h('button', { class: 'ui-btn', type: 'button', on: { click: () => void this.toggle() } });
  private readonly tabBtn = h('button', { class: 'ui-btn', type: 'button', text: 'Abrir em outra aba', on: { click: () => this.info && window.open(this.info.url, '_blank', 'noopener') } });
  private readonly view = h('div', { class: 'sys-panel__view' });
  private readonly logs = h('pre', { class: 'sys-panel__logs', attrs: { 'aria-label': 'Registro do sistema', tabindex: 0 } });
  private readonly thread = h('div', { class: 'sys-panel__thread', attrs: { 'aria-live': 'polite' } });
  private readonly mode = h('select', { class: 'sys-panel__mode', attrs: { 'aria-label': 'Modo da conversa' } });
  private readonly input = h('textarea', { class: 'sys-panel__input', attrs: { rows: 2, placeholder: 'Pergunte ao agente sobre este sistema…' } });
  private readonly note = h('p', { class: 'sys-panel__note', attrs: { role: 'status' } });

  constructor() {
    this.mode.append(new Option('Investigar (só lê e explica)', 'investigar'), new Option('Resolver (pode editar o projeto)', 'resolver'));
    const send = h('button', { class: 'ui-btn ui-btn--primary', type: 'button', text: 'Enviar', on: { click: () => void this.send() } });
    const close = h('button', { class: 'ui-btn', type: 'button', text: 'Fechar', on: { click: () => this.close() } });
    this.el = h('div', { class: 'sys-panel', role: 'dialog', hidden: true, attrs: { 'aria-modal': 'true', 'aria-label': 'Sistema do agente' } },
      h('div', { class: 'sys-panel__bar' }, this.dot, this.title, this.stateText, this.toggleBtn, this.tabBtn, close),
      h('div', { class: 'sys-panel__body' },
        this.view,
        h('div', { class: 'sys-panel__side' },
          h('h4', { text: 'Registro' }), this.logs,
          h('h4', { text: 'Conversa' }), this.thread,
          h('div', { class: 'sys-panel__send' }, this.mode, this.input, send), this.note)));
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    document.body.append(this.el);
  }

  open(agentId: string, agentName: string): void {
    this.id = agentId.replace(/^escritorio:/, '');
    this.agentName = agentName;
    this.frameUrl = '';
    this.view.replaceChildren();
    this.thread.replaceChildren();
    this.logs.textContent = '';
    this.note.textContent = '';
    this.mode.value = 'investigar'; // Investigar é sempre o ponto de partida
    this.el.hidden = false;
    void this.refresh();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.refresh(), POLL_MS);
    this.input.focus();
  }

  close(): void {
    window.clearInterval(this.timer);
    this.el.hidden = true;
    this.view.replaceChildren(); // descarrega a visão embutida
    this.frameUrl = '';
  }

  private async refresh(): Promise<void> {
    if (!this.id) return;
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(this.id)}`);
      if (!res.ok) { this.note.textContent = 'Este agente não tem mais um sistema cadastrado.'; return; }
      const data = (await res.json()) as { system: SystemInfo; logs: string[] };
      this.info = data.system;
      this.paint(data.logs);
      const conv = await fetch(`/api/conversation/${encodeURIComponent(this.id)}`);
      if (conv.ok) this.paintThread(((await conv.json()) as { messages?: Turn[] }).messages ?? []);
    } catch { this.note.textContent = 'Sem resposta do servidor do Escritório.'; }
  }

  private paint(lines: string[]): void {
    const s = this.info;
    if (!s) return;
    const name = s.name || this.agentName;
    this.title.textContent = `Sistema de ${name}`;
    this.dot.className = `sys-panel__dot sys-panel__dot--${s.state}`;
    this.stateText.textContent = STATE_LABEL[s.state] ?? s.state;
    this.toggleBtn.hidden = !s.canStart;
    this.toggleBtn.textContent = s.state === 'up' || s.state === 'restarting' ? 'Desligar' : 'Ligar';
    this.logs.hidden = s.type !== 'local';
    const atEnd = this.logs.scrollTop + this.logs.clientHeight >= this.logs.scrollHeight - 8;
    this.logs.textContent = lines.length ? lines.join('\n') : s.type === 'local' ? 'Sem registro ainda. O que o sistema escrever aparece aqui.' : '';
    if (atEnd) this.logs.scrollTop = this.logs.scrollHeight;
    // visão embutida: só carrega quando o sistema está no ar (e recarrega ao voltar)
    if (s.state === 'up' && this.frameUrl !== s.url) {
      this.frameUrl = s.url;
      const frame = h('iframe', { class: 'sys-panel__frame', attrs: { src: s.url, title: `Sistema de ${name}`, sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals', referrerpolicy: 'no-referrer' } });
      this.view.replaceChildren(frame, h('p', { class: 'sys-panel__hint', text: 'Se a página não aparecer aqui, o sistema bloqueia a visão embutida: use "Abrir em outra aba".' }));
    } else if (s.state !== 'up') {
      this.frameUrl = '';
      this.view.replaceChildren(h('p', { class: 'sys-panel__empty', text: s.state === 'restarting' ? 'Subindo o sistema…' : 'O sistema está fora do ar.' }));
    }
  }

  private paintThread(msgs: Turn[]): void {
    const last = msgs.slice(-10);
    this.thread.replaceChildren(...last.map((m) => h('p', { class: `sys-panel__msg sys-panel__msg--${m.who}${m.error ? ' is-error' : ''}`, text: `${m.who === 'user' ? 'Você' : this.agentName}: ${m.text}` })));
    this.thread.scrollTop = this.thread.scrollHeight;
  }

  private async toggle(): Promise<void> {
    if (!this.info) return;
    const op = this.info.state === 'up' || this.info.state === 'restarting' ? 'stop' : 'start';
    this.toggleBtn.disabled = true;
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(this.id)}/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      this.note.textContent = res.ok ? '' : data.error || 'Não deu certo.';
    } finally { this.toggleBtn.disabled = false; void this.refresh(); }
  }

  private async send(): Promise<void> {
    const text = this.input.value.trim();
    if (!text) return;
    const resolver = this.mode.value === 'resolver';
    if (resolver && !window.confirm(`Deixar ${this.agentName} editar os arquivos deste projeto para resolver? Ele não faz commit nem publica.`)) return;
    const res = await fetch(`/api/systems/${encodeURIComponent(this.id)}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, mode: resolver ? 'resolver' : 'investigar' }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { this.note.textContent = data.error || 'Não consegui enviar.'; return; }
    this.input.value = '';
    this.note.textContent = resolver ? 'Enviado no modo Resolver.' : 'Enviado no modo Investigar.';
    void this.refresh();
  }
}
