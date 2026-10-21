// Menu de interação do boneco do jogador: a dica "E · Conversar com <nome>" perto do boneco e o menu aberto com E perto de
// um agente ou do elevador. A lógica de quais ações existem mora em interacao-model.ts; aqui ficam o desenho, o teclado
// e a rede. Todo texto vindo de agente ou do servidor entra só por h()/textContent, nunca como HTML.
// Todos os papéis veem as mesmas ações: quem decide (403, 409) é o servidor.
import { getFloor } from '../floor';
import { agradecer, obrigadosPossiveis, perguntarBtw, trocarModelo } from '../net/interacao-api';
import type { WorldSceneMe } from '../../../shared/world/api';
import type { Alvo } from '../world/player';
import type { PlayerWorld } from '../world/api';
import type { UiContext } from './context';
import { h } from './dom';
import { aparenciaDoJogador, criarGuarda, MENSAGEM_SEM_ELEVADOR, mensagemDaFalha, menuDoAgente, menuDoElevador, vizinhos, type ItemMenu } from './interacao-model';

const BTW_MAX = 500;

type Vista =
  | { tipo: 'menu' }
  | { tipo: 'btw'; resposta: string; enviando: boolean }
  | { tipo: 'confirmar'; direcao: 'subir' | 'descer'; de: string; para: string }
  | { tipo: 'texto'; titulo: string; texto: string };

const alvoDigitando = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement);

export class Interacao {
  private readonly dica = h('div', { class: 'int-dica', hidden: true, attrs: { 'aria-hidden': 'true' } });
  private painel: HTMLElement | null = null;
  private alvo: Alvo | null = null;
  private vista: Vista = { tipo: 'menu' };
  private indice = 0;
  /** null = /api/xp ainda não respondeu. */
  private obrigados: Set<string> | null = null;
  /** Uma chamada de rede por vez: troca de modelo, obrigado e btw. */
  private readonly guarda = criarGuarda();
  private abriuPor: Element | null = null;
  private ligado = false;

  /** `naCidade`: a cena da cidade está na tela (o escritório fica parado e o boneco não responde). */
  constructor(
    private readonly ctx: UiContext,
    private readonly player: PlayerWorld,
    private readonly naCidade: () => boolean,
    private readonly disponivel: () => boolean,
  ) {
    ctx.root.append(this.dica);
    window.addEventListener('keydown', (e) => this.teclaCaptura(e), { capture: true });
    window.addEventListener('keydown', (e) => this.teclaAbrir(e));
    // Firefox dispara o click do botão no keyup do Espaço; o keydown já tratou a tecla, então o keyup não pode clicar de novo.
    window.addEventListener('keyup', (e) => {
      if (this.painel && e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true });
    window.addEventListener('pointerdown', (e) => {
      if (this.painel && !this.painel.contains(e.target as Node)) this.fechar();
    });
    ctx.store.on('snapshot', () => this.tentarLigar());
    this.tentarLigar();
    requestAnimationFrame(() => this.laco());
  }

  // ---------------------------------------------------------------- ligar o boneco

  private tentando = false;

  /**
   * O boneco liga sempre que o escritório está ativo, com ou sem conta do World. Com o World disponível, a aparência
   * (`me`) vem do stream do mundo (a mesma fonte da cena Visita), que abre só para ler e fecha em seguida; sem World, ou
   * se o stream falhar ou demorar mais de 20 s, vale a aparência padrão (aparenciaDoJogador). Nunca tenta de novo em laço.
   */
  private tentarLigar(): void {
    if (this.ligado || this.tentando || !this.ctx.store.snapshot) return;
    if (!this.disponivel()) {
      this.ligarCom(undefined);
      return;
    }
    this.tentando = true;
    let acabou = false;
    let off: () => void = () => {};
    let stream: { close(): void } | null = null;
    let limite: ReturnType<typeof setTimeout> | undefined;
    const acabar = (me: WorldSceneMe | undefined): void => {
      if (acabou) return;
      acabou = true;
      clearTimeout(limite);
      off();
      stream?.close();
      this.tentando = false;
      this.ligarCom(me);
    };
    limite = setTimeout(() => acabar(undefined), 20_000);
    void import('../net/world-stream')
      .then((ws) => {
        if (acabou) return;
        const st = ws.createWorldStream({ mock: this.ctx.store.mock });
        stream = st;
        off = st.on((ev) => {
          if (ev.type === 'snapshot' && ev.snapshot.me) acabar(ev.snapshot.me);
        });
      })
      .catch(() => acabar(undefined));
  }

  private ligarCom(me: Pick<WorldSceneMe, 'name' | 'look' | 'parts'> | undefined): void {
    if (this.ligado) return;
    this.ligado = true;
    this.player.ligar(aparenciaDoJogador(me));
  }

  // ---------------------------------------------------------------- dica e menu aberto: um laço por quadro

  private laco(): void {
    requestAnimationFrame(() => this.laco());
    if (!this.ligado || document.hidden) return;
    if (this.naCidade()) {
      if (this.painel) this.fechar();
      this.dica.hidden = true;
      return;
    }
    if (this.painel) {
      this.dica.hidden = true;
      if (this.alvo?.tipo === 'agente' && !this.ctx.agent(this.alvo.id)) {
        this.fechar();
        this.ctx.announce('O agente saiu do escritório.');
      }
      return;
    }
    const alvo = this.player.alvo();
    const pos = alvo && this.player.alvoNaTela();
    if (!alvo || !pos) {
      this.dica.hidden = true;
      return;
    }
    const nome = alvo.tipo === 'agente' ? this.ctx.agent(alvo.id)?.name : null;
    if (alvo.tipo === 'agente' && !nome) {
      this.dica.hidden = true;
      return;
    }
    const texto = alvo.tipo === 'agente' ? `E · Conversar com ${nome}` : 'E · Usar o elevador';
    if (this.dica.textContent !== texto) this.dica.textContent = texto;
    this.dica.style.left = `${Math.round(pos.x)}px`;
    this.dica.style.top = `${Math.round(pos.y)}px`;
    this.dica.hidden = false;
  }

  // ---------------------------------------------------------------- teclado

  private teclaAbrir(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'e' || this.painel || !this.ligado || this.naCidade()) return;
    if (alvoDigitando(e.target) || document.querySelector('dialog[open], :not(dialog)[aria-modal="true"]')) return;
    const alvo = this.player.alvo();
    const pos = alvo && this.player.alvoNaTela();
    if (!alvo || !pos) return; // sem alvo à vista, o E não faz nada
    e.preventDefault();
    this.abrir(alvo, pos);
  }

  /** Com o painel aberto, o teclado é todo dele: o resto do app não vê a tecla (o comportamento padrão do navegador continua). */
  private teclaCaptura(e: KeyboardEvent): void {
    const p = this.painel;
    if (!p) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopPropagation();
    const alvo = e.target as HTMLElement | null;
    const dentro = !!alvo && p.contains(alvo);
    if (e.key === 'Escape') {
      e.preventDefault();
      this.fechar();
      return;
    }
    if (e.key === 'Tab') return;
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      return;
    }
    if (this.vista.tipo === 'menu') {
      const itens = this.itens();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.indice = (this.indice + (e.key === 'ArrowDown' ? 1 : itens.length - 1)) % Math.max(1, itens.length);
        this.focarItem();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.escolher(itens[this.indice]);
      } else {
        const i = itens.findIndex((it) => it.atalho === e.key);
        if (i >= 0) {
          e.preventDefault();
          this.indice = i;
          this.escolher(itens[i]);
        }
      }
      return;
    }
    if (this.vista.tipo === 'btw' && alvo instanceof HTMLTextAreaElement && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void this.enviarBtw(alvo.value);
    } else if (dentro && alvo instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      alvo.click();
    }
  }

  // ---------------------------------------------------------------- abrir, fechar, escolher

  private abrir(alvo: Alvo, pos: { x: number; y: number }): void {
    this.alvo = alvo;
    this.vista = { tipo: 'menu' };
    this.indice = 0;
    this.abriuPor = document.activeElement;
    this.obrigados = null;
    const painel = h('div', { class: 'int' });
    painel.style.left = `${Math.max(8, Math.min(Math.round(pos.x) + 24, innerWidth - 300))}px`;
    painel.style.top = `${Math.max(8, Math.min(Math.round(pos.y) - 24, innerHeight - 340))}px`;
    this.painel = painel;
    this.ctx.root.append(painel);
    this.desenhar();
    if (alvo.tipo === 'agente') {
      void obrigadosPossiveis().then((ids) => {
        if (this.painel !== painel) return;
        this.obrigados = ids;
        if (this.vista.tipo === 'menu') this.desenhar();
      });
    }
  }

  private fechar(): void {
    this.painel?.remove();
    this.painel = null;
    this.alvo = null;
    const volta = this.abriuPor;
    this.abriuPor = null;
    if (volta instanceof HTMLElement && volta.isConnected) volta.focus({ preventScroll: true });
  }

  private itens(): ItemMenu[] {
    const a = this.alvo;
    if (!a) return [];
    if (a.tipo === 'agente') {
      const ag = this.ctx.agent(a.id);
      if (!ag) return [];
      return menuDoAgente({ model: ag.model, provider: ag.provider, status: ag.status, ocioso: ag.status === 'idle', obrigadoPossivel: this.obrigados?.has(a.id) ?? false, carregando: this.obrigados === null });
    }
    return menuDoElevador(this.andares(), getFloor());
  }

  /** Os andares do prédio: um por sala, mais sempre o 1 e o 2 (terminais). O cliente não tem dado de quais andares têm elevador: todos entram como `temElevador` e `irParaAndar` é quem recusa. */
  private andares(): { andar: number; nome: string; temElevador: boolean }[] {
    const rooms = this.ctx.store.snapshot?.rooms ?? [];
    const andares = new Set<number>([1, 2, ...rooms.map((r) => r.floor ?? 1)]);
    return [...andares].sort((x, y) => x - y).map((andar) => {
      const nomes = rooms.filter((r) => (r.floor ?? 1) === andar).map((r) => r.name);
      return { andar, nome: nomes.length ? nomes.slice(0, 2).join(', ') : andar === 2 ? 'Terminais' : '', temElevador: true };
    });
  }

  private escolher(item: ItemMenu | undefined): void {
    const a = this.alvo;
    if (!item || !a || !item.habilitado) return; // item apagado: o motivo já está na tela
    if (item.acao === 'andar') {
      if (item.andar !== undefined && this.player.irParaAndar(item.andar)) this.fechar();
      else this.texto('Elevador', 'O elevador não pode levar você agora. Fique perto da porta e tente de novo.');
      return;
    }
    const ag = this.ctx.agent(a.id);
    if (!ag) return;
    switch (item.acao) {
      case 'conversar':
        this.fechar();
        this.ctx.select({ type: 'agent', id: a.id }, { focus: true });
        break;
      case 'desafiar':
        this.texto('Desafio', 'Os jogos chegam no projeto 4. Por enquanto não há nenhum jogo para jogar.');
        break;
      case 'btw':
        this.vista = { tipo: 'btw', resposta: '', enviando: false };
        this.desenhar();
        break;
      case 'agradecer':
        void this.agradecer(a.id);
        break;
      case 'subir': {
        const v = vizinhos(ag.model, ag.provider);
        if (v?.acima && ag.model) {
          this.vista = { tipo: 'confirmar', direcao: 'subir', de: ag.model, para: v.acima };
          this.desenhar();
        }
        break;
      }
      case 'descer':
        if (ag.model) void this.trocar(a.id, 'descer', ag.model);
        break;
    }
  }

  private texto(titulo: string, texto: string): void {
    this.vista = { tipo: 'texto', titulo, texto };
    this.desenhar();
    this.ctx.announce(texto);
  }

  // ---------------------------------------------------------------- ações com rede

  /** Uma chamada por vez: com outra em voo o disparo é ignorado (nada de segundo pedido nem de erro por cima do sucesso). */
  private async emVoo(fn: () => Promise<void>): Promise<void> {
    const feito = this.guarda.rodar(fn);
    this.desenhar(); // mostra "Enviando…"
    const r = await feito;
    if (r.rodou && this.painel) this.desenhar(); // a guarda já foi solta
  }

  private agradecer(id: string): Promise<void> {
    return this.emVoo(async () => {
      const r = await agradecer(id);
      if (!this.painel) return;
      if (r.ok) {
        const xp = typeof r.corpo.xp === 'number' ? ` (${r.corpo.xp} XP)` : '';
        this.obrigados?.delete(id);
        this.texto('Agradecer', `Obrigado enviado${xp}.`);
      } else this.texto('Agradecer', mensagemDaFalha('agradecer', r.status, r.erro));
    });
  }

  private trocar(id: string, direcao: 'subir' | 'descer', de: string): Promise<void> {
    return this.emVoo(async () => {
      const r = await trocarModelo(id, direcao, de);
      if (!this.painel) return;
      if (r.ok) {
        const para = typeof r.corpo.para === 'string' ? r.corpo.para : '';
        this.ctx.invalidate();
        this.texto('Modelo', `Modelo trocado: ${de} → ${para}.`);
      } else {
        if (r.status === 409) this.ctx.invalidate();
        this.texto('Modelo', mensagemDaFalha(direcao, r.status, r.erro));
      }
    });
  }

  private enviarBtw(texto: string): Promise<void> {
    const a = this.alvo;
    const pergunta = texto.trim().slice(0, BTW_MAX);
    if (!a || !pergunta || this.vista.tipo !== 'btw' || this.guarda.ativo) return Promise.resolve();
    return this.emVoo(async () => {
      this.vista = { tipo: 'btw', resposta: 'Pensando…', enviando: true };
      this.desenhar();
      const r = await perguntarBtw(a.id, pergunta);
      if (!this.painel || this.vista.tipo !== 'btw') return;
      const resposta = r.ok ? (typeof r.corpo.resposta === 'string' ? r.corpo.resposta : '') : mensagemDaFalha('btw', r.status, r.erro);
      this.vista = { tipo: 'btw', resposta, enviando: false };
      this.desenhar();
      this.ctx.announce(resposta);
    });
  }

  // ---------------------------------------------------------------- desenho

  private focarItem(): void {
    const botoes = this.painel?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    botoes?.forEach((b, i) => (b.tabIndex = i === this.indice ? 0 : -1));
    botoes?.[this.indice]?.focus({ preventScroll: true });
  }

  private desenhar(): void {
    const p = this.painel;
    const a = this.alvo;
    if (!p || !a) return;
    const ag = a.tipo === 'agente' ? this.ctx.agent(a.id) : undefined;
    const titulo = a.tipo === 'agente' ? `${ag?.name ?? ''}${ag?.model ? ` · ${ag.model}` : ''}` : 'Elevador (E)';
    const v = this.vista;
    p.replaceChildren();
    p.removeAttribute('role');
    p.removeAttribute('aria-modal');
    p.removeAttribute('aria-label');
    if (v.tipo === 'menu') {
      const itens = this.itens();
      this.indice = Math.min(this.indice, Math.max(0, itens.length - 1));
      p.append(h('div', { class: 'int-titulo', text: titulo }));
      if (!itens.length) p.append(h('p', { class: 'int-texto', text: MENSAGEM_SEM_ELEVADOR }));
      const lista = h('div', { role: 'menu', attrs: { 'aria-label': titulo } });
      itens.forEach((it, i) => {
        const botao = h(
          'button',
          {
            class: `int-item${it.habilitado ? '' : ' is-apagado'}${i === this.indice ? ' is-on' : ''}`,
            type: 'button',
            role: 'menuitem',
            tabIndex: i === this.indice ? 0 : -1,
            attrs: { 'aria-disabled': it.habilitado ? undefined : 'true', 'aria-keyshortcuts': it.atalho },
            on: { click: () => { this.indice = i; this.escolher(it); }, focus: () => { this.indice = i; } },
          },
          h('span', { class: 'int-rotulo', text: it.rotulo }),
          it.motivo ? h('span', { class: 'int-motivo', text: ` — ${it.motivo}` }) : null,
          h('kbd', { text: it.atalho, attrs: { 'aria-hidden': 'true' } }),
        );
        lista.append(botao);
      });
      p.append(lista);
      if (this.guarda.ativo) p.append(h('p', { class: 'int-resp', role: 'status', text: 'Enviando…' }));
      this.focarItem();
      return;
    }
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    p.setAttribute('aria-label', v.tipo === 'texto' ? v.titulo : v.tipo === 'btw' ? `Perguntar a ${ag?.name ?? 'agente'}` : 'Confirmar');
    const voltar = h('button', { class: 'int-btn', type: 'button', text: 'Voltar', on: { click: () => { this.vista = { tipo: 'menu' }; this.desenhar(); } } });
    if (v.tipo === 'btw') {
      const campo = h('textarea', { class: 'int-campo', attrs: { maxlength: BTW_MAX, rows: 3, 'aria-label': 'Sua pergunta', placeholder: 'Pergunta rápida (Enter envia)' } });
      campo.disabled = v.enviando;
      p.append(
        h('div', { class: 'int-titulo', text: `Perguntar a ${ag?.name ?? 'agente'} (/btw)` }),
        campo,
        h('p', { class: 'int-resp', role: 'status', text: v.resposta }),
        h('div', { class: 'int-acoes' }, h('button', { class: 'int-btn int-btn--ok', type: 'button', text: 'Enviar', on: { click: () => void this.enviarBtw(campo.value) } }), voltar),
      );
      if (!v.enviando) campo.focus({ preventScroll: true });
    } else if (v.tipo === 'confirmar') {
      const ok = h('button', { class: 'int-btn int-btn--ok', type: 'button', text: this.guarda.ativo ? 'Enviando…' : 'Confirmar', attrs: { 'aria-disabled': this.guarda.ativo ? 'true' : undefined }, on: { click: () => void this.trocar(a.id, v.direcao, v.de) } });
      p.append(h('div', { class: 'int-titulo', text: 'Puxar a orelha' }), h('p', { class: 'int-texto', text: `${v.de} → ${v.para}: o custo sobe` }), h('div', { class: 'int-acoes' }, ok, voltar));
      ok.focus({ preventScroll: true });
    } else {
      const fechar = h('button', { class: 'int-btn int-btn--ok', type: 'button', text: 'Entendi', on: { click: () => this.fechar() } });
      p.append(h('div', { class: 'int-titulo', text: v.titulo }), h('p', { class: 'int-texto', text: v.texto }), h('div', { class: 'int-acoes' }, fechar, voltar));
      fechar.focus({ preventScroll: true });
    }
  }
}

/** Liga o menu de interação se o mundo tem boneco (não existe na cena Visita). Chamado por ui/index.ts. */
export function criarInteracao(ctx: UiContext, naCidade: () => boolean, disponivel: () => boolean): Interacao | null {
  const player = (ctx.world as { player?: PlayerWorld }).player;
  return player ? new Interacao(ctx, player, naCidade, disponivel) : null;
}
