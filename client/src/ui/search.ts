// Busca global (Ctrl+K): uma frase em todas as conversas, entregas e atividade dos agentes (GET /api/search).
// Clicar num resultado abre o agente (gaveta com a conversa). Todo texto do servidor entra como textContent.
import type { UiContext } from './context';
import { h, iconButton } from './dom';

interface Hit {
  kind: 'conversa' | 'entrega' | 'atividade';
  agent: string;
  agentName: string;
  at: number;
  snippet: { before: string; match: string; after: string };
  who?: 'dono' | 'agente';
}

const ICON =
  '<svg class="ui-px-icon" width="20" height="20" viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M2 0h4v1h1v1h1v4H7v1H6v1H2V7H1V6H0V2h1V1h1zm0 1v1H1v4h1v1h4V6h1V2H6V1zM7 7h1v1h1v1H8V8H7z"/></svg>';
const KIND_LABEL: Record<Hit['kind'], string> = { conversa: 'Conversa', entrega: 'Entrega', atividade: 'Atividade' };
const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

const when = (at: number): string => (at ? new Date(at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

export class SearchLauncher {
  readonly button: HTMLButtonElement;
  private readonly box: HTMLElement;
  private readonly input = h('input', { class: 'ui-search__input', type: 'search', attrs: { placeholder: 'Buscar nas conversas, entregas e atividade…', 'aria-label': 'Buscar', autocomplete: 'off' } });
  private readonly list = h('div', { class: 'ui-search__list', role: 'listbox' });
  private readonly note = h('p', { class: 'ui-search__note', attrs: { role: 'status', 'aria-live': 'polite' } });
  private timer = 0;
  private seq = 0;

  constructor(private readonly ctx: UiContext, mount: (el: HTMLElement) => void) {
    this.button = iconButton(ICON, 'Buscar nas conversas (Ctrl+K)', () => this.toggle());
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.box = h('div', { class: 'ui-search', role: 'dialog', hidden: true, attrs: { 'aria-label': 'Busca global' } }, this.input, this.note, this.list);
    this.input.addEventListener('input', () => {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.run(), DEBOUNCE_MS);
    });
    this.box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); this.toggle(); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.box.hidden && !this.box.contains(e.target as Node) && !this.button.contains(e.target as Node)) this.close();
    });
    mount(this.box);
  }

  get isOpen(): boolean {
    return !this.box.hidden;
  }

  toggle(): void {
    if (this.box.hidden) this.open();
    else this.close();
  }

  open(): void {
    this.box.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.input.focus();
    this.input.select();
  }

  close(): void {
    this.box.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.button.focus();
  }

  private async run(): Promise<void> {
    const q = this.input.value.trim();
    const mine = ++this.seq;
    if (q.length < MIN_CHARS) { this.list.replaceChildren(); this.note.textContent = q ? `Digite pelo menos ${MIN_CHARS} caracteres.` : ''; return; }
    this.note.textContent = 'Buscando…';
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=50`);
      const data = (await res.json()) as { results?: Hit[]; total?: number; error?: string };
      if (mine !== this.seq) return; // chegou uma resposta mais nova
      if (!res.ok) { this.note.textContent = data.error ?? 'Não consegui buscar.'; return; }
      const hits = data.results ?? [];
      this.note.textContent = hits.length ? `${data.total ?? hits.length} resultado(s)${(data.total ?? 0) > hits.length ? `, mostrando os ${hits.length} mais recentes` : ''}` : 'Nada encontrado.';
      this.list.replaceChildren(...hits.map((x) => this.row(x)));
    } catch {
      if (mine === this.seq) this.note.textContent = 'Sem resposta do servidor do Escritório.';
    }
  }

  private row(x: Hit): HTMLElement {
    const btn = h(
      'button',
      { class: 'ui-search__hit', type: 'button', role: 'option', on: { click: () => this.go(x) } },
      h('span', { class: 'ui-search__meta', text: `${x.agentName || 'Sem agente'} · ${KIND_LABEL[x.kind]}${x.who ? ` (${x.who})` : ''} · ${when(x.at)}` }),
      h('span', { class: 'ui-search__text' }, x.snippet.before, h('mark', { text: x.snippet.match }), x.snippet.after),
    );
    return btn;
  }

  private go(x: Hit): void {
    const id = `escritorio:${x.agent}`;
    if (!x.agent || !this.ctx.agent(id)) { this.note.textContent = 'Este agente não existe mais no escritório.'; return; }
    this.close();
    this.ctx.select({ type: 'agent', id }, { focus: true });
  }
}
