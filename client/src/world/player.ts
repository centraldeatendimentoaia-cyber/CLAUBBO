// O boneco do jogador no escritório: o alvo mais perto (agente ou elevador) para a dica de interação. O boneco em si é o
// visitante da cena Visita (sim/visitor.ts) rodando num Sim fora do modo visita. Regras puras (sem DOM).
import type { Dir, FurnitureKind } from '../art/api';
import { TILE } from './constants';
import { objetosDoPredio, type Categoria, type ObjetoCand } from './objetos';
import type { Sim } from './sim/sim';

export interface Alvo {
  tipo: 'agente' | 'elevador' | 'objeto';
  id: string;
  /** Em tiles. */
  distancia: number;
  /** Só `objeto`: o móvel, o que ele permite e o ponto (px de mundo) onde a dica aparece. */
  kind?: FurnitureKind;
  categoria?: Categoria;
  px?: { x: number; y: number };
}

export interface Candidato {
  tipo: 'agente' | 'elevador';
  id: string;
  /** Posição em tiles (pode ser fracionária). */
  x: number;
  y: number;
}

/** Até esta distância (tiles) o alvo vale mesmo fora da frente do boneco. */
const COLADO = 0.6;
const FRENTE: Record<Dir, readonly [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * O candidato mais perto dentro do raio. Agente só conta se está na frente do boneco (do lado para onde `dir` aponta) ou
 * quase colado nele; o elevador conta só pelo raio (o boneco nasce de costas para a porta e a dica precisa aparecer); empate de distância vai para o menor id, para o resultado não depender da ordem da lista.
 */
export function alvoMaisPerto(pos: { x: number; y: number }, dir: Dir, candidatos: readonly Candidato[], raioTiles = 1.5): Alvo | null {
  const [fx, fy] = FRENTE[dir];
  let melhor: Alvo | null = null;
  for (const c of candidatos) {
    const dx = c.x - pos.x;
    const dy = c.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d > raioTiles || (c.tipo === 'agente' && d >= COLADO && dx * fx + dy * fy <= 0)) continue;
    if (!melhor || d < melhor.distancia || (d === melhor.distancia && c.id < melhor.id)) melhor = { tipo: c.tipo, id: c.id, distancia: d };
  }
  return melhor;
}

/** Até esta distância (tiles) da borda do móvel ele vale; colado (menos de COLADO_OBJETO) vale mesmo sem olhar para ele. */
const RAIO_OBJETO = 1;
const COLADO_OBJETO = 0.4;

/** O móvel mais perto, medido até a borda dele e à frente do boneco; empate vai para o menor id. */
export function objetoMaisPerto(pos: { x: number; y: number }, dir: Dir, objetos: readonly ObjetoCand[], raio = RAIO_OBJETO): Alvo | null {
  const [fx, fy] = FRENTE[dir];
  let melhor: Alvo | null = null;
  for (const o of objetos) {
    const dx = Math.min(Math.max(pos.x, o.x), o.x + o.w) - pos.x;
    const dy = Math.min(Math.max(pos.y, o.y), o.y + o.h) - pos.y;
    const d = Math.hypot(dx, dy);
    if (d > raio || (d >= COLADO_OBJETO && dx * fx + dy * fy <= 0)) continue;
    if (!melhor || d < melhor.distancia || (d === melhor.distancia && o.id < melhor.id)) {
      melhor = { tipo: 'objeto', id: o.id, distancia: d, kind: o.kind, categoria: o.categoria, px: { x: (o.x + o.w / 2) * TILE, y: o.y * TILE } };
    }
  }
  return melhor;
}

/** O alvo do jogador na simulação do andar dele: agentes à vista e elevadores; sem eles, o móvel mais perto. Parado no elevador (chegando/saindo): nada. */
export function alvoDoJogador(sim: Sim): Alvo | null {
  const v = sim.visitor;
  if (!v || sim.visitorBusy) return null;
  const candidatos: Candidato[] = [];
  for (const ch of sim.chars.values()) if (!ch.gone && !ch.inside) candidatos.push({ tipo: 'agente', id: ch.id, x: ch.x / TILE, y: ch.y / TILE });
  for (const e of sim.elevators) {
    const s = sim.spots.get(e.spotId);
    if (s) candidatos.push({ tipo: 'elevador', id: e.spotId, x: s.x / TILE, y: s.y / TILE });
  }
  const pos = { x: v.x / TILE, y: v.y / TILE };
  return alvoMaisPerto(pos, v.dir, candidatos) ?? objetoMaisPerto(pos, v.dir, objetosDoPredio(sim.building));
}

/** Onde o alvo está (px de mundo), ou null se sumiu. */
export function posicaoDoAlvo(sim: Sim, alvo: Alvo): { x: number; y: number } | null {
  if (alvo.tipo === 'objeto') return alvo.px ?? null;
  if (alvo.tipo === 'agente') {
    const ch = sim.chars.get(alvo.id);
    return ch ? { x: ch.x, y: ch.y } : null;
  }
  const s = sim.spots.get(alvo.id);
  return s ? { x: s.x, y: s.y } : null;
}
