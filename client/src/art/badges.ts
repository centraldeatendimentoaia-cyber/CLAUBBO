// Distintivos do painel da holding: faixas de nível e medalhas de conquista, desenhados em pixel art (originais do
// Claubbo). A regra (faixa do nível, conquistas) é pura e testável; o desenho vai para um PixelBuf e só
// badgeCanvas toca no DOM. Cor nunca é a única pista: cada faixa tem silhueta própria e pontos que contam a faixa,
// e cada conquista tem um símbolo próprio (fica cinza e sem brilho enquanto não é ganha).
import { tr } from '../../../shared/i18n';
import { mix, ramp, shade } from './core/color';
import { PixelBuf, type Palette } from './core/pixbuf';

export const BADGE_SIZE = 16;

// ------------------------------------------------------------------ regra

export interface Tier {
  /** 1 a 5. */
  tier: 1 | 2 | 3 | 4 | 5;
  name: string;
  shape: 'diamond' | 'shield' | 'hexagon' | 'star4' | 'star8';
}

/** Primeiro nível de cada faixa (a faixa 1 começa no nível 1). Sobe devagar: o XP cresce com o quadrado do nível. */
export const TIER_FROM: readonly number[] = [1, 3, 5, 8, 12];

const TIERS: readonly Omit<Tier, 'name'>[] = [
  { tier: 1, shape: 'diamond' },
  { tier: 2, shape: 'shield' },
  { tier: 3, shape: 'hexagon' },
  { tier: 4, shape: 'star4' },
  { tier: 5, shape: 'star8' },
];

const tierName = (t: 1 | 2 | 3 | 4 | 5): string => [tr('Faísca'), tr('Chama'), tr('Cometa'), tr('Coroa'), tr('Astro')][t - 1];

/** Faixa de um nível (níveis inválidos ou menores que 1 caem na faixa 1). */
export function levelTier(nivel: number): Tier {
  let i = 0;
  for (let k = 0; k < TIER_FROM.length; k++) if (Number.isFinite(nivel) && nivel >= TIER_FROM[k]) i = k;
  const t = TIERS[i];
  return { ...t, name: tierName(t.tier) };
}

export type AchievementId = 'primeiro_brilho' | 'em_ascensao' | 'veterano' | 'lenda' | 'dia_limpo';

export interface Achievement {
  id: AchievementId;
  name: string;
  description: string;
  earned: boolean;
}

export interface AchievementInput {
  nivel: number;
  xp: number;
  /** Rotinas de hoje (de toda a holding); sem isso "Dia limpo" fica por ganhar. */
  rotinas?: { rodaram: number; falharam: number };
}

/** Conquistas derivadas só de números que o painel já recebe (XP e nível vêm de resultado verificado). */
export function achievementsOf(i: AchievementInput): Achievement[] {
  const r = i.rotinas;
  return [
    { id: 'primeiro_brilho', name: tr('Primeiro brilho'), description: tr('Ganhou o primeiro XP'), earned: i.xp > 0 },
    { id: 'em_ascensao', name: tr('Em ascensão'), description: tr('Chegou ao nível 3'), earned: i.nivel >= 3 },
    { id: 'veterano', name: tr('Veterano'), description: tr('Chegou ao nível 6'), earned: i.nivel >= 6 },
    { id: 'lenda', name: tr('Lenda'), description: tr('Chegou ao nível 10'), earned: i.nivel >= 10 },
    { id: 'dia_limpo', name: tr('Dia limpo'), description: tr('Rotinas rodaram hoje e nenhuma falhou'), earned: !!r && r.rodaram > 0 && r.falharam === 0 },
  ];
}

/** Texto curto para dica e leitor de tela: "Cometa (nível 5)". */
export const tierLabel = (nivel: number): string => tr('{0} (nível {1})', [levelTier(nivel).name, nivel]);

// ------------------------------------------------------------------ desenho

const TIER_COLORS: Readonly<Record<1 | 2 | 3 | 4 | 5, string>> = { 1: '#a99cc9', 2: '#3ad3d0', 3: '#7cff6b', 4: '#ff4fa3', 5: '#ffd23f' };

/** Máscaras 16x16: '#' dentro da silhueta. */
const SHAPES: Readonly<Record<Tier['shape'], readonly string[]>> = {
  diamond: [
    '................',
    '.......##.......',
    '......####......',
    '.....######.....',
    '....########....',
    '...##########...',
    '..############..',
    '.##############.',
    '.##############.',
    '..############..',
    '...##########...',
    '....########....',
    '.....######.....',
    '......####......',
    '.......##.......',
    '................',
  ],
  shield: [
    '................',
    '..############..',
    '..############..',
    '..############..',
    '..############..',
    '..############..',
    '..############..',
    '..############..',
    '...##########...',
    '...##########...',
    '....########....',
    '.....######.....',
    '......####......',
    '.......##.......',
    '................',
    '................',
  ],
  hexagon: [
    '................',
    '................',
    '.....######.....',
    '....########....',
    '...##########...',
    '..############..',
    '.##############.',
    '.##############.',
    '.##############.',
    '.##############.',
    '..############..',
    '...##########...',
    '....########....',
    '.....######.....',
    '................',
    '................',
  ],
  star4: [
    '.......##.......',
    '......####......',
    '......####......',
    '.....######.....',
    '.....######.....',
    '....########....',
    '################',
    '################',
    '################',
    '################',
    '....########....',
    '.....######.....',
    '.....######.....',
    '......####......',
    '......####......',
    '.......##.......',
  ],
  star8: [
    '.......##.......',
    '..#....##....#..',
    '..##..####..##..',
    '...##.####.##...',
    '....########....',
    '.....######.....',
    '.##############.',
    '################',
    '################',
    '.##############.',
    '.....######.....',
    '....########....',
    '...##.####.##...',
    '..##..####..##..',
    '..#....##....#..',
    '.......##.......',
  ],
};

/** Símbolos 7x7 das conquistas ('#' = traço, 'o' = realce). */
const GLYPHS: Readonly<Record<AchievementId, readonly string[]>> = {
  primeiro_brilho: ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'],
  em_ascensao: ['...#...', '..###..', '.#####.', '#.###.#', '..###..', '..###..', '..###..'],
  veterano: ['#.....#', '##...##', '.##.##.', '..###..', '#.###.#', '##...##', '.#...#.'],
  lenda: ['#..#..#', '#.###.#', '#######', '#######', '.#####.', '.#####.', '.......'],
  dia_limpo: ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....', '.......'],
};

const MEDAL_COLORS: Readonly<Record<AchievementId, string>> = {
  primeiro_brilho: '#ffd23f',
  em_ascensao: '#3ad3d0',
  veterano: '#ff4fa3',
  lenda: '#7cff6b',
  dia_limpo: '#6aa8ff',
};

/** Contorno de 1 px por dentro da máscara: pixel da máscara com vizinho de fora. */
function isEdge(rows: readonly string[], x: number, y: number): boolean {
  const at = (xx: number, yy: number) => rows[yy]?.[xx] === '#';
  return at(x, y) && !(at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1));
}

export type BadgeSpec = { kind: 'tier'; tier: 1 | 2 | 3 | 4 | 5 } | { kind: 'achievement'; id: AchievementId; earned: boolean };

export const badgeKey = (s: BadgeSpec): string => (s.kind === 'tier' ? `t${s.tier}` : `a-${s.id}-${s.earned ? 1 : 0}`);

/** Faixa: silhueta própria, face com luz de cima e da esquerda, e pontos (um por faixa) no centro. */
function renderTier(tier: 1 | 2 | 3 | 4 | 5): PixelBuf {
  const b = new PixelBuf(BADGE_SIZE, BADGE_SIZE);
  const shape = SHAPES[TIERS[tier - 1].shape];
  const m = ramp(TIER_COLORS[tier], 0.09);
  const edgeC = shade(m.dd, -0.1);
  shape.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      b.set(x, y, isEdge(shape, x, y) ? edgeC : (x + y) % 7 === 0 ? m.hi : y < 7 && x < 8 ? m.lt : y > 9 ? m.dk : m.base);
    }),
  );
  // Pontos: tier quadrados brancos de 1 px em fileira, sobre uma faixa escura.
  const w = tier * 2 - 1;
  const x0 = Math.floor((BADGE_SIZE - w) / 2);
  b.rect(x0 - 1, 7, w + 2, 3, m.dd);
  for (let i = 0; i < tier; i++) b.set(x0 + i * 2, 8, '#ffffff');
  return b;
}

/** Medalha: disco com aro, símbolo da conquista e, se não ganha, cinza apagado com o símbolo escurecido. */
function renderMedal(id: AchievementId, earned: boolean): PixelBuf {
  const b = new PixelBuf(BADGE_SIZE, BADGE_SIZE);
  const base = earned ? MEDAL_COLORS[id] : '#6b7280';
  const m = ramp(base, 0.09);
  b.ellipse(8, 8, 7.5, 7.5, earned ? shade(m.dd, -0.1) : '#3d4356');
  b.ellipse(8, 8, 6.5, 6.5, m.base);
  b.ellipse(7.2, 7, 5, 5, m.lt);
  if (earned) {
    b.set(4, 4, m.hi);
    b.set(5, 3, m.hi);
    b.set(3, 5, m.hi);
  }
  const glyph = GLYPHS[id];
  const pal: Palette = { '#': earned ? '#1a0f2e' : mix(base, '#1a0f2e', 0.5) };
  b.stamp(glyph, 4, 4, pal);
  return b;
}

/** Desenha o distintivo num buffer 16x16 (puro). */
export function renderBadge(s: BadgeSpec): PixelBuf {
  return s.kind === 'tier' ? renderTier(s.tier) : renderMedal(s.id, s.earned);
}

const cache = new Map<string, HTMLCanvasElement>();

/** Canvas do distintivo (16x16 reais; amplie por CSS com `image-rendering: pixelated`). Guardado em cache. */
export function badgeCanvas(s: BadgeSpec): HTMLCanvasElement {
  const key = badgeKey(s);
  const hit = cache.get(key);
  if (hit) return hit;
  const buf = renderBadge(s);
  const c = document.createElement('canvas');
  c.width = buf.w;
  c.height = buf.h;
  c.getContext('2d')?.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
  cache.set(key, c);
  return c;
}
