// Prédio por fora (Escritório v2, etapa 1): a fachada gerada dos dados reais (térreo com a marca, um andar por sala e
// o andar dos terminais CLI no topo, com o poço do elevador) e a câmera de elevador entre os andares. Por dentro o
// mundo continua mostrando um andar por vez (floor.ts); a fachada só escolhe e esconde a troca.
import { roomTheme } from '../art/theme';
import type { AgentInfo, RoomInfo } from '../../../shared/types';
import { elevatorFrame, type CamPose } from './camera';

export interface FloorSpec {
  /** 1 = térreo; sobe de um em um. */
  n: number;
  label: string;
  kind: 'lobby' | 'room' | 'cli';
  /** Sala que o andar mostra (só `room`). */
  roomId?: string;
  agents: number;
}

export interface Floor extends FloorSpec {
  y: number;
  h: number;
}

interface Look {
  top: string;
  skin: string;
  hair: string;
}

/** Andares do prédio: térreo, uma sala por andar (na ordem de chegada, `slot`) e os terminais CLI no topo. */
export function buildFloors(rooms: readonly RoomInfo[], agents: readonly AgentInfo[]): FloorSpec[] {
  const rs = rooms.filter((r) => (r.floor ?? 1) !== 2).sort((a, b) => a.slot - b.slot || a.id.localeCompare(b.id));
  const count = (id: string) => agents.filter((a) => a.roomId === id && a.kind === 'main').length;
  const out: FloorSpec[] = [{ n: 1, label: 'Térreo', kind: 'lobby', agents: 0 }];
  rs.forEach((r, i) => out.push({ n: i + 2, label: r.name, kind: 'room', roomId: r.id, agents: count(r.id) }));
  out.push({ n: rs.length + 2, label: 'Terminais CLI', kind: 'cli', agents: 0 });
  return out;
}

/** Andar de destino de um andar da fachada: o `floor` do mundo (1 = Escritório, 2 = terminais) e a sala a enquadrar. */
export function floorTarget(f: FloorSpec): { world: 1 | 2; roomId?: string } {
  return f.kind === 'cli' ? { world: 2 } : { world: 1, roomId: f.roomId };
}

/** Andar da fachada que corresponde ao que o mundo mostra agora. */
export function currentFloorN(specs: readonly FloorSpec[], worldFloor: number, roomId: string | null): number {
  if (worldFloor === 2) return specs[specs.length - 1].n;
  return specs.find((f) => f.kind === 'room' && f.roomId === roomId)?.n ?? 1;
}

/** ↑ sobe, ↓ desce, sem sair do prédio. */
export const stepFloor = (specs: readonly FloorSpec[], n: number, d: 1 | -1): number => Math.max(1, Math.min(specs.length, n + d));

// ------------------------------------------------------------------ desenho

const W = 400;
const X0 = 96;
const BW = 208;
const SHAFT = 16;
const FH = 48;
const GH = 56;
const TOP = 20;
const ROOF = 24;
export const FLOOR_ZOOM = 4.2;
const PAL = { wall: '#cfc8bd', trim: '#8a8174', grass: '#6cab57', street: '#4b4f58', side: '#d9d6cf', orange: '#d97757' };

const hexCache = new Map<string, number[]>();
const hex = (c: string): number[] => {
  let v = hexCache.get(c);
  if (!v) hexCache.set(c, (v = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]));
  return v;
};
const toHex = (r: number[]) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => {
  const x = hex(a);
  const y = hex(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t));
};
const lum = (c: string) => {
  const [r, g, b] = hex(c);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Fonte 3x5 própria (A-Z, 0-9 e alguns sinais): a fachada não depende de fontes da página.
const G: Record<string, string> = {
  A: '.#./#.#/###/#.#/#.#', B: '##./#.#/##./#.#/##.', C: '.##/#../#../#../.##', D: '##./#.#/#.#/#.#/##.', E: '###/#../##./#../###', F: '###/#../##./#../#..',
  G: '.##/#../#.#/#.#/.##', H: '#.#/#.#/###/#.#/#.#', I: '###/.#./.#./.#./###', J: '..#/..#/..#/#.#/.#.', K: '#.#/#.#/##./#.#/#.#', L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#', N: '##./#.#/#.#/#.#/#.#', O: '.#./#.#/#.#/#.#/.#.', P: '##./#.#/##./#../#..', Q: '.#./#.#/#.#/##./.##', R: '##./#.#/##./#.#/#.#',
  S: '.##/#../.#./..#/##.', T: '###/.#./.#./.#./.#.', U: '#.#/#.#/#.#/#.#/###', V: '#.#/#.#/#.#/#.#/.#.', W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.', Z: '###/..#/.#./#../###', 0: '###/#.#/#.#/#.#/###', 1: '.#./##./.#./.#./###', 2: '##./..#/.#./#../###', 3: '##./..#/.##/..#/##.',
  4: '#.#/#.#/###/..#/..#', 5: '###/#../##./..#/##.', 6: '.##/#../###/#.#/###', 7: '###/..#/.#./.#./.#.', 8: '###/#.#/###/#.#/###', 9: '###/#.#/###/..#/##.',
  '-': '.../.../###/.../...', '.': '.../.../.../.../.#.', '+': '.../.#./###/.#./...', ' ': '.../.../.../.../...',
};
const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 .+-]/g, '').trim();
const textW = (s: string, k = 1) => Math.max(0, clean(s).length * 4 * k - k);

const SKIN = ['#e0a77e', '#f1c9a5', '#c98e6a', '#a56b49'];
const HAIR = ['#2b1d14', '#5a3a22', '#1b1b22', '#a8742f'];
const TOPS = ['#3f7fd8', '#e2604f', '#ec8a3c', '#4cae6a', '#8d66cf', '#36b0b0'];
/** Aparência esquemática do agente, determinística pela semente (a fachada é pequena demais para o personagem real). */
export function lookOf(seed: number): Look {
  const r = rng(seed);
  const pick = (a: string[]) => a[Math.floor(r() * a.length)];
  return { top: pick(TOPS), skin: pick(SKIN), hair: pick(HAIR) };
}

export interface Facade {
  W: number;
  H: number;
  px: Uint8ClampedArray;
  floors: Floor[];
  agentRects: { x: number; y: number; w: number; h: number; name: string; room: string }[];
  shaft: { x: number; w: number; top: number };
  /** Vão dos andares empilháveis: X do corpo do prédio e largura. */
  body: { x: number; w: number };
}

/** Posição dos andares (de baixo para cima: térreo mais alto, sala 1 e assim por diante). Puro. */
export function layoutFloors(specs: readonly FloorSpec[]): { floors: Floor[]; yStart: number; gy: number } {
  const yStart = TOP + ROOF;
  const upper = specs.length - 1;
  const gy = yStart + upper * FH + GH;
  const floors: Floor[] = [];
  let y = yStart;
  for (const s of [...specs].sort((a, b) => b.n - a.n)) {
    const h = s.kind === 'lobby' ? GH : FH;
    floors.push({ ...s, y, h });
    y += h;
  }
  return { floors: floors.sort((a, b) => a.n - b.n), yStart, gy };
}

/** Desenha a fachada num buffer RGBA, a partir dos andares, das salas e dos agentes reais. */
export function paintFacade(specs: readonly FloorSpec[], rooms: readonly RoomInfo[], agents: readonly AgentInfo[]): Facade {
  const { floors, yStart, gy } = layoutFloors(specs);
  const H = gy + 8 + 22 + 6;
  const px = new Uint8ClampedArray(W * H * 4);
  const set = (x: number, y: number, c: string) => {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b] = hex(c);
    const i = (y * W + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c);
  };
  const disc = (cx: number, cy: number, r: number, c: string) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, c);
  };
  const text = (s: string, x: number, y: number, c: string, k = 1) => {
    let cx = x;
    for (const ch of clean(s)) {
      (G[ch] || G[' ']).split('/').forEach((row, j) => [...row].forEach((v, i) => v === '#' && rect(cx + i * k, y + j * k, k, k, c)));
      cx += 4 * k;
    }
  };
  const r = rng(7);

  // céu em degradê, nuvens e silhueta de cidade ao fundo
  for (let y = 0; y < gy; y++) rect(0, y, W, 1, mix('#a9d6ec', '#e4f2f5', y / gy));
  for (let i = 0; i < 5; i++) {
    const cx = 20 + r() * 360;
    const cy = 10 + r() * 60;
    for (let k = 0; k < 4; k++) disc(cx + k * 6 - 9, cy + (k % 2) * 2, 4 + (k % 2) * 2, '#f6fbfc');
  }
  for (let x = 0; x < W; ) {
    const w = 14 + Math.floor(r() * 18);
    const h = 40 + Math.floor(r() * 100);
    if (x + w < X0 - 2 || x > X0 + BW + 2) {
      rect(x, gy - h, w, h, mix('#9fb7c9', '#b9cbd8', r()));
      for (let j = gy - h + 4; j < gy - 8; j += 6) for (let i = x + 3; i < x + w - 3; i += 5) if (r() < 0.4) set(i, j, '#d7e4ec');
    }
    x += w + 2;
  }
  // chão: grama, calçada e rua
  for (let y = gy - 6; y < gy; y++) for (let x = 0; x < W; x++) set(x, y, mix('#5d9a4a', PAL.grass, r()));
  for (let y = gy; y < gy + 8; y++) for (let x = 0; x < W; x++) set(x, y, (x + (y > gy + 3 ? 6 : 0)) % 12 === 0 || y === gy + 3 ? '#c4c0b7' : PAL.side);
  for (let y = gy + 8; y < gy + 30; y++) for (let x = 0; x < W; x++) set(x, y, r() < 0.06 ? '#565a63' : PAL.street);
  for (let x = 4; x < W; x += 24) rect(x, gy + 19, 12, 1, '#e8e3c9');
  rect(0, gy + 30, W, 6, '#d9d6cf');
  rect(300, gy + 11, 22, 6, '#c8553d');
  rect(304, gy + 8, 12, 4, '#c8553d');
  rect(306, gy + 9, 4, 2, '#bfe0ee');
  rect(311, gy + 9, 4, 2, '#bfe0ee');
  disc(305, gy + 17, 2, '#1b1d22');
  disc(317, gy + 17, 2, '#1b1d22');
  const tree = (x: number) => {
    rect(x - 1, gy - 16, 3, 16, '#6b4a2f');
    disc(x, gy - 22, 9, '#3f8a3f');
    disc(x - 5, gy - 18, 6, '#4a9a48');
    disc(x + 5, gy - 18, 6, '#357a37');
    disc(x - 2, gy - 25, 4, '#5cae55');
  };
  [22, 62, 336, 374].forEach(tree);
  ([[44, 5], [84, 4], [316, 4], [356, 5]] as const).forEach(([x, rr]) => {
    disc(x, gy - 3, rr, '#3f8a3f');
    disc(x + 2, gy - 4, rr - 2, '#5cae55');
  });

  const agentRects: Facade['agentRects'] = [];
  const storey = (y: number, h: number, wall: string, trim: string, brick: boolean) => {
    rect(X0, y, BW, h, wall);
    for (let j = 6; j < h; j += 6) rect(X0, y + j, BW, 1, mix(wall, '#000000', 0.05));
    if (brick) for (let j = 6; j < h; j += 6) for (let i = (j / 6) % 2 ? 0 : 5; i < BW; i += 10) rect(X0 + i, y + j - 5, 1, 5, mix(wall, '#000000', 0.08));
    rect(X0, y, BW, 3, trim);
    rect(X0, y + 3, BW, 1, mix(trim, '#000000', 0.25));
    rect(X0, y, 4, h, mix(wall, '#000000', 0.12));
    rect(X0 + BW - 4, y, 4, h, mix(wall, '#000000', 0.12));
  };
  const plate = (y: number, label: string, accent: string, extra: string) => {
    const area = BW - SHAFT - 8;
    const tw = textW(label);
    const pw = Math.min(area - 4, tw + 12);
    const px0 = X0 + 4 + Math.floor((area - pw) / 2);
    const dark = mix(accent, '#000000', 0.45);
    rect(px0, y + 5, pw, 9, mix(accent, '#ffffff', 0.35));
    rect(px0 + 1, y + 6, pw - 2, 7, dark);
    text(label, px0 + Math.floor((pw - tw) / 2), y + 7, lum(dark) < 150 ? '#ffffff' : '#1b1d22');
    if (extra) text(extra, px0 + pw + 3, y + 7, mix(accent, '#000000', 0.5));
  };
  const badge = (y: number, n: number) => {
    rect(X0 + 5, y + 17, 7, 9, '#2a303c');
    rect(X0 + 6, y + 18, 5, 7, '#f4ecdc');
    text(String(n), X0 + 7, y + 19, '#2a303c');
  };
  const glass = (wx: number, wy: number, ww: number, wh: number) => {
    for (let j = 0; j < wh; j++)
      for (let i = 0; i < ww; i++)
        if ((i + j) % 11 === 0 || ((i + j) % 11 === 1 && j % 2 === 0)) {
          const k = ((wy + j) * W + (wx + i)) * 4;
          for (let c = 0; c < 3; c++) px[k + c] = px[k + c] * 0.84 + 255 * 0.16;
        }
  };
  const frame = (wx: number, wy: number, ww: number, wh: number) => {
    rect(wx - 1, wy - 1, ww + 2, 1, '#3a4252');
    rect(wx - 1, wy + wh, ww + 2, 2, '#3a4252');
    rect(wx - 1, wy - 1, 1, wh + 2, '#3a4252');
    rect(wx + ww, wy - 1, 1, wh + 2, '#3a4252');
    if (ww > 30) rect(wx + Math.floor(ww / 2), wy, 1, wh, '#3a4252');
  };
  const head = (x: number, y: number, skin: string, hair: string) => {
    rect(x, y, 4, 4, skin);
    rect(x, y - 1, 4, 2, hair);
  };
  const person = (wx: number, fy: number, ww: number, ag: Look & { name: string }, room: string) => {
    const cx = wx + Math.floor(ww / 2) + 3;
    rect(cx - 4, fy - 14, 8, 8, '#3d4656');
    rect(cx - 3, fy - 11, 6, 6, ag.top);
    rect(cx - 2, fy - 12, 4, 2, ag.skin);
    head(cx - 2, fy - 17, ag.skin, ag.hair);
    agentRects.push({ x: cx - 4, y: fy - 18, w: 8, h: 14, name: ag.name, room });
  };
  const desk = (wx: number, fy: number, ww: number, mon: string) => {
    const dw = Math.min(ww - 6, 24);
    const dx = wx + Math.floor((ww - dw) / 2);
    rect(dx, fy - 6, dw, 2, '#b88a5a');
    rect(dx, fy - 4, 2, 4, mix('#b88a5a', '#000000', 0.35));
    rect(dx + dw - 2, fy - 4, 2, 4, mix('#b88a5a', '#000000', 0.35));
    rect(dx + 3, fy - 11, 7, 5, '#1b2230');
    rect(dx + 4, fy - 10, 5, 3, mon);
    rect(dx + 6, fy - 6, 1, 1, '#1b2230');
  };
  const windows = (y: number, n: number, draw: (wx: number, wy: number, ww: number, wh: number, fy: number, k: number) => void) => {
    const area = BW - SHAFT - 6 - 16;
    const gap = 6;
    const ww = Math.floor((area - (n - 1) * gap) / n);
    const wh = 27;
    const wy = y + 16;
    for (let k = 0; k < n; k++) {
      const wx = X0 + 16 + k * (ww + gap);
      draw(wx, wy, ww, wh, wy + wh - 4, k);
      glass(wx, wy, ww, wh);
      frame(wx, wy, ww, wh);
    }
  };

  const roomFloor = (f: Floor) => {
    const room = rooms.find((x) => x.id === f.roomId);
    const t = roomTheme(room?.build?.style?.base ?? room?.seed ?? 0);
    storey(f.y, FH, t.wall.base, t.wall.trim ?? mix(t.wall.base, '#000000', 0.25), t.wall.pattern === 'brick');
    plate(f.y, f.label, t.accent, f.agents > 4 ? '+' + (f.agents - 4) : '');
    badge(f.y, f.n);
    const here = agents.filter((a) => a.roomId === f.roomId && a.kind === 'main');
    windows(f.y, Math.max(2, Math.min(4, here.length || 2)), (wx, wy, ww, wh, fy, k) => {
      rect(wx, wy, ww, wh, mix('#eef1f4', t.wall.base, 0.25));
      rect(wx, wy + wh - 5, ww, 5, mix(t.carpet, '#000000', 0.12));
      rect(wx + 2, wy + 3, 5, 6, '#9fc4dd');
      rect(wx + ww - 9, wy + 4, 6, 6, mix(t.accent, '#ffffff', 0.5));
      const ag = here[k];
      desk(wx, fy, ww, ag ? '#7ee787' : '#364055');
      if (ag) person(wx, fy, ww, { ...lookOf(ag.seed), name: ag.name }, f.label);
      else rect(wx + ww - 10, fy - 8, 6, 8, '#3d4656');
      if (k === 0) {
        rect(wx + 1, fy - 9, 4, 9, '#3f7a2c');
        rect(wx, fy - 11, 6, 3, '#4cae6a');
        rect(wx + 1, fy - 1, 4, 1, '#8a5a3a');
      }
    });
  };
  const cliFloor = (f: Floor) => {
    storey(f.y, FH, '#9aa3b2', '#4a5262', false);
    plate(f.y, f.label, '#3a4252', '');
    badge(f.y, f.n);
    const rr = rng(99);
    windows(f.y, 3, (wx, wy, ww, wh) => {
      rect(wx, wy, ww, wh, '#0f131b');
      for (let j = 0; j < 4; j++) rect(wx + 4, wy + 4 + j * 5, 6 + Math.floor(rr() * (ww - 18)), 2, j % 2 ? '#7ee787' : '#d97757');
      rect(wx + 4, wy + wh - 7, 3, 3, '#7ee787');
      rect(wx, wy + wh - 3, ww, 3, '#1b2230');
    });
  };
  const lobby = (f: Floor) => {
    const y = f.y;
    storey(y, GH, PAL.wall, PAL.trim, true);
    rect(X0 + 10, y + 5, 80, 16, '#1d2433');
    rect(X0 + 11, y + 6, 78, 14, '#2a3347');
    text('CLAU', X0 + 14, y + 8, '#ffffff', 2);
    text('BBO', X0 + 14 + 4 * 4 * 2, y + 8, PAL.orange, 2);
    const dx = X0 + 100;
    const dw = 30;
    const dh = 34;
    rect(dx - 3, y + GH - dh - 3, dw + 6, 3, PAL.orange);
    for (let i = 0; i < dw + 6; i += 4) rect(dx - 3 + i, y + GH - dh - 3, 2, 3, '#f0a07f');
    rect(dx, y + GH - dh, dw, dh, '#2c3a4a');
    rect(dx + 1, y + GH - dh + 1, dw - 2, dh - 2, '#bfe0ee');
    rect(dx + Math.floor(dw / 2), y + GH - dh, 1, dh, '#2c3a4a');
    rect(dx + 4, y + GH - 11, 8, 4, '#b88a5a');
    rect(dx + 5, y + GH - 15, 3, 3, '#e8b894');
    glass(dx + 1, y + GH - dh + 1, dw - 2, dh - 2);
    for (const wx of [X0 + 10, X0 + 140]) {
      rect(wx, y + 26, 38, 22, '#eef1f4');
      rect(wx, y + 43, 38, 5, '#9aa3b2');
      rect(wx + 6, y + 36, 14, 3, '#b88a5a');
      rect(wx + 26, y + 32, 4, 11, '#4cae6a');
      glass(wx, y + 26, 38, 22);
      frame(wx, y + 26, 38, 22);
    }
    for (const vx of [X0 + 76, X0 + 124]) {
      rect(vx, y + GH - 6, 4, 6, '#8a5a3a');
      rect(vx - 1, y + GH - 10, 6, 5, '#4cae6a');
    }
    rect(X0 - 6, y + GH, BW + 12, 3, '#b9b4a8');
  };

  // telhado
  const roofY = TOP;
  rect(X0 - 2, roofY + ROOF - 4, BW + 4, 4, PAL.trim);
  rect(X0 - 2, roofY + ROOF - 4, BW + 4, 1, mix(PAL.trim, '#ffffff', 0.3));
  rect(X0 + 22, roofY + 14, 16, 6, '#8d96a5');
  rect(X0 + 22, roofY + 8, 16, 7, '#9a6a45');
  for (let j = 0; j < 7; j += 2) rect(X0 + 22, roofY + 8 + j, 16, 1, '#7b5232');
  rect(X0 + 100, roofY + 12, 28, 8, '#b5bcc8');
  rect(X0 + 102, roofY + 14, 24, 4, '#7d8697');
  rect(X0 + 170, roofY - 4, 1, 22, '#5c6472');
  set(X0 + 170, roofY - 5, '#e04a3a');

  for (const f of floors) (f.kind === 'lobby' ? lobby : f.kind === 'cli' ? cliFloor : roomFloor)(f);

  // poço do elevador, do telhado ao térreo
  const sx = X0 + BW - SHAFT;
  const total = floors.reduce((s, f) => s + f.h, 0);
  rect(sx, yStart, SHAFT, total, '#2a303c');
  rect(sx + 1, yStart, SHAFT - 2, total, '#3a4252');
  rect(sx + SHAFT / 2, yStart, 1, total, '#2a303c');
  for (const f of floors) {
    const fy = cabinRest(f);
    rect(sx + 3, fy, 10, 15, '#4a5262');
    rect(sx + 4, fy + 1, 8, 13, '#5c6472');
    rect(sx + 7, fy + 1, 1, 13, '#3a4252');
    rect(sx + 5, fy - 3, 6, 2, '#1b1d22');
    text(String(f.n), sx + 7, fy - 3, '#ffd36b');
  }
  return { W, H, px, floors, agentRects, shaft: { x: sx, w: SHAFT, top: yStart }, body: { x: X0, w: BW } };
}

/** Altura (px da fachada) em que a cabine para no andar `f`. */
export const cabinRest = (f: Floor): number => f.y + f.h - 18;

// ------------------------------------------------------------------ enquadramentos

/** A camada começa abaixo da barra do topo (que fica visível e clicável: o botão "Andar" abre e fecha a fachada). */
export const topInset = (): number => Math.max(0, Math.round(document.querySelector?.('.ui-topbar')?.getBoundingClientRect().bottom ?? 0));

export type Pose = CamPose & { cabin: number };

/** Vista da fachada inteira (n = 0) ou de um andar, num quadro de `vw` × `vh`. Puro. */
export function poseFor(facade: Pick<Facade, 'W' | 'H' | 'floors' | 'body'>, n: number, vw: number, vh: number): Pose {
  const fit = Math.min(vw / facade.W, vh / facade.H);
  const f = facade.floors.find((x) => x.n === n);
  if (!f) return { cx: facade.W / 2, cy: facade.H / 2, z: fit, cabin: cabinRest(facade.floors[0]) };
  // o andar ocupa ~80% da largura do quadro, sem passar de FLOOR_ZOOM
  const z = Math.max(fit, Math.min(FLOOR_ZOOM, (vw * 0.8) / facade.body.w));
  return { cx: facade.body.x + facade.body.w / 2, cy: f.y + f.h / 2, z, cabin: cabinRest(f) };
}

/** Duração (ms) da subida entre dois andares: mais longa quanto mais andares ela cruza. */
export const rideMs = (from: number, to: number): number => 900 + 350 * Math.min(4, Math.max(1, Math.abs(to - from)));

// ------------------------------------------------------------------ vista na tela

type Listener = () => void;
const listeners = new Set<Listener>();
/** O botão "Andar" da topbar abre e fecha a fachada sem conhecer o mundo. */
export const toggleBuilding = (): void => listeners.forEach((l) => l());
export const onToggleBuilding = (cb: Listener): (() => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export interface BuildingHost {
  /** Instantâneo do que a fachada precisa. */
  data(): { rooms: readonly RoomInfo[]; agents: readonly AgentInfo[] } | null;
  /** O que o mundo mostra agora: andar (1/2) e sala enquadrada, se houver. */
  where(): { worldFloor: number; roomId: string | null };
  /** Troca de andar de verdade, já com a fachada cobrindo a tela. */
  arrive(target: { world: 1 | 2; roomId?: string }): void;
}

export interface BuildingView {
  toggle(): void;
  readonly open: boolean;
  destroy(): void;
}

/**
 * Camada sobre o canvas do mundo: mostra a fachada, anima a câmera pelo prédio até o andar escolhido e, na chegada,
 * pede ao mundo a troca de andar e se desfaz. Atalhos enquanto aberta: ↑ ↓ trocam de andar, Enter/clique entram, Esc fecha.
 */
export function createBuildingView(world: HTMLCanvasElement, host: BuildingHost): BuildingView {
  // A camada só nasce na primeira vez que a fachada abre (o mundo também roda sem ela, em testes e na visita).
  let cv!: HTMLCanvasElement;
  let ctx!: CanvasRenderingContext2D;
  let tip!: HTMLDivElement;
  let ready = false;
  let facade: Facade | null = null;
  let off: HTMLCanvasElement | null = null;
  let specs: FloorSpec[] = [];
  let isOpen = false;
  let sel = 1;
  let pose: Pose = { cx: 0, cy: 0, z: 1, cabin: 0 };
  let ride: { from: Pose; to: Pose; t0: number; dur: number; dip: number; then: 'stay' | 'arrive' | 'close' } | null = null;
  /** Câmera na fachada inteira (true) ou dentro de um andar (false). */
  let wide = true;
  let raf = 0;
  /** Mantém a camada abaixo da barra do topo, que fica à vista e clicável. */
  const place = () => {
    const t = topInset();
    cv.style.top = `${t}px`;
    cv.style.height = `calc(100% - ${t}px)`;
  };
  const size = () => ({ vw: cv.clientWidth || world.clientWidth, vh: cv.clientHeight || world.clientHeight });

  const build = (): boolean => {
    const d = host.data();
    if (!d) return false;
    specs = buildFloors(d.rooms, d.agents);
    facade = paintFacade(specs, d.rooms, d.agents);
    off = document.createElement('canvas');
    off.width = facade.W;
    off.height = facade.H;
    off.getContext('2d')!.putImageData(new ImageData(facade.px as Uint8ClampedArray<ArrayBuffer>, facade.W, facade.H), 0, 0);
    return true;
  };

  const draw = () => {
    if (!facade || !off) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const { vw, vh } = size();
    if (cv.width !== Math.floor(vw * dpr) || cv.height !== Math.floor(vh * dpr)) {
      cv.width = Math.floor(vw * dpr);
      cv.height = Math.floor(vh * dpr);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#bfe0ee';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const z = pose.z * dpr;
    ctx.setTransform(z, 0, 0, z, Math.round(cv.width / 2 - pose.cx * z), Math.round(cv.height / 2 - pose.cy * z));
    ctx.drawImage(off, 0, 0);
    // a cabine e os cabos ficam por cima da imagem: sobem de verdade na animação
    const x = facade.shaft.x + 3;
    const y = Math.round(pose.cabin);
    ctx.fillStyle = '#8d96a5';
    ctx.fillRect(x + 5, facade.shaft.top, 1, y - facade.shaft.top);
    ctx.fillStyle = '#8c3f23';
    ctx.fillRect(x, y, 10, 15);
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(x + 1, y + 1, 8, 13);
    ctx.fillStyle = '#ffe3d1';
    ctx.fillRect(x + 2, y + 2, 6, 6);
    // realce do andar escolhido (só com a fachada à vista)
    const f = facade.floors.find((q) => q.n === sel);
    if (f && !ride) {
      ctx.strokeStyle = PAL.orange;
      ctx.lineWidth = 1.5 / pose.z;
      ctx.strokeRect(facade.body.x + 0.5, f.y + 0.5, facade.body.w - 1, f.h - 1);
    }
  };

  const frame = (now: number) => {
    if (!isOpen) return;
    place();
    if (ride) {
      const t = Math.min(1, (now - ride.t0) / ride.dur);
      pose = t >= 1 ? ride.to : elevatorFrame(ride.from, ride.to, t, ride.dip);
      if (t >= 1) {
        const done = ride.then;
        ride = null;
        if (done === 'arrive') arrive();
        else if (done === 'close') fade();
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  };

  /** Leva a câmera à fachada inteira (n = 0) ou a um andar. De andar para andar a câmera se afasta no meio do caminho. */
  const go = (n: number, then: 'stay' | 'arrive' | 'close' = 'stay') => {
    if (!facade) return;
    const { vw, vh } = size();
    const dist = n && !wide ? Math.abs(n - sel) : 0;
    ride = { from: { ...pose }, to: poseFor(facade, n, vw, vh), t0: performance.now(), dur: rideMs(sel, n || sel), dip: dist ? Math.min(1, dist / 2) * (FLOOR_ZOOM - 2.2) : 0, then };
    wide = n === 0;
    if (n) sel = n;
  };

  /** Chegou ao andar: o mundo troca de andar por baixo e a fachada se desfaz. */
  const arrive = () => {
    const f = facade?.floors.find((q) => q.n === sel);
    if (f) host.arrive(floorTarget(f));
    fade();
  };

  const fade = () => {
    cv.style.opacity = '0';
    setTimeout(hide, 340);
  };

  const hide = () => {
    isOpen = false;
    ride = null;
    cancelAnimationFrame(raf);
    cv.style.display = 'none';
    tip.style.display = 'none';
    removeEventListener('keydown', onKey, true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!isOpen) return;
    const k = e.key;
    if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'Escape' && k !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    if (ride) return;
    if (k === 'ArrowUp') go(stepFloor(specs, sel, 1));
    else if (k === 'ArrowDown') go(stepFloor(specs, sel, -1));
    else if (k === 'Enter') go(sel, 'arrive');
    else if (wide) close();
    else go(0);
  };

  const ensure = () => {
    if (ready) return;
    ready = true;
    cv = document.createElement('canvas');
    cv.className = 'ev2-building';
    cv.setAttribute('role', 'dialog');
    cv.setAttribute('aria-label', 'Prédio: escolha o andar');
    cv.tabIndex = -1;
    Object.assign(cv.style, { position: 'absolute', left: '0', width: '100%', zIndex: '5', display: 'none', cursor: 'pointer', imageRendering: 'pixelated', background: '#bfe0ee', opacity: '1', transition: 'opacity 320ms ease' });
    world.parentElement?.append(cv);
    ctx = cv.getContext('2d')!;
    tip = document.createElement('div');
    Object.assign(tip.style, { position: 'absolute', zIndex: '6', pointerEvents: 'none', background: '#000c', color: '#fff', padding: '3px 8px', borderRadius: '4px', font: '12px system-ui, sans-serif', display: 'none', whiteSpace: 'nowrap' });
    world.parentElement?.append(tip);

    cv.addEventListener('click', (ev) => {
      if (!isOpen || ride || !facade) return;
      const p = toLogical(ev);
      const f = facade.floors.find((q) => p.y >= q.y && p.y < q.y + q.h && p.x >= facade!.body.x && p.x < facade!.body.x + facade!.body.w);
      if (!f) return close();
      go(f.n, 'arrive');
    });
    cv.addEventListener('mousemove', (ev) => {
      if (!isOpen || !facade) return;
      const p = toLogical(ev);
      const a = facade.agentRects.find((q) => p.x >= q.x && p.x < q.x + q.w && p.y >= q.y && p.y < q.y + q.h);
      if (!a) {
        tip.style.display = 'none';
        return;
      }
      tip.textContent = `${a.name} · ${a.room}`;
      tip.style.display = 'block';
      tip.style.left = `${cv.offsetLeft + p.px + 12}px`;
      tip.style.top = `${cv.offsetTop + p.py + 12}px`;
    });

  };

  const open = () => {
    if (isOpen || !build() || !facade) return;
    ensure();
    const w = host.where();
    sel = currentFloorN(specs, w.worldFloor, w.roomId);
    isOpen = true;
    cv.style.transition = 'none';
    cv.style.opacity = '1';
    place();
    cv.style.display = 'block';
    void cv.offsetWidth;
    cv.style.transition = 'opacity 320ms ease';
    const { vw, vh } = size();
    pose = poseFor(facade, sel, vw, vh); // começa dentro do andar de agora e se afasta até a fachada
    wide = false;
    go(0);
    addEventListener('keydown', onKey, true);
    cv.focus({ preventScroll: true });
    raf = requestAnimationFrame(frame);
  };

  /** Fecha: a câmera entra no andar em que o mundo está e a fachada some (nada é trocado). */
  const close = () => {
    if (!isOpen || !facade) return;
    const w = host.where();
    sel = currentFloorN(specs, w.worldFloor, w.roomId);
    wide = true;
    go(sel, 'close');
  };

  const toLogical = (ev: MouseEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left - r.width / 2) / pose.z + pose.cx, y: (ev.clientY - r.top - r.height / 2) / pose.z + pose.cy, px: ev.clientX - r.left, py: ev.clientY - r.top };
  };
  return {
    toggle: () => (isOpen ? close() : open()),
    get open() {
      return isOpen;
    },
    destroy: () => {
      if (!ready) return;
      hide();
      cv.remove();
      tip.remove();
    },
  };
}
