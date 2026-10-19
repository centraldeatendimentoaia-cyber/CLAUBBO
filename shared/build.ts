// Construção de salas (Escritório v2): o que o usuário escolhe para cada sala de trabalho.
// Código puro (sem DOM nem Node). Mudanças aqui devem ser aditivas.
//
// A sala continua com o tamanho do Claubbo (16x12 tiles, cela do prédio): o que é livre é o piso, a parede,
// as cores e os móveis. As coordenadas dos móveis são locais à sala, em tiles.

/** Interior caminhável da sala: colunas 1–14 e linhas 2–10 (as demais são paredes). */
export const BUILD_BOUNDS = { x0: 1, y0: 2, x1: 14, y1: 10 } as const;
/** Colunas da passagem da porta (fixa): precisa ficar livre do corredor até o interior. */
export const BUILD_DOOR = { x: 7, w: 2 } as const;

export type BuildDir = 'down' | 'up' | 'left' | 'right';

/** Estilo visual da sala. Campos ausentes seguem o tema sorteado pela semente da sala. */
export interface RoomStyle {
  /** Índice do tema pronto (0–9) usado como ponto de partida. */
  base?: number;
  carpet?: string;
  carpet2?: string;
  wallBase?: string;
  wallTrim?: string;
  wallPattern?: 'plain' | 'stripes' | 'tiles' | 'wood_panel' | 'brick' | 'glass' | 'marble';
  accent?: string;
  deskVariant?: string;
  chairVariant?: string;
  /** Piso da sala (o tapete segue a cor do tema). */
  floor?: 'marble' | 'wood' | 'carpet' | 'tile_check' | 'tile_white' | 'concrete';
}

/**
 * Um móvel posto na sala. `x`,`y` = canto superior esquerdo do footprint (móveis de chão) ou, para itens de parede,
 * `x` = centro em tiles e `y` ignorado. `dir` só vale para assentos e itens com direção.
 */
export interface BuildItem {
  id: string;
  kind: string;
  variant?: string;
  x: number;
  y: number;
  dir?: BuildDir;
}

/** O que o servidor manda no RoomInfo: a sala montada pelo usuário. Ausente = sala padrão do Claubbo. */
export interface RoomBuild {
  style?: RoomStyle;
  items: BuildItem[];
}
