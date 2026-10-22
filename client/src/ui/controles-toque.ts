// Controles do boneco na tela de toque: direcional à esquerda, botão de interagir (o "E") e correr à direita. Só aparecem
// em tela de toque, nunca com um painel de interação ou de jogo aberto (que ficam por cima, com botões grandes).
// Tudo vai pelas mesmas portas do teclado: `player.setIntent` anda e `interacao.acionar()` faz o que o E faz.
import { tr } from '../../../shared/i18n';
import type { PlayerWorld, WorldApi } from '../world/api';
import { intencaoDe, telaDeToque, type Direcao } from './controles-toque-model';
import { h } from './dom';
import type { Interacao } from './interacao';

const SETAS: Record<Direcao, string> = { up: '▲', left: '◀', right: '▶', down: '▼' };
const ROTULOS = (): Record<Direcao, string> => ({ up: tr('Andar para cima'), left: tr('Andar para a esquerda'), right: tr('Andar para a direita'), down: tr('Andar para baixo') });

export function criarControlesToque(root: HTMLElement, world: WorldApi, player: PlayerWorld, interacao: Interacao): void {
  if (!telaDeToque(globalThis.matchMedia?.bind(globalThis))) return;
  const apertados = new Set<Direcao>();
  let correr = false;
  let jaAproximou = false; // o mapa abre inteiro e o boneco fica minúsculo no celular: na primeira caminhada a câmera chega mais perto
  const aplicar = (): void => player.setIntent(intencaoDe(apertados, correr));

  const rotulos = ROTULOS();
  const botoes = new Map<Direcao, HTMLButtonElement>();
  const direcional = h('div', { class: 'toque-pad', role: 'group', attrs: { 'aria-label': tr('Andar') } });
  for (const d of ['up', 'left', 'right', 'down'] as const) {
    const b = h('button', { class: `toque-btn toque-${d}`, type: 'button', text: SETAS[d], attrs: { 'aria-label': rotulos[d] } });
    const soltar = (): void => {
      apertados.delete(d);
      b.classList.remove('is-on');
      aplicar();
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId); // o dedo pode escorregar do botão sem soltar o passo
      if (!jaAproximou) {
        jaAproximou = true;
        world.zoomBy(2);
      }
      apertados.add(d);
      b.classList.add('is-on');
      aplicar();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(ev, soltar);
    b.addEventListener('contextmenu', (e) => e.preventDefault()); // segurar o botão não abre o menu do navegador
    botoes.set(d, b);
    direcional.append(b);
  }

  const agir = h('button', { class: 'toque-btn toque-agir', type: 'button', text: 'E', attrs: { 'aria-label': tr('Interagir'), 'aria-disabled': 'true' }, on: { click: () => interacao.acionar() } });
  const correrBtn = h('button', { class: 'toque-btn toque-correr', type: 'button', text: '»', attrs: { 'aria-label': tr('Correr'), 'aria-pressed': 'false' } });
  correrBtn.addEventListener('click', () => {
    correr = !correr;
    correrBtn.setAttribute('aria-pressed', String(correr));
    correrBtn.classList.toggle('is-on', correr);
    aplicar();
  });
  const acoes = h('div', { class: 'toque-acoes' }, correrBtn, agir);
  const raiz = h('div', { class: 'toque', hidden: true }, direcional, acoes);
  root.append(raiz);

  // Mostra só com o boneco no mapa e sem painel por cima; o botão de interagir acende quando há algo à frente.
  setInterval(() => {
    const painel = !!document.querySelector('.int, .jogo');
    const aparece = !!player.posicao() && !painel && !document.hidden;
    if (raiz.hidden === aparece) raiz.hidden = !aparece;
    if (!aparece && apertados.size) {
      apertados.clear();
      for (const b of botoes.values()) b.classList.remove('is-on');
      aplicar();
    }
    const livre = !!player.alvo();
    agir.setAttribute('aria-disabled', String(!livre));
    agir.classList.toggle('is-livre', livre);
  }, 150);
}
