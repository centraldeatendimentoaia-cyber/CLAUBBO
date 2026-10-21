// Painel do jogo de pedra, papel e tesoura contra um agente (melhor de 3, com aposta). Abre pelo menu do boneco (ação
// "Desafiar"). As regras, o saldo, a jogada do agente e o humor são do servidor; aqui ficam o desenho, o teclado e a rede.
// Todo texto vindo do servidor entra só por h()/textContent, nunca como HTML. A lógica testável mora em jogo-model.ts.
import { desafiarAgente, jogarGesto, lerPartida, saldoDaCarteira } from '../net/interacao-api';
import { h } from './dom';
import { criarGuarda } from './interacao-model';
import { apostasPossiveis, GESTOS, humorRotulo, ICONES_GESTO, mensagemDaFalha, resumoRodada, rotuloGesto, textoResultado, type RodadaJogo } from './jogo-model';

export interface AbrirJogo {
  agente: { id: string; name: string; humor?: string };
  aoFechar: () => void;
}

type Fase = 'carregando' | 'aposta' | 'jogando' | 'fim';
const REVELACAO_MS = 700;
const chaveSessao = (agenteId: string): string => `jogo:partida:${agenteId}`;

const alvoDigitando = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement);

// try/catch: o sessionStorage pode faltar ou lançar (janela privada, dados bloqueados); sem ele só não retoma a partida.
function lembrar(agenteId: string, id: string | null): void {
  try {
    if (id) sessionStorage.setItem(chaveSessao(agenteId), id);
    else sessionStorage.removeItem(chaveSessao(agenteId));
  } catch { /* sem armazenamento: a partida só não é retomada */ }
}
function lembrado(agenteId: string): string | null {
  try {
    return sessionStorage.getItem(chaveSessao(agenteId));
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const placarDe = (v: unknown): { pessoa: number; agente: number } => {
  const p = (v ?? {}) as { pessoa?: unknown; agente?: unknown };
  return { pessoa: num(p.pessoa) ?? 0, agente: num(p.agente) ?? 0 };
};
function rodadaDe(v: unknown): RodadaJogo | null {
  const r = (v ?? {}) as Record<string, unknown>;
  return typeof r.gestoPessoa === 'string' && typeof r.gestoAgente === 'string' && typeof r.vencedor === 'string' && num(r.numero) !== null
    ? { numero: r.numero as number, gestoPessoa: r.gestoPessoa, gestoAgente: r.gestoAgente, vencedor: r.vencedor }
    : null;
}

let aberto = false; // um painel de jogo por vez

/** Abre o painel. Devolve a função que fecha (a mesma do Esc); null se já há um painel de jogo aberto. */
export function abrirJogo({ agente, aoFechar }: AbrirJogo): (() => void) | null {
  if (aberto) return null;
  aberto = true;
  const reduzido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const guarda = criarGuarda();
  const voltaFoco = document.activeElement;
  const vivo = h('p', { class: 'jogo-vivo', role: 'status', attrs: { 'aria-live': 'polite' } });
  const painel = h('div', { class: 'jogo', role: 'dialog', attrs: { 'aria-modal': 'true', 'aria-label': `Jogo contra ${agente.name}` } });

  let fase: Fase = 'carregando';
  let saldo: number | null = null;
  let id = '';
  let aposta = 0;
  let saldoAntes = 0;
  let rodada = 1;
  let placar = { pessoa: 0, agente: 0 };
  let ultima: RodadaJogo | null = null;
  let revelando = false;
  let resultado: string | undefined;
  let humor = agente.humor;
  let fala = '';
  let aviso = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const dizer = (t: string): void => { vivo.textContent = t; };

  function fechar(): void {
    clearTimeout(timer);
    window.removeEventListener('keydown', tecla, { capture: true });
    window.removeEventListener('keyup', soltou, { capture: true });
    painel.remove();
    aberto = false;
    if (voltaFoco instanceof HTMLElement && voltaFoco.isConnected) voltaFoco.focus({ preventScroll: true });
    aoFechar();
  }

  /** Estado vindo do servidor (início da partida, retomada ou resincronização). */
  function aplicarPartida(c: Record<string, unknown>): void {
    id = typeof c.id === 'string' ? c.id : id;
    aposta = num(c.aposta) ?? aposta;
    rodada = num(c.rodada) ?? rodada;
    placar = placarDe(c.placar);
    saldo = num(c.saldo) ?? saldo;
    const rodadas = Array.isArray(c.rodadas) ? c.rodadas : [];
    ultima = rodadaDe(rodadas[rodadas.length - 1]);
    if (saldo !== null) saldoAntes = saldo + aposta; // a aposta já saiu do saldo
    fase = 'jogando';
    revelando = false;
    lembrar(agente.id, id);
  }

  function voltarParaAposta(mensagem: string): void {
    fase = 'aposta';
    id = '';
    revelando = false;
    lembrar(agente.id, null);
    aviso = mensagem;
    void saldoDaCarteira().then((s) => { saldo = s; desenhar(); });
  }

  async function iniciar(): Promise<void> {
    const guardado = lembrado(agente.id);
    if (guardado) {
      const r = await lerPartida(guardado);
      if (!aberto) return;
      if (r.ok && r.corpo.fim !== true && r.corpo.estado === 'aberta') {
        aplicarPartida(r.corpo);
        aviso = 'Partida retomada.';
        dizer(aviso);
        desenhar();
        return;
      }
      lembrar(agente.id, null);
    }
    saldo = await saldoDaCarteira();
    if (!aberto) return;
    fase = 'aposta';
    desenhar();
  }

  async function desafiar(valor: number): Promise<void> {
    const r = await guarda.rodar(() => desafiarAgente(agente.id, valor));
    if (!r.rodou || !aberto) return;
    if (r.valor.ok) {
      aposta = valor;
      aplicarPartida({ ...r.valor.corpo, aposta: valor });
      ultima = null;
      resultado = undefined;
      fala = '';
      aviso = '';
      dizer('Partida aberta. Escolha pedra, papel ou tesoura.');
    } else {
      aviso = mensagemDaFalha(r.valor.status, r.valor.erro);
      dizer(aviso);
      void saldoDaCarteira().then((s) => { saldo = s; desenhar(); });
    }
    desenhar();
  }

  async function jogar(gesto: string): Promise<void> {
    if (fase !== 'jogando' || revelando) return;
    const r = await guarda.rodar(() => jogarGesto(id, gesto, rodada));
    if (!r.rodou || !aberto) return;
    if (!r.valor.ok) {
      const { status, erro } = r.valor;
      if (status === 404 || status === 410) voltarParaAposta(mensagemDaFalha(status, erro));
      else {
        aviso = mensagemDaFalha(status, erro);
        if (status === 409) {
          // rodada desatualizada (outra aba, clique duplo): relê o estado em vez de adivinhar
          const lida = await lerPartida(id);
          if (!aberto) return;
          if (lida.ok && lida.corpo.estado === 'aberta') aplicarPartida(lida.corpo);
          else voltarParaAposta(aviso);
        }
      }
      dizer(aviso);
      desenhar();
      return;
    }
    const c = r.valor.corpo;
    ultima = rodadaDe(c.rodada);
    placar = placarDe(c.placar);
    saldo = num(c.saldo) ?? saldo;
    aviso = '';
    if (c.fim === true) {
      fase = 'fim';
      resultado = typeof c.resultado === 'string' ? c.resultado : 'empate';
      humor = typeof c.humor === 'string' ? c.humor : humor;
      fala = typeof c.fala === 'string' ? c.fala : '';
      lembrar(agente.id, null);
    } else if (ultima) rodada = ultima.numero + 1;
    revelando = !reduzido;
    desenhar();
    const concluir = (): void => {
      revelando = false;
      desenhar();
      if (ultima) dizer(`${resumoRodada(ultima)} ${fase === 'fim' ? textoResultado(true, resultado, (saldo ?? 0) - saldoAntes) : ''}`.trim());
    };
    if (reduzido) concluir();
    else timer = setTimeout(concluir, REVELACAO_MS);
  }

  function novaPartida(): void {
    fase = 'aposta';
    ultima = null;
    resultado = undefined;
    fala = '';
    aviso = '';
    void saldoDaCarteira().then((s) => { saldo = s; desenhar(); });
    desenhar();
  }

  // ---------------------------------------------------------------- teclado (mesmo desenho do menu de interação)

  /** Com o painel aberto o teclado é dele: o resto do app (o boneco, atalhos) não vê a tecla. Em campo de texto não captura. */
  function tecla(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || alvoDigitando(e.target)) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
      return;
    }
    if (e.key === 'Tab') return;
    if (e.key === ' ' || e.key === 'Enter') {
      // o botão focado recebe o clique daqui; o keyup do Espaço é engolido (Firefox clicaria de novo)
      e.preventDefault();
      const alvo = e.target as HTMLElement | null;
      if (!e.repeat && alvo instanceof HTMLButtonElement && painel.contains(alvo)) alvo.click();
      return;
    }
    const i = ['1', '2', '3'].indexOf(e.key);
    if (i >= 0 && fase === 'jogando' && !e.repeat) {
      e.preventDefault();
      void jogar(GESTOS[i]);
    }
  }
  function soltou(e: KeyboardEvent): void {
    if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ---------------------------------------------------------------- desenho

  const btn = (texto: string, aoClicar: () => void, extra = '', desligado = false, atalho?: string): HTMLButtonElement =>
    h(
      'button',
      { class: `int-btn ${extra}`.trim(), type: 'button', attrs: { 'aria-disabled': desligado ? 'true' : undefined, 'aria-keyshortcuts': atalho }, on: { click: () => { if (!desligado) aoClicar(); } } },
      h('span', { text: texto }),
      atalho ? h('kbd', { text: atalho, attrs: { 'aria-hidden': 'true' } }) : null,
    );

  function desenhar(): void {
    const ativo = guarda.ativo;
    const hum = humorRotulo(humor);
    painel.replaceChildren(
      h('div', { class: 'int-titulo', text: `Pedra, papel e tesoura · ${agente.name}` }),
      h('p', { class: 'jogo-linha' },
        h('span', { text: `Humor: ${hum.icone} ${hum.palavra}` }),
        h('span', { text: saldo === null ? 'Saldo indisponível' : `Seu saldo: 🪙 ${saldo}` }),
      ),
    );
    let foco: HTMLButtonElement | null = null;
    if (fase === 'carregando') painel.append(h('p', { class: 'int-texto', text: 'Carregando…' }));

    if (fase === 'aposta') {
      // o saldo do agente não chega ao cliente: o servidor recusa (422) se ele não puder pagar
      const valores = apostasPossiveis(saldo, null);
      painel.append(h('p', { class: 'int-texto', text: 'Melhor de 3: vence quem ganhar 2 rodadas. Escolha a aposta; cada lado coloca o mesmo valor.' }));
      const linha = h('div', { class: 'int-acoes' });
      if (!valores.length) painel.append(h('p', { class: 'int-texto', text: 'Você não tem moedas para a menor aposta (5).' }));
      for (const v of valores) {
        const b = btn(`🪙 ${v}`, () => void desafiar(v), 'int-btn--ok', ativo);
        foco ??= b;
        linha.append(b);
      }
      painel.append(linha);
    }

    if (fase === 'jogando' || fase === 'fim') {
      const mostrar = ultima && !revelando ? ultima : null;
      painel.append(
        h('p', { class: 'jogo-placar', text: `Você ${placar.pessoa} × ${placar.agente} ${agente.name}` }),
        h('p', { class: 'int-texto', text: fase === 'jogando' ? `Rodada ${rodada} · aposta 🪙 ${aposta}` : `Aposta 🪙 ${aposta}` }),
      );
      if (ultima) {
        const agenteVisto = mostrar ? `${ICONES_GESTO[ultima.gestoAgente as keyof typeof ICONES_GESTO] ?? ''} ${rotuloGesto(ultima.gestoAgente)}` : '❔ escolhendo…';
        painel.append(
          h('div', { class: `jogo-mesa${revelando ? ' is-revelando' : ''}` },
            h('span', { text: `Você: ${ICONES_GESTO[ultima.gestoPessoa as keyof typeof ICONES_GESTO] ?? ''} ${rotuloGesto(ultima.gestoPessoa)}` }),
            h('span', { text: `${agente.name}: ${agenteVisto}` }),
          ),
          ...(mostrar ? [h('p', { class: 'int-texto', text: resumoRodada(ultima) })] : []),
        );
      }
    }

    if (fase === 'jogando') {
      const bloqueado = ativo || revelando;
      const linha = h('div', { class: 'int-acoes jogo-gestos' });
      GESTOS.forEach((g, i) => {
        const b = btn(`${ICONES_GESTO[g]} ${rotuloGesto(g)}`, () => void jogar(g), '', bloqueado, String(i + 1));
        foco ??= b;
        linha.append(b);
      });
      painel.append(linha);
    }

    if (fase === 'fim' && !revelando) {
      const hf = humorRotulo(humor);
      painel.append(
        h('p', { class: 'jogo-resultado', text: textoResultado(true, resultado, (saldo ?? 0) - saldoAntes) }),
        h('p', { class: 'int-texto', text: `${agente.name} agora está ${hf.icone} ${hf.palavra}.${fala ? ` “${fala}”` : ''}` }),
      );
      const outra = btn('Jogar de novo', novaPartida, 'int-btn--ok');
      foco ??= outra;
      painel.append(h('div', { class: 'int-acoes' }, outra));
    }

    if (aviso) painel.append(h('p', { class: 'int-resp', text: aviso }));
    painel.append(h('div', { class: 'int-acoes' }, btn('Fechar (Esc)', fechar)), vivo);
    // o foco volta para a ação principal a cada desenho (a tela é refeita inteira)
    (foco ?? (painel.querySelector('button') as HTMLButtonElement | null))?.focus({ preventScroll: true });
  }

  window.addEventListener('keydown', tecla, { capture: true });
  window.addEventListener('keyup', soltou, { capture: true });
  document.body.append(painel);
  desenhar();
  void iniciar();
  return fechar;
}
