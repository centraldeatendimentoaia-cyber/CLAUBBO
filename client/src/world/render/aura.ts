// Aura por modelo dos agentes: brilho sutil (haiku/sonnet), brilho forte sem fogo (opus) e chama dourada (fable).
// Módulo puro: nada de estado por frame, tudo sai de `now` e de uma semente estável do agente.
// A chama traduz para canvas 2D a referência visual aprovada (silhuetas em camadas, gradiente do chão à ponta,
// brasas subindo, raios piscando, ondas no chão e tremor no corpo). Efeito original do projeto.

export type AuraNivel = 'singela' | 'intermediaria' | 'chama';

export interface AuraSpec {
  nivel: AuraNivel;
  cor: string;
  camadas: number;
  brasas: number;
  raios: number;
  ondas: number;
  treme: boolean;
  rotulo: string;
}

/** Cópia da escada de server/core/modelos.mjs (ESCADAS); o teste prova que continua igual. */
export const ESCADAS_AURA = {
  claude: ['haiku', 'sonnet', 'opus', 'fable'],
  codex: ['gpt-5.1-codex-mini', 'gpt-5.2-codex', 'gpt-5.3-codex'],
} as const;

const SINGELA_HAIKU: Omit<AuraSpec, 'rotulo'> = { nivel: 'singela', cor: '#3ad3d0', camadas: 1, brasas: 0, raios: 0, ondas: 0, treme: false };
const SINGELA_SONNET: Omit<AuraSpec, 'rotulo'> = { ...SINGELA_HAIKU, cor: '#7cff6b' };
const INTERMEDIARIA: Omit<AuraSpec, 'rotulo'> = { nivel: 'intermediaria', cor: '#ff4fa3', camadas: 2, brasas: 0, raios: 0, ondas: 0, treme: false };
const CHAMA: Omit<AuraSpec, 'rotulo'> = { nivel: 'chama', cor: '#ffd23f', camadas: 4, brasas: 18, raios: 5, ondas: 2, treme: true };

/** Aura do modelo, ou null quando não há modelo ou ele está fora da escada do provedor. */
export function auraDe(model: string | undefined, provider?: string): AuraSpec | null {
  if (!model) return null;
  if (provider === 'codex') {
    const i = (ESCADAS_AURA.codex as readonly string[]).indexOf(model);
    if (i < 0) return null;
    // só o fable tem chama: o topo do Codex é intermediária e os degraus abaixo são singela
    const topo = ESCADAS_AURA.codex.length - 1;
    return { ...(i === topo ? INTERMEDIARIA : SINGELA_HAIKU), rotulo: model };
  }
  switch (model) {
    case 'haiku':
      return { ...SINGELA_HAIKU, rotulo: model };
    case 'sonnet':
      return { ...SINGELA_SONNET, rotulo: model };
    case 'opus':
      return { ...INTERMEDIARIA, rotulo: model };
    case 'fable':
      return { ...CHAMA, rotulo: model };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- formas da chama (unidades da referência: base em (100,230))

/** Silhueta grande (A) e silhueta fina (B) da chama, como listas de pontos. */
const FORMA_A: readonly (readonly [number, number])[] = [
  [100, 8], [112, 52], [126, 30], [128, 84], [152, 58], [142, 118], [168, 104], [150, 170], [170, 190], [100, 238],
  [30, 190], [50, 170], [32, 104], [58, 118], [48, 58], [72, 84], [74, 30], [88, 52],
];
const FORMA_B: readonly (readonly [number, number])[] = [
  [100, 40], [110, 84], [130, 66], [126, 130], [156, 120], [140, 186], [100, 232], [60, 186], [44, 120], [74, 130], [70, 66], [90, 84],
];
const BASE_X = 100;
const BASE_Y = 230;
/** Gradiente da chama suprema: base, meio e ponta. */
const GRADIENTE_CHAMA = ['#d97a00', '#ffd23f', '#ffffff'] as const;
/** Altura da chama (escala k da referência) por nível. */
const ESCALA_CHAMA = 1.22;

/** Número pseudoaleatório estável em [0,1) a partir da semente do agente e de um índice. */
function ruido(semente: number, i: number): number {
  let h = Math.imul((semente | 0) ^ Math.imul(i + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Interpola linearmente uma curva periódica definida por pontos [fase 0..1, valor...]. */
function ciclo(u: number, pontos: readonly (readonly number[])[]): number[] {
  for (let i = 1; i < pontos.length; i++) {
    const [u0, ...a] = pontos[i - 1];
    const [u1, ...b] = pontos[i];
    if (u <= u1) return a.map((v, k) => v + (b[k] - v) * ((u - u0) / (u1 - u0)));
  }
  return pontos[pontos.length - 1].slice(1);
}

/** Respiração das chamas: [fase, escala x, escala y, inclinação em radianos]. */
const BALANCO_A = [[0, 1, 1, 0], [0.2, 1.06, 1.12, 0.052], [0.45, 0.96, 0.93, -0.052], [0.7, 1.05, 1.08, 0.035], [1, 1, 1, 0]];
const BALANCO_B = [[0, 1, 1, 0], [0.3, 0.95, 1.14, -0.052], [0.6, 1.07, 0.94, 0.052], [1, 1, 1, 0]];

function fase(now: number, periodoS: number, deslocS: number): number {
  const u = (now / 1000 + deslocS) / periodoS;
  return u - Math.floor(u);
}

function tracarForma(ctx: CanvasRenderingContext2D, f: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  ctx.moveTo(f[0][0], f[0][1]);
  for (let i = 1; i < f.length; i++) ctx.lineTo(f[i][0], f[i][1]);
  ctx.closePath();
}

/** Tremor do corpo (px de mundo) do agente com aura que treme; zero com movimento reduzido. */
export function tremorDe(spec: AuraSpec, now: number, semente: number, reduzirMovimento: boolean): { dx: number; dy: number } {
  if (!spec.treme || reduzirMovimento) return { dx: 0, dy: 0 };
  const p = (Math.floor(now / 60) + (semente & 3)) & 3;
  return { dx: [0, 1, 0, -1][p], dy: [0, -1, 0, 1][p] };
}

/** Elipse suave no chão (ou halo no corpo): gradiente radial achatado, cor cheia no centro. */
function brilho(ctx: CanvasRenderingContext2D, base: number, cx: number, cy: number, rx: number, ry: number, cor: string, alfa: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, cor);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = base * alfa;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Desenha a aura aos pés do agente (x, feetY em px de mundo), antes do sprite.
 * `escala` = px de mundo por unidade da referência; `semente` = semente estável do agente.
 * Com `reduzirMovimento` a forma fica parada: sem brasas, sem raios, sem ondas animadas e sem balanço.
 */
export function desenharAura(
  ctx: CanvasRenderingContext2D,
  spec: AuraSpec,
  x: number,
  feetY: number,
  now: number,
  opts: { reduzirMovimento: boolean; escala: number; semente?: number },
): void {
  const { reduzirMovimento: parado, escala: e } = opts;
  const sem = opts.semente ?? 0;
  const base = ctx.globalAlpha ?? 1; // respeita o fade do personagem
  const desloc = ruido(sem, 999) * 3;
  ctx.save();
  ctx.translate(x, feetY);
  ctx.scale(e, e);

  if (spec.nivel !== 'chama') {
    // brilho que respira (parado: no valor médio). A intermediária é bem mais forte e ganha halo no corpo.
    const resp = parado ? 0.8 : 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(fase(now, 2.4, desloc) * Math.PI * 2));
    const forte = spec.nivel === 'intermediaria';
    brilho(ctx, base, 0, 0, forte ? 78 : 40, forte ? 14 : 7, spec.cor, (forte ? 0.7 : 0.16) * resp);
    if (forte) brilho(ctx, base, 0, -70, 62, 62, spec.cor, 0.26 * resp);
    ctx.restore();
    return;
  }

  const [grBase, grMeio, grPonta] = GRADIENTE_CHAMA;
  const k = ESCALA_CHAMA;
  // ondas no chão: elipses crescentes (paradas: um anel fixo e discreto)
  for (let r = 0; r < spec.ondas; r++) {
    const u = parado ? 0.45 : fase(now, 1.5, desloc + r * 0.75);
    ctx.globalAlpha = base * (parado ? 0.4 : 0.95 * (1 - u));
    ctx.strokeStyle = r ? '#ffffff' : grMeio;
    ctx.lineWidth = 2 / e;
    ctx.beginPath();
    ctx.ellipse(0, 2, 70 * (0.3 + 1.4 * u), 13 * (0.3 + 1.4 * u), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = base;
  // brilho no chão
  brilho(ctx, base, 0, 0, 54 * k, 9 * k, grMeio, parado ? 0.5 : 0.35 + 0.35 * (0.5 - 0.5 * Math.cos(fase(now, 1.2, desloc) * Math.PI * 2)));

  // camadas: halo, duas línguas laterais, chama principal e miolo claro (do fundo para a frente)
  const camadas: { f: typeof FORMA_A; bal: typeof BALANCO_A; per: number; sx: number; sy: number; dx: number; cor: string | 'grad'; alfa: number }[] = [
    { f: FORMA_A, bal: BALANCO_B, per: 0.8, sx: k * 1.08, sy: k * 1.08, dx: 0, cor: grMeio, alfa: 0.35 },
    { f: FORMA_B, bal: BALANCO_B, per: 0.62, sx: k * 0.78, sy: k * 0.9, dx: -34, cor: 'grad', alfa: 0.7 },
    { f: FORMA_B, bal: BALANCO_B, per: 0.55, sx: k * 0.78, sy: k * 0.9, dx: 34, cor: 'grad', alfa: 0.7 },
    { f: FORMA_A, bal: BALANCO_A, per: 0.7, sx: k, sy: k, dx: 0, cor: 'grad', alfa: 0.85 },
    { f: FORMA_B, bal: BALANCO_B, per: 0.45, sx: k * 0.62, sy: k * 0.7, dx: 0, cor: grPonta, alfa: 0.9 },
  ];
  for (let i = 0; i < camadas.length; i++) {
    const c = camadas[i];
    const [bx, by, incl] = parado ? [1, 1, 0] : ciclo(fase(now, c.per, desloc + i * 0.13), c.bal);
    ctx.save();
    // escala e inclinação a partir da base da chama
    ctx.transform(c.sx * bx, 0, Math.tan(incl) * c.sy * by, c.sy * by, c.dx * c.sx, 0);
    ctx.translate(-BASE_X, -BASE_Y);
    if (c.cor === 'grad') {
      const g = ctx.createLinearGradient(0, 238, 0, 8);
      g.addColorStop(0, grBase);
      g.addColorStop(0.55, grMeio);
      g.addColorStop(1, grPonta);
      ctx.fillStyle = g;
    } else ctx.fillStyle = c.cor;
    ctx.globalAlpha = base * c.alfa;
    tracarForma(ctx, c.f);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = base;

  if (parado) {
    ctx.restore();
    return;
  }
  // raios: polilinhas que piscam, cada uma com período e atraso próprios
  for (let z = 0; z < spec.raios; z++) {
    const periodo = 0.9 + ruido(sem, 100 + z) * 0.5;
    const u = fase(now, periodo, ruido(sem, 200 + z) * 0.9);
    const alfa = u < 0.6 || u > 0.7 ? 0 : u > 0.63 && u < 0.67 ? 0.15 : 1;
    if (alfa === 0) continue;
    const px = -60 + z * (120 / Math.max(1, spec.raios));
    const py = -190 + ruido(sem, 300 + z) * 100;
    ctx.globalAlpha = base * alfa;
    ctx.strokeStyle = z % 2 ? '#ffffff' : grMeio;
    ctx.lineWidth = 2.4 / e;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 10, py + 24);
    ctx.lineTo(px + 2, py + 26);
    ctx.lineTo(px + 14, py + 56);
    ctx.stroke();
  }
  // brasas: quadradinhos que sobem e somem
  for (let b = 0; b < spec.brasas; b++) {
    const dur = 1.2 + ruido(sem, 400 + b) * 1.2;
    const u = fase(now, dur, ruido(sem, 500 + b) * 2);
    const lado = 2 + ruido(sem, 600 + b) * 3;
    const alfa = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
    ctx.globalAlpha = base * alfa;
    ctx.fillStyle = ruido(sem, 700 + b) > 0.5 ? grPonta : grMeio;
    ctx.fillRect(-40 + ruido(sem, 800 + b) * 80 + (ruido(sem, 900 + b) - 0.5) * 40 * u, -40 - ruido(sem, 1000 + b) * 50 - 150 * u, lado, lado);
  }
  ctx.restore();
}
