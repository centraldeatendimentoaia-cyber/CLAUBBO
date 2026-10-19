// Sala de trabalho montada pelo usuário (Escritório v2). Mesma casca da sala padrão (layoutProjectRoom): piso, paredes,
// porta, placa, interruptor e sombreamento. Os móveis vêm de RoomBuild.items; os pontos de interesse (spots) são
// derivados do tipo de cada móvel, para os personagens sentarem, trabalharem e passearem na sala que você montou.
import { FURNITURE, type Dir, type FloorKind, type FurnitureKind, type RoomTheme, type WallStyle } from '../../art/api';
import { BUILD_BOUNDS } from '../../../../shared/build';
import type { BuildDir, BuildItem, RoomBuild, RoomStyle } from '../../../../shared/build';
import { DOOR_W, DOOR_X, TILE } from '../constants';
import { AreaBuilder, SEATED_SORT_BIAS } from './builder';
import { slotRect, slotSide } from './geometry';
import type { AreaLayout } from './types';
import type { RoomInput } from './room';

const DIR: Record<BuildDir, Dir> = { down: 'down', up: 'up', left: 'left', right: 'right' };

/** Tema final: o tema sorteado (ou o escolhido em `style.base`) com as cores que o usuário trocou por cima. */
export function themeWithStyle(base: RoomTheme, style: RoomStyle | undefined): RoomTheme {
  if (!style) return base;
  const wall: WallStyle = { ...base.wall };
  if (style.wallBase) wall.base = style.wallBase;
  if (style.wallTrim) wall.trim = style.wallTrim;
  if (style.wallPattern) wall.pattern = style.wallPattern;
  return {
    ...base,
    wall,
    carpet: style.carpet ?? base.carpet,
    carpet2: style.carpet2 ?? base.carpet2,
    accent: style.accent ?? base.accent,
    deskVariant: style.deskVariant ?? base.deskVariant,
    chairVariant: style.chairVariant ?? base.chairVariant,
  };
}

const isKind = (k: string): k is FurnitureKind => Object.prototype.hasOwnProperty.call(FURNITURE, k);

export function layoutCustomRoom(room: RoomInput, theme: RoomTheme, build: RoomBuild): AreaLayout {
  const rect = slotRect(room.slot);
  const side = slotSide(room.slot);
  const north = side === 'north';
  const b = new AreaBuilder(room.id, 'room', rect);
  const area = b.area;
  area.side = side;
  const t = themeWithStyle(theme, build.style);
  const wall = t.wall;
  const door = { lx: DOOR_X, w: DOOR_W };
  const floor: FloorKind = build.style?.floor ?? 'marble';

  b.floor(floor, 0, 0, 16, 12, room.seed);
  area.floorTint = t.carpet;
  b.rug(1.5, 3.25, 7, 5.5, t.carpet, room.seed);
  b.rug(DOOR_X - 0.25, north ? 9.5 : 2, DOOR_W + 0.5, 1.25, t.carpet2, room.seed + 1);

  if (north) {
    b.face(0.5, 15, wall);
    b.south(0.5, 15, 11, wall, [door]);
  } else {
    b.face(0.5, 15, wall, [door]);
    b.south(0.5, 15, 11, { ...wall, exterior: true });
    b.wall('door_frame', DOOR_X + DOOR_W / 2, undefined, { order: 0.05 });
  }
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(15.5, 0, 0.5, 12, wall);

  b.walk(1, 2, 14, 9);
  area.door = north ? { x: rect.x + DOOR_X, y: rect.y + 11, w: DOOR_W, h: 1 } : { x: rect.x + DOOR_X, y: rect.y, w: DOOR_W, h: 2 };
  b.walk(area.door.x - rect.x, area.door.y - rect.y, area.door.w, area.door.h);

  // Placa com o nome e interruptor ficam sempre (o mundo usa a placa para o nome da sala e o interruptor para a luz).
  area.signId = b.wall('sign', north ? 8 : 10.5, undefined, { order: 0.95 });
  if (north) {
    b.wall('light_switch', DOOR_X - 0.5, 'on', { ly: 12, on: 'south', order: 0.8 });
    b.spot('switch', DOOR_X - 1, 10, 'down', { dy: -1 });
  } else {
    b.wall('light_switch', DOOR_X - 0.5, 'on', { order: 0.8 });
    b.spot('switch', DOOR_X - 1, 2, 'up', { dy: -3 });
  }

  const items = [...build.items].filter((i) => isKind(i.kind)).sort((a, c) => a.y - c.y || a.x - c.x);
  // ordem de montagem: do fundo para a frente
  const order = (i: BuildItem, base = 0.2) => base + 0.6 * Math.min(1, Math.max(0, (i.y - BUILD_BOUNDS.y0) / (BUILD_BOUNDS.y1 - BUILD_BOUNDS.y0)));
  let deskRank = 0;
  for (const it of items) {
    const kind = it.kind as FurnitureKind;
    const def = FURNITURE[kind];
    const dir = DIR[it.dir ?? 'down'];
    const o = order(it);
    if (def.mount === 'wall') {
      placeWall(b, it, kind, o);
      continue;
    }
    switch (kind) {
      case 'desk': {
        // mesa de frente para a câmera; o lugar fica na linha de baixo, de costas
        const desk = b.furn('desk', it.x, it.y, it.variant ?? t.deskVariant, { order: o, seat: `S${deskRank}` });
        b.seat('desk', 'office_chair', it.x, it.y + 1, 'up', t.chairVariant, { dx: TILE / 2, deskId: desk, rank: deskRank++, side: 'S', order: o + 0.1 });
        break;
      }
      case 'desk_back': {
        const desk = b.furn('desk_back', it.x, it.y, it.variant ?? t.deskVariant, { order: o, seat: `N${deskRank}` });
        b.seat('desk', 'office_chair_front', it.x, it.y - 1, 'down', t.chairVariant, { dx: TILE / 2, deskId: desk, rank: deskRank++, side: 'N', order: o + 0.1 });
        break;
      }
      case 'stool':
        b.seat('stool', 'stool', it.x, it.y, dir, undefined, { order: o + 0.1 });
        break;
      case 'office_chair':
        b.seat('nook', 'office_chair', it.x, it.y, 'up', it.variant ?? t.chairVariant, { order: o + 0.1 });
        break;
      case 'office_chair_front':
        b.seat('nook', 'office_chair_front', it.x, it.y, 'down', it.variant ?? t.chairVariant, { order: o + 0.1 });
        break;
      case 'armchair':
        b.seat('nook', 'armchair', it.x, it.y, dir, dir, { order: o + 0.1 });
        break;
      case 'beanbag':
        b.seat('nook', 'beanbag', it.x, it.y, 'up', it.variant, { order: o + 0.1 });
        break;
      case 'cafe_chair':
        b.seat('nook', 'cafe_chair', it.x, it.y, dir, dir, { order: o + 0.1 });
        break;
      case 'sofa': {
        const v = it.variant === 'down' ? 'down' : 'up';
        const sofa = b.furn('sofa', it.x, it.y, v, { order: o });
        for (let i = 0; i < 3; i++) b.seat('sofa', 'sofa', it.x + i, it.y, v === 'down' ? 'down' : 'up', v, { noFurniture: true, furnitureId: sofa });
        break;
      }
      case 'bench': {
        const bench = b.furn('bench', it.x, it.y, undefined, { order: o });
        for (let i = 0; i < 2; i++) b.seat('bench', 'bench', it.x + i, it.y, 'down', undefined, { noFurniture: true, furnitureId: bench });
        break;
      }
      case 'pingpong_table': {
        b.furn('pingpong_table', it.x, it.y, undefined, { order: o });
        const ppY = b.py(it.y + 1) + 5;
        const sort = b.py(it.y + 2) + SEATED_SORT_BIAS;
        const group = `pingpong:${it.id}`;
        b.spot('pingpong', it.x - 1, it.y + 1, 'right', { x: b.px(it.x) - 8, y: ppY, group, sortY: sort });
        b.spot('pingpong', it.x + 3, it.y + 1, 'left', { x: b.px(it.x + 3) + 8, y: ppY, group, sortY: sort });
        break;
      }
      case 'coffee_machine': {
        const m = b.furn('coffee_machine', it.x, it.y, undefined, { order: o });
        b.spot('coffee', it.x, it.y + 1, 'up', { dy: -3, furnitureId: m });
        break;
      }
      case 'vending_machine': {
        const m = b.furn('vending_machine', it.x, it.y, undefined, { order: o });
        b.spot('snack', it.x, it.y + 1, 'up', { dy: -3, furnitureId: m });
        break;
      }
      case 'fridge':
        b.furn('fridge', it.x, it.y, undefined, { order: o });
        b.spot('fridge', it.x, it.y + 1, 'up', { dy: -3 });
        break;
      case 'water_cooler':
        b.furn('water_cooler', it.x, it.y, undefined, { order: o });
        b.spot('water', it.x, it.y + 1, 'up', { dy: -3 });
        break;
      case 'counter_sink':
      case 'sink':
        b.furn(kind, it.x, it.y, undefined, { order: o });
        b.spot('sink', it.x, it.y + 1, 'up', { dy: -3 });
        break;
      case 'arcade':
        b.furn('arcade', it.x, it.y, undefined, { order: o });
        b.spot('arcade', it.x, it.y + 1, 'up', { dy: -3 });
        break;
      case 'bookshelf':
        b.furn('bookshelf', it.x, it.y, undefined, { order: o });
        b.spot('shelf', it.x, it.y + 1, 'up', { dx: 8, dy: -2 });
        break;
      case 'toilet_stall': {
        const stall = b.furn('toilet_stall', it.x, it.y, undefined, { order: o });
        b.spot('stall', it.x, it.y + 2, 'up', { furnitureId: stall, x: b.px(it.x + 1), y: b.py(it.y + 2) - 3, sortY: b.py(it.y + 2) - 0.5 });
        break;
      }
      default:
        b.furn(kind, it.x, it.y, it.variant, { order: o });
    }
  }

  // pontos em pé (subagentes sem lugar sentado, conversas): garantidos mesmo numa sala vazia
  for (const [lx, ly, d] of [[3, 9, 'right'], [12, 9, 'left'], [8, 6, 'down']] as const) b.spot('stand', lx, ly, d);

  const p = { x: rect.x * TILE, y: rect.y * TILE, w: rect.w * TILE, h: rect.h * TILE };
  area.shade = north ? { x: p.x, y: p.y, w: p.w, h: p.h - TILE } : { x: p.x, y: p.y, w: p.w, h: p.h };
  return b.build();
}

/** Itens de parede: x = centro em tiles; atividade (quadro branco, janela) ganha o seu ponto de interesse. */
function placeWall(b: AreaBuilder, it: BuildItem, kind: FurnitureKind, o: number): void {
  b.wall(kind, it.x, it.variant, { order: o });
  if (kind === 'whiteboard') b.spot('whiteboard', Math.floor(it.x - 0.5), 2, 'up', { dx: 8, dy: 2 });
  else if (kind === 'window') b.spot('window', Math.floor(it.x - 0.5), 2, 'up', { dx: 12, dy: 1 });
}
