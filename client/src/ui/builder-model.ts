// Regras do construtor de salas (puras, testáveis): o que cabe onde, quais móveis são permitidos e se todo mundo
// consegue chegar nos lugares. A sala é a do Claubbo (16x12 tiles); o interior caminhável é BUILD_BOUNDS.
import { FURNITURE, type FurnitureKind } from '../art/api';
import { BUILD_BOUNDS, BUILD_DOOR } from '../../../shared/build';
import type { BuildDir, BuildItem } from '../../../shared/build';

/** Tipos que o usuário pode pôr (os que a casca da sala já tem — placa, interruptor, batente, elevador — ficam de fora). */
export const CATALOG: ReadonlyArray<{ group: string; kinds: readonly FurnitureKind[] }> = [
  { group: 'Trabalho', kinds: ['desk', 'desk_back', 'office_chair', 'office_chair_front', 'stool', 'meeting_table', 'whiteboard', 'printer'] },
  { group: 'Descanso', kinds: ['sofa', 'armchair', 'beanbag', 'bench', 'coffee_table', 'cafe_table', 'cafe_chair', 'tv'] },
  { group: 'Jogos', kinds: ['pingpong_table', 'arcade'] },
  { group: 'Copa', kinds: ['counter', 'counter_sink', 'coffee_machine', 'microwave', 'fridge', 'vending_machine', 'water_cooler', 'sink'] },
  { group: 'Guardar', kinds: ['bookshelf', 'binder_shelf', 'filing_cabinet', 'shelf_wall', 'trash_bin'] },
  { group: 'Verde e luz', kinds: ['plant_small', 'plant_tall', 'floor_lamp'] },
  { group: 'Parede', kinds: ['window', 'clock', 'poster', 'painting', 'mirror'] },
  { group: 'Estrutura', kinds: ['glass_partition', 'reception_desk', 'toilet_stall'] },
];

export const ALLOWED = new Set<string>(CATALOG.flatMap((g) => g.kinds));
export const DIRS: readonly BuildDir[] = ['down', 'left', 'up', 'right'];
/** Móveis em que a direção (R) escolhe a variante do desenho. */
const DIR_VARIANT = new Set<string>(['armchair', 'cafe_chair', 'sofa']);

export const isWall = (kind: string): boolean => FURNITURE[kind as FurnitureKind]?.mount === 'wall';

export function footprint(kind: string): { w: number; h: number } {
  const d = FURNITURE[kind as FurnitureKind];
  return d ? { w: d.footprint.w, h: Math.max(1, d.footprint.h) } : { w: 1, h: 1 };
}

/** Tiles que o item ocupa no chão: o footprint e, nas mesas de trabalho, o tile da cadeira que vem junto. */
export function occupied(it: Pick<BuildItem, 'kind' | 'x' | 'y'>): Array<[number, number]> {
  if (isWall(it.kind)) return [];
  const { w, h } = footprint(it.kind);
  const out: Array<[number, number]> = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([it.x + dx, it.y + dy]);
  if (it.kind === 'desk') out.push([it.x, it.y + 1]);
  if (it.kind === 'desk_back') out.push([it.x, it.y - 1]);
  // pontos de uso à frente (máquinas, estante) e as pontas do ping-pong precisam de chão livre
  if (['coffee_machine', 'vending_machine', 'fridge', 'water_cooler', 'sink', 'counter_sink', 'arcade', 'bookshelf'].includes(it.kind)) out.push([it.x, it.y + 1]);
  return out;
}

/** Tiles que bloqueiam o caminho (os assentos e a cadeira da mesa não bloqueiam). */
function blockers(it: BuildItem): Array<[number, number]> {
  if (isWall(it.kind)) return [];
  const def = FURNITURE[it.kind as FurnitureKind];
  if (!def?.blocks) return [];
  const { w, h } = footprint(it.kind);
  const out: Array<[number, number]> = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([it.x + dx, it.y + dy]);
  return out;
}

const inBounds = (x: number, y: number) => x >= BUILD_BOUNDS.x0 && x <= BUILD_BOUNDS.x1 && y >= BUILD_BOUNDS.y0 && y <= BUILD_BOUNDS.y1;
/** Faixa da porta: sempre livre, para todo mundo entrar e sair. */
const inDoorStrip = (x: number, y: number) => x >= BUILD_DOOR.x && x < BUILD_DOOR.x + BUILD_DOOR.w && y >= BUILD_BOUNDS.y0 && y <= BUILD_BOUNDS.y1;

/** Por que o item não pode ficar aí (texto em PT), ou null se pode. `ignoreId` = o item que está sendo movido. */
export function placementError(items: readonly BuildItem[], cand: Pick<BuildItem, 'kind' | 'x' | 'y'>, ignoreId?: string): string | null {
  if (!ALLOWED.has(cand.kind)) return 'Esse móvel não está no catálogo.';
  if (isWall(cand.kind)) {
    const { w } = footprint(cand.kind);
    if (cand.x - w / 2 < 0.5 || cand.x + w / 2 > 15.5) return 'Fora da parede.';
    for (const o of items) {
      if (o.id === ignoreId || !isWall(o.kind)) continue;
      const ow = footprint(o.kind).w;
      if (Math.abs(o.x - cand.x) < (ow + w) / 2) return 'Já tem algo nessa parte da parede.';
    }
    return null;
  }
  const mine = occupied(cand);
  for (const [x, y] of mine) {
    if (!inBounds(x, y)) return 'Fora da sala.';
    if (inDoorStrip(x, y)) return 'Deixe a faixa da porta livre.';
  }
  const taken = new Set<string>();
  for (const o of items) if (o.id !== ignoreId) for (const [x, y] of occupied(o)) taken.add(`${x},${y}`);
  for (const [x, y] of mine) if (taken.has(`${x},${y}`)) return 'Já tem um móvel aí.';
  return null;
}

/** Lugares onde alguém senta para trabalhar (cadeiras das mesas) e se cada um é alcançável a partir da porta. */
export function reachability(items: readonly BuildItem[]): { seats: number; unreachable: number } {
  const blocked = new Set<string>();
  for (const it of items) for (const [x, y] of blockers(it)) blocked.add(`${x},${y}`);
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [];
  for (let y = BUILD_BOUNDS.y0; y <= BUILD_BOUNDS.y1; y++) {
    const k = `${BUILD_DOOR.x},${y}`;
    if (!blocked.has(k)) {
      seen.add(k);
      queue.push([BUILD_DOOR.x, y]);
    }
  }
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (!inBounds(nx, ny) || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  let seats = 0;
  let unreachable = 0;
  for (const it of items) {
    if (it.kind !== 'desk' && it.kind !== 'desk_back') continue;
    seats++;
    const cy = it.kind === 'desk' ? it.y + 1 : it.y - 1;
    if (!seen.has(`${it.x},${cy}`)) unreachable++;
  }
  return { seats, unreachable };
}

/** Próximo valor da variante (V) de um item, ou undefined se o móvel não tem variantes escolhíveis. */
export function nextVariant(it: Pick<BuildItem, 'kind' | 'variant'>): string | undefined {
  const def = FURNITURE[it.kind as FurnitureKind];
  if (!def?.variants || DIR_VARIANT.has(it.kind)) return undefined;
  const i = def.variants.indexOf(it.variant ?? def.variants[0]);
  return def.variants[(i + 1) % def.variants.length];
}

/** Próxima direção (R). Sofá só vira entre de frente e de costas. */
export function nextDir(it: Pick<BuildItem, 'kind' | 'dir'>): BuildDir {
  if (it.kind === 'sofa') return (it.dir ?? 'up') === 'up' ? 'down' : 'up';
  const i = DIRS.indexOf(it.dir ?? 'down');
  return DIRS[(i + 1) % DIRS.length];
}

/** Nome de cada tipo na interface. */
export const NAMES: Record<string, string> = {
  desk: 'Mesa (de frente)', desk_back: 'Mesa (de costas)', office_chair: 'Cadeira (costas)', office_chair_front: 'Cadeira (frente)', stool: 'Banqueta',
  meeting_table: 'Mesa de reunião', whiteboard: 'Quadro branco', printer: 'Impressora', sofa: 'Sofá', armchair: 'Poltrona', beanbag: 'Puff', bench: 'Banco',
  coffee_table: 'Mesa de centro', cafe_table: 'Mesa redonda', cafe_chair: 'Cadeira de café', tv: 'TV', pingpong_table: 'Ping-pong', arcade: 'Fliperama',
  counter: 'Bancada', counter_sink: 'Bancada com pia', coffee_machine: 'Cafeteira', microwave: 'Micro-ondas', fridge: 'Geladeira', vending_machine: 'Máquina de snacks',
  water_cooler: 'Bebedouro', sink: 'Pia', bookshelf: 'Estante', binder_shelf: 'Estante de pastas', filing_cabinet: 'Arquivo', shelf_wall: 'Prateleira', trash_bin: 'Lixeira',
  plant_small: 'Planta pequena', plant_tall: 'Planta alta', floor_lamp: 'Luminária', window: 'Janela', clock: 'Relógio', poster: 'Pôster', painting: 'Quadro', mirror: 'Espelho',
  glass_partition: 'Divisória de vidro', reception_desk: 'Balcão', toilet_stall: 'Cabine',
};

/** Salas prontas para começar (o usuário ajusta depois). Coordenadas locais; o interior é 1–14 × 2–10. */
export const TEMPLATES: Array<{ name: string; items: Array<Omit<BuildItem, 'id'>> }> = [
  {
    name: 'Equipe de 8 lugares',
    items: [
      ...[2, 4, 9, 11].flatMap((x) => [{ kind: 'desk_back', x, y: 5 }, { kind: 'desk', x, y: 6 }]),
      { kind: 'whiteboard', x: 4.5, y: 0 }, { kind: 'window', x: 12, y: 0 }, { kind: 'clock', x: 10, y: 0 },
      { kind: 'bookshelf', x: 1, y: 2 }, { kind: 'plant_tall', x: 14, y: 2, variant: 'ficus' }, { kind: 'plant_small', x: 14, y: 9, variant: 'fern' }, { kind: 'trash_bin', x: 1, y: 9 },
    ],
  },
  {
    name: 'Estúdio com sofá',
    items: [
      { kind: 'desk', x: 2, y: 4 }, { kind: 'desk', x: 4, y: 4 }, { kind: 'desk', x: 10, y: 4 },
      { kind: 'sofa', x: 10, y: 8, variant: 'up' }, { kind: 'coffee_table', x: 10, y: 6 }, { kind: 'plant_tall', x: 14, y: 2, variant: 'monstera' },
      { kind: 'bookshelf', x: 2, y: 2 }, { kind: 'window', x: 12, y: 0 }, { kind: 'painting', x: 4, y: 0 }, { kind: 'floor_lamp', x: 1, y: 9 },
    ],
  },
  { name: 'Sala vazia', items: [] },
];

