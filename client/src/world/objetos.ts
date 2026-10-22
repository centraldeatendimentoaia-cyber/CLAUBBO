// Móveis do mapa que o boneco do jogador pode usar com a tecla E. Só geometria e classificação (sem DOM): os textos e as
// ações de cada categoria moram em ui/objetos-model.ts. Os ids vêm do layout (estáveis); a arte nunca é lida aqui além do
// tamanho do móvel em `FURNITURE`.
import { FURNITURE, type FurnitureKind } from '../art/api';
import { TILE } from './constants';
import type { BuildingLayout } from './layout/building';

/** O que o móvel permite fazer. Móvel que não está na tabela (divisória, interruptor, porta...) não é interagível. */
export type Categoria =
  | 'fliperama'
  | 'pingpong'
  | 'sentar'
  | 'cafe'
  | 'agua'
  | 'lousa'
  | 'relogio'
  | 'janela'
  | 'tv'
  | 'livro'
  | 'planta'
  | 'lanche'
  | 'quadro'
  | 'espelho'
  | 'lavar'
  | 'mesa'
  | 'balcao'
  | 'impressora'
  | 'arquivo'
  | 'lixeira'
  | 'luminaria'
  | 'banheiro';

export const CATEGORIA_DE: Readonly<Partial<Record<FurnitureKind, Categoria>>> = {
  arcade: 'fliperama',
  pingpong_table: 'pingpong',
  sofa: 'sentar',
  armchair: 'sentar',
  beanbag: 'sentar',
  bench: 'sentar',
  stool: 'sentar',
  office_chair: 'sentar',
  office_chair_front: 'sentar',
  cafe_chair: 'sentar',
  coffee_machine: 'cafe',
  water_cooler: 'agua',
  whiteboard: 'lousa',
  clock: 'relogio',
  window: 'janela',
  tv: 'tv',
  bookshelf: 'livro',
  binder_shelf: 'livro',
  shelf_wall: 'livro',
  plant_small: 'planta',
  plant_tall: 'planta',
  vending_machine: 'lanche',
  fridge: 'lanche',
  microwave: 'lanche',
  painting: 'quadro',
  poster: 'quadro',
  mirror: 'espelho',
  sink: 'lavar',
  counter_sink: 'lavar',
  desk: 'mesa',
  desk_back: 'mesa',
  meeting_table: 'mesa',
  reception_desk: 'mesa',
  counter: 'balcao',
  cafe_table: 'balcao',
  coffee_table: 'balcao',
  printer: 'impressora',
  filing_cabinet: 'arquivo',
  trash_bin: 'lixeira',
  floor_lamp: 'luminaria',
  toilet_stall: 'banheiro',
};

/** Um móvel interagível, em tiles: o retângulo que ele ocupa (parede: uma faixa fina na linha do rodapé). */
export interface ObjetoCand {
  id: string;
  kind: FurnitureKind;
  categoria: Categoria;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Todos os móveis interagíveis do prédio (chão e parede), com o id do layout. Cache por prédio: o layout só muda com as salas. */
const cache = new WeakMap<BuildingLayout, ObjetoCand[]>();
export function objetosDoPredio(b: BuildingLayout): ObjetoCand[] {
  const hit = cache.get(b);
  if (hit) return hit;
  const out: ObjetoCand[] = [];
  for (const area of [...b.core, b.corridor, ...b.rooms]) {
    for (const f of area.furniture) {
      const categoria = CATEGORIA_DE[f.kind];
      if (!categoria) continue;
      const { w, h } = FURNITURE[f.kind].footprint;
      out.push({ id: f.id, kind: f.kind, categoria, x: f.tx, y: f.ty, w, h });
    }
    for (const it of area.wallItems) {
      const categoria = CATEGORIA_DE[it.kind];
      if (!categoria) continue;
      const w = FURNITURE[it.kind].footprint.w;
      out.push({ id: it.id, kind: it.kind, categoria, x: it.cx / TILE - w / 2, y: it.baseY / TILE - 0.1, w, h: 0.2 });
    }
  }
  cache.set(b, out);
  return out;
}
