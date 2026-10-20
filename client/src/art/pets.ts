// Arte dos pets (gatinho, cachorro, passarinho), no estilo dos personagens: pixel art desenhada em PixelBuf, contorno
// automático, âncora nos pés. Os desenhos são do Claubbo (feitos por código, sem arquivos de imagem). Espécie nova:
// uma função em DRAW e as cores em PALETTES.
import type { Dir, Sprite } from './api';
import { PixelBuf } from './core/pixbuf';
import type { PetSpecies } from '../world/pets/config';

export type PetPose = 'stand' | 'walk' | 'sit' | 'sleep';

export interface PetFrameRequest {
  species: PetSpecies;
  /** Cor/pelagem (índice; qualquer inteiro, usado com módulo). */
  variant: number;
  dir: Dir;
  pose: PetPose;
  /** Quadro da animação. */
  frame: number;
}

export const PET_W = 22;
export const PET_H = 18;
/** Âncora: centro dos pés. */
export const PET_AX = 11;
export const PET_AY = 16;

/** Quadros de cada pose (a duração é de PET_FRAME_MS). */
export const PET_FRAMES: Readonly<Record<PetPose, number>> = { stand: 1, walk: 2, sit: 2, sleep: 2 };
export const PET_FRAME_MS: Readonly<Record<PetPose, number>> = { stand: 600, walk: 160, sit: 520, sleep: 900 };

interface Coat {
  body: string;
  dark: string;
  light: string;
  /** Detalhe (bico, nariz, língua). */
  accent: string;
}

const PALETTES: Readonly<Record<PetSpecies, readonly Coat[]>> = {
  cat: [
    { body: '#d9893b', dark: '#a8612a', light: '#f2d3a6', accent: '#e58aa0' },
    { body: '#8e95a3', dark: '#5f6675', light: '#d4d8df', accent: '#e58aa0' },
    { body: '#3f3f4e', dark: '#26262f', light: '#8a8a9c', accent: '#e58aa0' },
  ],
  dog: [
    { body: '#9a6a3f', dark: '#6b4528', light: '#e9d2b0', accent: '#2a2a33' },
    { body: '#d9b98a', dark: '#a98557', light: '#f6ead6', accent: '#2a2a33' },
    { body: '#4a4a56', dark: '#2c2c36', light: '#f1f1f1', accent: '#2a2a33' },
  ],
  bird: [
    { body: '#5aa6e0', dark: '#2f6fa8', light: '#f2f2e6', accent: '#f2a23a' },
    { body: '#f2c94c', dark: '#c79a1f', light: '#fff4c2', accent: '#e2704f' },
    { body: '#e2604f', dark: '#a83a2e', light: '#f6d6cf', accent: '#f2a23a' },
  ],
};

const EYE = '#1b1d28';
const HEART = '#ff6b8a';

type Draw = (b: PixelBuf, c: Coat, r: PetFrameRequest) => void;

/** Lado (esquerda/direita): desenha olhando para a DIREITA; o chamador espelha para a esquerda. */
const side = (b: PixelBuf, c: Coat, r: PetFrameRequest, cfg: { body: [number, number, number, number]; head: [number, number, number]; legs: number[]; leg: number; tail: 'up' | 'curl' | 'short'; ear: 'point' | 'floppy'; snout: boolean }) => {
  const [bx, by, brx, bry] = cfg.body;
  const walkOff = r.pose === 'walk' ? (r.frame % 2 ? 1 : -1) : 0;
  const bob = r.pose === 'walk' && r.frame % 2 ? 1 : 0;
  const sitting = r.pose === 'sit';
  if (sitting) {
    // sentado: traseiro no chão, tronco inclinado
    b.ellipse(bx - 1, by + 1, brx - 1, bry + 2, c.body);
    b.ellipse(bx - 1, by + 3, brx - 2, 1, c.dark);
    b.rect(bx + 2, by + 2, 2, 4, c.body); // patas da frente
    b.rect(bx + 2, by + 5, 2, 1, c.light);
  } else {
    // pernas (as de trás e as da frente trocam de lado na caminhada)
    cfg.legs.forEach((lx, i) => {
      const dx = i % 2 ? walkOff : -walkOff;
      b.rect(lx + dx, by + bry - 1 - bob, 1, cfg.leg + bob, i < 2 ? c.dark : c.body);
      b.set(lx + dx, by + bry - 1 + cfg.leg, c.light);
    });
    b.ellipse(bx, by - bob, brx, bry, c.body);
    b.ellipse(bx, by + 1 - bob, brx - 1, 1, c.light);
  }
  const [hx0, hy0, hr] = cfg.head;
  const hx = hx0;
  const hy = hy0 + (sitting ? -1 : -bob);
  b.ellipse(hx, hy, hr, hr, c.body);
  if (cfg.snout) {
    b.rect(hx + hr - 1, hy, 3, 2, c.light);
    b.set(hx + hr + 1, hy, c.accent);
  } else {
    b.set(hx + hr, hy + 1, c.accent);
  }
  b.set(hx + 1, hy - 1, EYE);
  if (cfg.ear === 'point') {
    b.set(hx - 1, hy - hr - 1, c.dark);
    b.set(hx + 1, hy - hr - 1, c.dark);
    b.set(hx, hy - hr, c.dark);
  } else {
    b.rect(hx - 2, hy - 1, 2, 3, c.dark);
  }
  // rabo
  const tx = bx - brx;
  const wag = r.pose === 'stand' || r.pose === 'sit' ? (r.frame % 2 ? -1 : 0) : 0;
  if (cfg.tail === 'up') {
    b.line(tx, by - 1, tx - 2, by - 5 + wag, c.body, 1);
    b.set(tx - 2, by - 6 + wag, c.dark);
  } else if (cfg.tail === 'curl') {
    b.line(tx, by, tx - 2, by + 1, c.body, 1);
    b.line(tx - 2, by + 1, tx - 3, by - 3 + wag, c.body, 1);
  } else {
    b.line(tx, by - 1, tx - 2, by - 3 + wag, c.dark, 1);
  }
};

const catSide: Draw = (b, c, r) => side(b, c, r, { body: [9, 11, 5, 2], head: [15, 8, 3], legs: [5, 7, 11, 13], leg: 3, tail: 'up', ear: 'point', snout: false });
const dogSide: Draw = (b, c, r) => side(b, c, r, { body: [9, 10, 6, 3], head: [16, 7, 3], legs: [5, 7, 12, 14], leg: 3, tail: 'short', ear: 'floppy', snout: true });

const birdSide: Draw = (b, c, r) => {
  const hop = r.pose === 'walk' ? (r.frame % 2 ? 2 : 0) : 0;
  const y = 10 - hop;
  b.ellipse(10, y, 4, 3, c.body);
  b.ellipse(10, y + 1, 3, 2, c.light);
  b.ellipse(8, y - 1, 3, 2, c.dark); // asa
  b.ellipse(13, y - 3, 2, 2, c.body); // cabeça
  b.set(14, y - 4, EYE);
  b.rect(15, y - 3, 2, 1, c.accent); // bico
  b.line(6, y, 3, y + 2, c.dark, 1); // cauda
  if (hop === 0) {
    b.set(9, y + 3, c.accent);
    b.set(11, y + 3, c.accent);
  }
};

/** Dormindo: bolinha encolhida, a barriga sobe e desce. */
const sleeping: Draw = (b, c, r) => {
  const breath = r.frame % 2;
  if (r.species === 'bird') {
    b.ellipse(11, 12 - breath * 0, 4, 3 + breath, c.body);
    b.ellipse(11, 14, 3, 1, c.light);
    b.ellipse(13, 10, 2, 2, c.dark);
    return;
  }
  const big = r.species === 'dog' ? 1 : 0;
  b.ellipse(11, 12, 6 + big, 3 + breath, c.body);
  b.ellipse(11, 14, 5 + big, 1, c.light);
  b.ellipse(15 + big, 12, 3, 2, c.body); // cabeça apoiada
  b.set(16 + big, 11, c.dark);
  b.line(5 - big, 13, 8, 15, c.dark, 1); // rabo enrolado
  b.set(14 + big, 9, c.dark);
  b.set(16 + big, 9, c.dark);
};

/** De frente (descendo) e de costas (subindo): bem simples, na mesma paleta. */
const faced = (b: PixelBuf, c: Coat, r: PetFrameRequest, back: boolean) => {
  const bird = r.species === 'bird';
  const dog = r.species === 'dog';
  const walk = r.pose === 'walk';
  const bob = walk && r.frame % 2 ? 1 : 0;
  const w = bird ? 3 : dog ? 5 : 4;
  const cx = 11;
  const bodyY = bird ? 11 : 11;
  // pernas
  if (!bird) {
    const o = walk ? (r.frame % 2 ? 1 : 0) : 0;
    b.rect(cx - w + 1, bodyY + 2, 2, 4 - o, c.dark);
    b.rect(cx + w - 2, bodyY + 2, 2, 3 + o, c.dark);
  } else {
    b.set(cx - 1, bodyY + 4, c.accent);
    b.set(cx + 1, bodyY + 4, c.accent);
  }
  b.ellipse(cx, bodyY - bob, w, bird ? 3 : 3, c.body);
  if (!back) b.ellipse(cx, bodyY + 1 - bob, w - 2, 2, c.light);
  const hy = bird ? 7 : 6;
  b.ellipse(cx, hy - bob, bird ? 2 : 3, bird ? 2 : 3, c.body);
  if (!bird) {
    // orelhas
    if (dog) {
      b.rect(cx - 4, hy - 2 - bob, 2, 4, c.dark);
      b.rect(cx + 3, hy - 2 - bob, 2, 4, c.dark);
    } else {
      b.set(cx - 3, hy - 4 - bob, c.dark);
      b.set(cx + 3, hy - 4 - bob, c.dark);
      b.set(cx - 2, hy - 3 - bob, c.dark);
      b.set(cx + 2, hy - 3 - bob, c.dark);
    }
  }
  if (!back) {
    b.set(cx - 1, hy - bob, EYE);
    b.set(cx + 1, hy - bob, EYE);
    b.set(cx, hy + 1 - bob, c.accent);
    if (bird) b.set(cx, hy + 1 - bob, c.accent);
  } else if (!bird) {
    // rabo à vista
    b.rect(cx, bodyY - 3 - bob, 1, 3, c.dark);
  } else {
    b.rect(cx, bodyY + 2, 1, 2, c.dark);
  }
};

const SIDE: Readonly<Record<PetSpecies, Draw>> = { cat: catSide, dog: dogSide, bird: birdSide };

/** Desenha um quadro de pet (puro, sem DOM). */
export function renderPet(req: PetFrameRequest): PixelBuf {
  const b = new PixelBuf(PET_W, PET_H);
  const coats = PALETTES[req.species];
  const c = coats[((Math.floor(req.variant) % coats.length) + coats.length) % coats.length];
  const frames = PET_FRAMES[req.pose];
  const r = { ...req, frame: ((Math.floor(req.frame) % frames) + frames) % frames };
  if (r.pose === 'sleep') {
    sleeping(b, c, r);
    if (r.dir === 'left') return flipInPlace(b, r);
  } else if (r.dir === 'left' || r.dir === 'right') {
    const s = new PixelBuf(PET_W, PET_H);
    SIDE[r.species](s, c, r);
    b.draw(s, 0, 0, r.dir === 'left');
  } else {
    faced(b, c, r, r.dir === 'up');
  }
  b.outline();
  return b;
}

function flipInPlace(b: PixelBuf, r: PetFrameRequest): PixelBuf {
  const f = b.flipped();
  f.outline();
  void r;
  return f;
}

const cache = new Map<string, Sprite>();

/** Sprite pronto (canvas) de um quadro de pet, em cache. */
export function petSprite(req: PetFrameRequest): Sprite {
  const key = `${req.species}|${req.variant % 3}|${req.dir}|${req.pose}|${req.frame % PET_FRAMES[req.pose]}`;
  let s = cache.get(key);
  if (!s) {
    const buf = renderPet(req);
    const canvas = document.createElement('canvas');
    canvas.width = buf.w;
    canvas.height = buf.h;
    canvas.getContext('2d')?.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
    s = { canvas, ax: PET_AX, ay: PET_AY };
    cache.set(key, s);
  }
  return s;
}
