// O boneco do jogador no escritório: o alvo mais perto (agente ou elevador) para a dica de interação. O boneco em si é o
// visitante da cena Visita (sim/visitor.ts) rodando num Sim fora do modo visita. Regras puras (sem DOM).
import type { Dir } from '../art/api';
import { TILE } from './constants';
import type { Sim } from './sim/sim';

export interface Alvo {
  tipo: 'agente' | 'elevador';
  id: string;
  /** Em tiles. */
  distancia: number;
}

export interface Candidato {
  tipo: Alvo['tipo'];
  id: string;
  /** Posição em tiles (pode ser fracionária). */
  x: number;
  y: number;
}

/** Até esta distância (tiles) o alvo vale mesmo fora da frente do boneco. */
const COLADO = 0.6;
const FRENTE: Record<Dir, readonly [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * O candidato mais perto dentro do raio. Só conta quem está na frente do boneco (do lado para onde `dir` aponta) ou
 * quase colado nele; empate de distância vai para o menor id, para o resultado não depender da ordem da lista.
 */
export function alvoMaisPerto(pos: { x: number; y: number }, dir: Dir, candidatos: readonly Candidato[], raioTiles = 1.5): Alvo | null {
  const [fx, fy] = FRENTE[dir];
  let melhor: Alvo | null = null;
  for (const c of candidatos) {
    const dx = c.x - pos.x;
    const dy = c.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d > raioTiles || (d >= COLADO && dx * fx + dy * fy <= 0)) continue;
    if (!melhor || d < melhor.distancia || (d === melhor.distancia && c.id < melhor.id)) melhor = { tipo: c.tipo, id: c.id, distancia: d };
  }
  return melhor;
}

/** O alvo do jogador na simulação do andar dele: agentes à vista e elevadores. Parado no elevador (chegando/saindo): nada. */
export function alvoDoJogador(sim: Sim): Alvo | null {
  const v = sim.visitor;
  if (!v || sim.visitorBusy) return null;
  const candidatos: Candidato[] = [];
  for (const ch of sim.chars.values()) if (!ch.gone && !ch.inside) candidatos.push({ tipo: 'agente', id: ch.id, x: ch.x / TILE, y: ch.y / TILE });
  for (const e of sim.elevators) {
    const s = sim.spots.get(e.spotId);
    if (s) candidatos.push({ tipo: 'elevador', id: e.spotId, x: s.x / TILE, y: s.y / TILE });
  }
  return alvoMaisPerto({ x: v.x / TILE, y: v.y / TILE }, v.dir, candidatos);
}

/** Onde o alvo está (px de mundo), ou null se sumiu. */
export function posicaoDoAlvo(sim: Sim, alvo: Alvo): { x: number; y: number } | null {
  if (alvo.tipo === 'agente') {
    const ch = sim.chars.get(alvo.id);
    return ch ? { x: ch.x, y: ch.y } : null;
  }
  const s = sim.spots.get(alvo.id);
  return s ? { x: s.x, y: s.y } : null;
}
