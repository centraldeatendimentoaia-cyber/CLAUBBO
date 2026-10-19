// Posição da barra Terminais/automático/Escritórios: sempre logo acima do feed, aberto ou fechado, medindo o feed de verdade
// (a conta só em CSS dependia de variáveis que podem não bater com a altura real do feed na tela).

/** Distância (px) da barra até a borda de baixo da janela, para ela ficar `gap` px acima do topo do feed. */
export function barBottom(viewportH: number, feedTop: number, gap = 8): number {
  return Math.max(gap, Math.round(viewportH - feedTop + gap));
}
