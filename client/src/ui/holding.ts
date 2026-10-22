// Painel da holding: o que espera decisão do dono, rotinas, elenco e atividade, numa janela só (tecla H).
// Fala com /api/holding da própria porta. Todo texto vindo de agente ou do servidor entra só por h()/textContent, nunca como HTML.
// A lógica testável (atalhos, permissões, resultado das decisões) mora em holding-model.ts; aqui fica o desenho e a rede.
import type { HoldingView, PendingItem } from '../../../shared/types';
import { saldoDaCarteira } from '../net/interacao-api';
import type { UiComponent, UiContext } from './context';
import { h } from './dom';
import {
  actionsOf, ageLabel, applyDecision, batchState, decisionOutcome, decisionUrl, focusAfterRemoval, keyAction, rotinaMarker, shortcutFor, sortPending, tabWrap, tagsOf,
  type Marcador, type Outcome,
} from './holding-model';

export interface RenderOpts {
  now: number;
  /** Moedas da carteira do dono neste navegador; null quando o armazenamento não está disponível. */
  coins: number | null;
  /** Aviso por cartão (409, 403, erro): o cartão continua na tela com o aviso. */
  notes: ReadonlyMap<string, string>;
  /** Avisos gerais (cartão que já saiu da tela, lote, avaliação). */
  avisos: readonly string[];
  /** Cartões abertos para revisão (item não seguro só mostra Aprovar depois de aberto). */
  abertos: ReadonlySet<string>;
  /** Cartões com decisão em andamento: botões desligados, nunca repete a ação. */
  ocupados: ReadonlySet<string>;
  on: { acao(p: PendingItem, a: 'aprovar' | 'recusar'): void; abrir(p: PendingItem): void; lote(): void; bom(task: string): void };
}

const AVATARES = ['rosa', 'turquesa', 'amarelo', 'lima'] as const;
const avatarCor = (nome: string): (typeof AVATARES)[number] => AVATARES[[...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATARES.length];

/** Cor + forma + texto: o estado nunca depende só da cor. */
function marcador(m: Marcador): HTMLElement {
  return h('span', { class: 'hold-marca' }, h('span', { class: `hold-forma hold-forma--${m.forma} hold-cor--${m.cor}`, attrs: { 'aria-hidden': 'true' } }), h('span', { text: m.texto }));
}

const tipo = (n: number, um: string, varios: string): string => (n === 1 ? um : varios);

function cartao(p: PendingItem, i: number, v: HoldingView, o: RenderOpts): HTMLElement {
  const acoes = actionsOf(p, v.papel);
  const aberto = o.abertos.has(p.id);
  const ocupado = o.ocupados.has(p.id);
  const atalho = shortcutFor(i);
  const kbd = atalho ? h('kbd', { text: atalho, attrs: { 'aria-hidden': 'true' } }) : null;
  const btn = (acao: 'aprovar' | 'recusar' | 'abrir', texto: string, cls: string, key = false) =>
    h('button', {
      class: `hold-btn ${cls}`, type: 'button', attrs: { 'data-k': `${p.id}:${acao}`, 'aria-label': `${texto}: ${p.title}${key && atalho ? ` (atalho ${atalho})` : ''}`, ...(acao === 'abrir' ? { 'aria-expanded': String(aberto) } : {}), disabled: ocupado },
      on: { click: () => (acao === 'abrir' ? o.on.abrir(p) : o.on.acao(p, acao)) },
    }, texto, key ? kbd : null);

  let botoes: HTMLElement[];
  if (acoes.length === 0) {
    botoes = [h('p', { class: 'hold-aguarda', text: 'aguarda o dono' })];
  } else if (!acoes[0].deliberada) {
    botoes = [btn('aprovar', 'Aprovar', 'hold-btn--lima', true), btn('recusar', 'Recusar', 'hold-btn--roxo')];
  } else {
    // Item não seguro: o atalho só abre a revisão; aprovar e recusar exigem clique no botão depois de aberto.
    botoes = [btn('abrir', aberto ? 'Fechar revisão' : 'Revisar', 'hold-btn--turquesa', true)];
    if (aberto) botoes.push(btn('aprovar', p.sendsMessage ? 'Aprovar envio' : 'Aprovar', p.sendsMessage ? 'hold-btn--rosa' : 'hold-btn--lima'), btn('recusar', 'Recusar', 'hold-btn--roxo'));
  }

  const etiquetas = [
    h('span', { class: `hold-tag ${p.urgent ? 'hold-tag--risco' : 'hold-tag--aviso'}`, text: `esperando há ${ageLabel(p.since, o.now)}` }),
    ...tagsOf(p).map((t) => h('span', { class: `hold-tag hold-tag--${t.tone}`, text: t.text })),
  ];
  const nota = o.notes.get(p.id) ?? (ocupado ? 'Enviando a decisão…' : '');
  return h(
    'article',
    { class: `hold-card${p.urgent ? ' is-urgent' : ''}${aberto ? ' is-aberto' : ''}`, tabIndex: -1, attrs: { 'data-k': `${p.id}:card`, 'aria-label': `${p.agent}: ${p.title}` } },
    h('span', { class: `hold-av hold-av--${avatarCor(p.agent)}`, text: [...p.agent][0]?.toUpperCase() ?? '?', attrs: { 'aria-hidden': 'true' } }),
    h(
      'div',
      { class: 'hold-card__corpo' },
      h('div', { class: 'hold-quem', text: `${p.agent} pediu` }),
      h('div', { class: 'hold-t', text: p.title }),
      h('div', { class: 'hold-d', text: p.text }),
      h('div', { class: 'hold-meta' }, ...etiquetas),
      nota ? h('p', { class: 'hold-nota', text: nota }) : null,
    ),
    h('div', { class: 'hold-acts' }, ...botoes),
  );
}

/** Desenha a página inteira a partir do que o servidor mandou. Sem rede, sem estado: o painel guarda o estado e chama isto. */
export function renderHolding(v: HoldingView, o: RenderOpts): HTMLElement {
  const fila = sortPending(v.pendencias ?? []);
  const lote = batchState(v);
  const urgentes = fila.filter((p) => p.urgent).length;

  const hero = h(
    'section',
    { class: 'hold-hero', attrs: { 'aria-label': 'Esperando você' } },
    h(
      'div',
      { class: 'hold-hh' },
      h('h2', { class: 'hold-h2', text: 'Esperando você', tabIndex: -1, attrs: { 'data-k': 'titulo' } }),
      h('small', { text: fila.length ? `${fila.length} ${tipo(fila.length, 'pedido', 'pedidos')}${urgentes ? ` · ${urgentes} com espera longa` : ''}` : '' }),
      lote.enabled
        ? h('button', { class: 'hold-btn hold-btn--lima hold-todos', type: 'button', attrs: { 'data-k': 'lote', 'aria-label': `Aprovar os seguros (${lote.count}), atalho A`, disabled: o.ocupados.has('lote') }, on: { click: () => o.on.lote() } }, o.ocupados.has('lote') ? 'Enviando…' : `Aprovar os seguros (${lote.count})`, h('kbd', { text: 'A', attrs: { 'aria-hidden': 'true' } }))
        : null,
    ),
    ...o.avisos.map((a) => h('p', { class: 'hold-nota hold-nota--geral', text: a })),
    fila.length === 0 ? h('p', { class: 'hold-vazio', text: 'Nada espera você. Quando um agente pedir uma decisão, ela aparece aqui.' }) : null,
    ...fila.map((p, i) => cartao(p, i, v, o)),
  );

  const avaliar = (v.avaliar ?? []).length
    ? h(
      'section',
      { class: 'hold-pn hold-avaliar', attrs: { 'aria-label': 'Para você avaliar' } },
      h('h3', { class: 'hold-h3', text: 'Para você avaliar' }),
      ...v.avaliar.map((a) =>
        h(
          'div',
          { class: 'hold-row' },
          h('span', { class: 'hold-row__t', text: `${a.agent}: ${a.title}` }),
          v.papel === 'dono' ? h('button', { class: 'hold-btn hold-btn--lima hold-btn--mini', type: 'button', text: 'Ficou bom', attrs: { 'aria-label': `Ficou bom: ${a.title}` }, on: { click: () => o.on.bom(a.task) } }) : null,
        )),
    )
    : null;

  const r = v.rotinas ?? { rodaram: 0, falharam: 0, previstas: 0, lista: [] };
  const falhas = r.lista.filter((x) => x.estado === 'falhou');
  const kpi = (valor: string, rotulo: string, cor: string, extra?: Node) =>
    h('div', { class: 'hold-kpi' }, h('b', { class: `hold-cor--${cor}-txt` }, extra ?? null, valor), h('span', { text: rotulo }));
  const faixa = h(
    'section',
    { class: 'hold-strip', attrs: { 'aria-label': 'Indicadores' } },
    kpi(`${r.rodaram}/${r.rodaram + r.falharam + r.previstas}`, 'ROTINAS DE HOJE', 'lima'),
    kpi(String(r.falharam), r.falharam ? `${tipo(r.falharam, 'FALHOU', 'FALHARAM')} · ${falhas.map((f) => f.title).join(', ').toUpperCase()}` : 'FALHAS', r.falharam ? 'rosa' : 'lilas', r.falharam ? h('span', { class: 'hold-forma hold-forma--triangulo hold-cor--rosa', attrs: { 'aria-hidden': 'true' } }) : undefined),
    kpi(`+${v.xpHoje ?? 0}`, 'XP DO ELENCO HOJE', 'turquesa'),
    kpi(o.coins === null ? '—' : `🪙 ${o.coins}`, 'MOEDAS DO ESCRITÓRIO', 'amarelo'),
  );

  const lista = [...r.lista].sort((a, b) => Number(b.estado === 'falhou') - Number(a.estado === 'falhou'));
  const rotinas = h(
    'section',
    { class: 'hold-pn', attrs: { 'aria-label': 'Rotinas' } },
    h('h3', { class: 'hold-h3', text: 'Rotinas' }),
    lista.length === 0 ? h('p', { class: 'hold-vazio', text: 'Nenhuma rotina hoje.' }) : null,
    ...lista.map((x) =>
      h(
        'div',
        { class: `hold-row${x.estado === 'falhou' ? ' hold-row--falha' : ''}` },
        marcador(rotinaMarker(x.estado)),
        h('span', { class: 'hold-row__t', text: x.title }),
        h('small', { text: `${x.agent}${x.whenLabel ? ` · ${x.whenLabel}` : ''}` }),
      )),
  );
  const elenco = h(
    'section',
    { class: 'hold-pn', attrs: { 'aria-label': 'Elenco' } },
    h('h3', { class: 'hold-h3', text: 'Elenco' }),
    (v.elenco ?? []).length === 0 ? h('p', { class: 'hold-vazio', text: 'O elenco ainda não ganhou XP.' }) : null,
    ...(v.elenco ?? []).map((e) => {
      const pct = Math.round(Math.min(1, Math.max(0, e.progresso)) * 100);
      return h(
        'div',
        { class: 'hold-row' },
        h('span', { class: 'hold-row__t', text: e.agent }),
        h('small', { text: `Nv ${e.nivel} · ${e.xp} XP` }),
        h('div', { class: 'hold-bar', role: 'progressbar', attrs: { 'aria-label': `Progresso de ${e.agent} para o próximo nível`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct } }, h('i', { style: `width:${pct}%` })),
      );
    }),
  );

  const ticker = h(
    'section',
    { class: 'hold-ticker', attrs: { 'aria-label': 'Atividade recente' } },
    ...((v.ticker ?? []).length ? v.ticker.slice(-6).reverse().map((t) => h('div', { class: 'hold-ticker__i', text: `▶ ${t.text} (há ${ageLabel(t.at, o.now)})` })) : [h('div', { class: 'hold-ticker__i', text: 'Sem atividade recente.' })]),
  );

  return h('div', { class: 'hold-page' }, hero, avaliar, faixa, h('div', { class: 'hold-two' }, rotinas, elenco), ticker);
}

const digitando = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
const POLL_MS = 5000;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class HoldingPanel implements UiComponent {
  private root: HTMLElement | null = null;
  private content!: HTMLElement;
  private live!: HTMLElement;
  private opener: HTMLElement | null = null;
  private view: HoldingView | null = null;
  private raw = '';
  private minuto = -1;
  private semRede = false;
  private timer: number | null = null;
  private notes = new Map<string, string>();
  private avisos: string[] = [];
  private abertos = new Set<string>();
  private ocupados = new Set<string>();
  private focoDepois: string | null = null;
  private apertando = false;
  private sujo = false;
  private contagem = -1;
  private coins: number | null = null;

  constructor(private readonly ctx?: UiContext) {}

  get isOpen(): boolean { return this.root !== null; }

  toggle(opener?: HTMLElement | null): void {
    if (this.root) this.close();
    else this.open(opener);
  }

  open(opener?: HTMLElement | null): void {
    if (this.root) return;
    // Quem abriu recebe o foco de volta ao fechar (o botão da barra ou, na falta dele, o que tinha o foco).
    this.opener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const fechar = h('button', { class: 'hold-btn hold-btn--roxo', type: 'button', text: 'Fechar (Esc)', on: { click: () => this.close() } });
    this.content = h('div', { class: 'hold-content' }, h('p', { class: 'hold-vazio', text: 'Carregando…' }));
    // Região viva fixa (fora do que é redesenhado): é ela que o leitor de tela anuncia.
    this.live = h('div', { class: 'hold-sr', role: 'status', attrs: { 'aria-live': 'polite' } });
    this.root = h('div', { class: 'hold', role: 'dialog', attrs: { 'aria-label': 'Painel da holding', 'aria-modal': 'true' } }, h('div', { class: 'hold-head' }, h('h1', { class: 'hold-h1', text: 'Holding' }), fechar), this.live, this.content);
    this.root.addEventListener('pointerdown', () => { this.apertando = true; });
    (document.querySelector('.ui-root') ?? document.body).append(this.root);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('pointerup', this.soltou);
    window.addEventListener('pointercancel', this.soltou);
    document.addEventListener('visibilitychange', this.visivel);
    fechar.focus();
    void this.load().then(() => this.agendar());
  }

  close(): void {
    if (!this.root) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('pointerup', this.soltou);
    window.removeEventListener('pointercancel', this.soltou);
    document.removeEventListener('visibilitychange', this.visivel);
    this.root.remove();
    this.root = null;
    this.raw = '';
    this.minuto = -1;
    this.contagem = -1;
    this.apertando = false;
    this.sujo = false;
    this.semRede = false;
    this.view = null;
    this.notes.clear();
    this.avisos = [];
    this.abertos.clear();
    this.ocupados.clear();
    this.focoDepois = null;
    if (this.opener?.isConnected) this.opener.focus();
    this.opener = null;
  }

  /** Quando o resto da interface muda (UiComponent): só redesenha se a janela estiver aberta. */
  render(): void { this.draw(); }

  private now = (): number => this.ctx?.now() ?? Date.now();

  private agendar(): void {
    if (!this.root) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.load().then(() => this.agendar()); }, POLL_MS);
  }

  private visivel = (): void => { if (!document.hidden && this.root) void this.load(); };

  private soltou = (): void => {
    this.apertando = false;
    // O clique chega depois do pointerup: redesenhar aqui trocaria o botão sob o mouse e o clique se perderia.
    window.setTimeout(() => { if (this.sujo && !this.apertando) this.draw(); }, 0);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key === 'Tab') return this.prenderTab(e);
    // O escritório (e a cidade) não andam por teclas atrás da janela.
    if (/^(w|a|s|d|Arrow.*)$/i.test(e.key) && !digitando(e.target)) e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || e.repeat || digitando(e.target) || !this.view) return;
    const a = keyAction(this.view, e.key);
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    if (a.kind === 'lote') return void this.lote();
    const p = this.view.pendencias.find((x) => x.id === a.id);
    if (!p) return;
    if (a.action === 'aprovar') void this.acao(p, 'aprovar');
    else this.abrir(p);
  };

  /** Tab fica dentro da janela: do último focável volta ao primeiro e vice-versa. */
  private prenderTab(e: KeyboardEvent): void {
    if (!this.root) return;
    const lista = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const i = lista.indexOf(document.activeElement as HTMLElement);
    if (i < 0 && this.root.contains(document.activeElement)) return; // cartão ou título com foco: a ordem natural continua dali
    const alvo = tabWrap(i, lista.length, e.shiftKey);
    if (alvo === null) return;
    e.preventDefault();
    lista[alvo].focus();
  }

  /** Se o cartão focado vai sair da tela, o foco passa ao cartão seguinte (ou ao anterior, ou ao título). */
  private guardarFoco(antes: HoldingView, depois: HoldingView, comFoco?: string): void {
    const ativo = document.activeElement;
    const k = ativo instanceof HTMLElement && this.root?.contains(ativo) ? ativo.getAttribute('data-k') : null;
    const id = comFoco ?? k?.replace(/:(card|aprovar|recusar|abrir)$/, '');
    if (!id || id === 'titulo' || depois.pendencias.some((p) => p.id === id)) return;
    const prox = focusAfterRemoval(antes.pendencias.filter((p) => depois.pendencias.some((d) => d.id === p.id) || p.id === id), id);
    this.focoDepois = prox ? `${prox}:card` : 'titulo';
  }

  private async load(): Promise<void> {
    if (this.view && document.hidden) return; // aba escondida: não consulta o servidor à toa
    let raw: string;
    let next: HoldingView;
    try {
      const res = await fetch('/api/holding');
      raw = await res.text();
      if (!res.ok) throw new Error(String(res.status));
      next = JSON.parse(raw) as HoldingView;
    } catch {
      if (!this.root) return;
      if (!this.semRede) this.dizer('Sem conexão com o servidor do escritório; mostrando o último estado.');
      this.semRede = true;
      this.draw();
      return;
    }
    if (!this.root) return; // fechou enquanto a resposta vinha
    this.semRede = false;
    const minuto = Math.floor(this.now() / 60_000);
    const mudou = raw !== this.raw || minuto !== this.minuto || this.sujo;
    this.raw = raw;
    this.minuto = minuto;
    if (this.view) this.guardarFoco(this.view, next);
    this.view = next;
    // saldo do servidor, sem atrasar o primeiro desenho; se falhar, o número some (nunca o do navegador)
    void saldoDaCarteira().then((c) => {
      if (!this.root || c === this.coins) return;
      this.coins = c;
      this.draw();
    });
    const ids = new Set(next.pendencias.map((p) => p.id));
    for (const k of [...this.notes.keys()]) if (!ids.has(k)) this.notes.delete(k);
    for (const k of [...this.abertos]) if (!ids.has(k)) this.abertos.delete(k);
    if (next.pendencias.length > this.contagem && this.contagem >= 0) this.dizer(`${next.pendencias.length} ${tipo(next.pendencias.length, 'pedido espera', 'pedidos esperam')} você.`);
    this.contagem = next.pendencias.length;
    if (mudou) this.draw();
  }

  private dizer(texto: string): void {
    // Uma região viva só: a global do escritório quando existe; senão a da própria janela.
    if (this.ctx) this.ctx.announce(texto);
    else if (this.live) this.live.textContent = texto;
  }

  private draw(): void {
    if (!this.root || !this.view) return;
    if (this.apertando) { this.sujo = true; return; }
    this.sujo = false;
    const ativo = document.activeElement;
    const foco = this.focoDepois ?? (ativo instanceof HTMLElement && this.root.contains(ativo) ? ativo.getAttribute('data-k') : null);
    this.focoDepois = null;
    const pagina = renderHolding(this.view, {
      now: this.now(), coins: this.coins, notes: this.notes, avisos: this.avisos, abertos: this.abertos, ocupados: this.ocupados,
      on: { acao: (p, a) => void this.acao(p, a), abrir: (p) => this.abrir(p), lote: () => void this.lote(), bom: (t) => void this.bom(t) },
    });
    this.content.replaceChildren(...(this.semRede ? [h('p', { class: 'hold-nota hold-nota--geral', text: 'Sem conexão com o servidor do escritório. Mostrando o último estado.', role: 'alert' })] : []), pagina);
    if (foco) ((this.content.querySelector(`[data-k="${CSS.escape(foco)}"]`) ?? (this.focoDepois === null ? this.content.querySelector('[data-k="titulo"]') : null)) as HTMLElement | null)?.focus();
  }

  /** Abre o cartão para revisão (não decide nada) e leva o foco para ele. */
  private abrir(p: PendingItem): void {
    if (this.abertos.has(p.id)) this.abertos.delete(p.id);
    else this.abertos.add(p.id);
    this.focoDepois = `${p.id}:card`;
    this.draw();
  }

  private async acao(p: PendingItem, a: 'aprovar' | 'recusar'): Promise<void> {
    if (this.ocupados.has(p.id) || !this.view) return;
    // O botão fica desligado durante o envio e perde o foco: guarda de quem era para devolvê-lo.
    const tinhaFoco = document.activeElement instanceof HTMLElement && document.activeElement.getAttribute('data-k')?.startsWith(`${p.id}:`);
    this.ocupados.add(p.id);
    this.draw();
    let o: Outcome;
    try {
      const res = await fetch(decisionUrl(p, a), { method: 'POST', headers: JSON_HEADERS, body: '{}' });
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      o = decisionOutcome(res.status, typeof body.error === 'string' ? body.error : '');
    } catch {
      o = { kind: 'erro', texto: 'sem conexão com o servidor' };
    }
    this.ocupados.delete(p.id);
    if (!this.root || !this.view) return;
    const r = applyDecision(this.view, p.id, o);
    this.guardarFoco(this.view, r.view, tinhaFoco ? p.id : undefined);
    if (tinhaFoco && this.focoDepois === null) this.focoDepois = `${p.id}:card`; // o cartão ficou (aviso): foco volta a ele
    this.view = r.view;
    if (o.kind === 'ja-decidido' && r.nota) this.avisos = [r.nota];
    else if (r.nota) this.notes.set(p.id, r.nota);
    else this.notes.delete(p.id);
    if (r.nota) this.dizer(r.nota);
    else this.dizer(a === 'aprovar' ? `Aprovado: ${p.title}` : `Recusado: ${p.title}`);
    this.draw();
    // Nunca repete a ação: só relê o servidor (feito, já decidido ou "mudou").
    if (o.kind === 'feito' || o.kind === 'ja-decidido' || r.recarregar) await this.load();
  }

  private async lote(): Promise<void> {
    if (!this.view || !batchState(this.view).enabled || this.ocupados.has('lote')) return;
    this.ocupados.add('lote');
    this.draw();
    try {
      const res = await fetch('/api/pendencias/aprovar-seguros', { method: 'POST', headers: JSON_HEADERS, body: '{}' });
      const body = (await res.json().catch(() => ({}))) as { aprovados?: unknown; error?: unknown };
      const n = Array.isArray(body.aprovados) ? body.aprovados.length : 0;
      this.avisos = [res.ok ? `${n} ${tipo(n, 'pedido seguro aprovado', 'pedidos seguros aprovados')}.` : typeof body.error === 'string' ? body.error : 'não consegui aprovar os seguros'];
    } catch {
      this.avisos = ['sem conexão com o servidor'];
    }
    this.ocupados.delete('lote');
    this.dizer(this.avisos[0]);
    await this.load();
    this.draw();
  }

  private async bom(task: string): Promise<void> {
    if (!this.view || this.ocupados.has(`bom:${task}`)) return;
    this.ocupados.add(`bom:${task}`);
    try {
      const res = await fetch('/api/xp/ficou-bom', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ task }) });
      const body = (await res.json().catch(() => ({}))) as { error?: unknown; xp?: unknown; agent?: unknown };
      if (res.ok) {
        this.view = { ...this.view, avaliar: this.view.avaliar.filter((a) => a.task !== task) };
        this.avisos = [typeof body.agent === 'string' && typeof body.xp === 'number' ? `Ficou bom: ${body.agent} ganhou XP.` : 'Avaliação registrada.'];
      } else {
        this.avisos = [typeof body.error === 'string' ? body.error : 'não consegui registrar a avaliação'];
      }
    } catch {
      this.avisos = ['sem conexão com o servidor'];
    }
    this.ocupados.delete(`bom:${task}`);
    this.dizer(this.avisos[0]);
    this.draw();
    await this.load();
  }
}
