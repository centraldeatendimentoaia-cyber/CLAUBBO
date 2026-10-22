// Modelo puro dos controles na tela de toque: quais botões do direcional estão apertados viram a intenção de andar do
// boneco (a mesma que o teclado manda: -1, 0 ou 1 em cada eixo).
import type { VisitorIntent } from '../world/sim/visitor';

export type Direcao = 'up' | 'down' | 'left' | 'right';

/** Botões opostos apertados juntos se anulam (como o teclado). */
export function intencaoDe(apertados: ReadonlySet<Direcao>, correr: boolean): VisitorIntent {
  const dx = (apertados.has('right') ? 1 : 0) - (apertados.has('left') ? 1 : 0);
  const dy = (apertados.has('down') ? 1 : 0) - (apertados.has('up') ? 1 : 0);
  return { dx, dy, run: correr && (dx !== 0 || dy !== 0) };
}

/** A tela é de toque (dedo, sem mouse como entrada principal)? Só nela os controles aparecem. */
export function telaDeToque(matchMedia: ((q: string) => { matches: boolean }) | undefined): boolean {
  try {
    return !!matchMedia?.('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
