// Boneco do jogador no escritório: o alvo mais perto (puro) e a integração com a simulação, sem canvas.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../art/api';
import { DEFAULT_WORLD_OPTIONS } from './api';
import { TILE } from './constants';
import { alvoDoJogador, alvoMaisPerto, posicaoDoAlvo } from './player';
import { Sim } from './sim/sim';
import { VISITOR_ID, visitorInfo } from './sim/visitor';

type Cand = Parameters<typeof alvoMaisPerto>[2][number];
const agente = (id: string, x: number, y: number): Cand => ({ tipo: 'agente', id, x, y });
const elevador = (id: string, x: number, y: number): Cand => ({ tipo: 'elevador', id, x, y });
const ORIGEM = { x: 10, y: 10 };

describe('alvoMaisPerto', () => {
  it('agente a 1 tile e outro a 3: devolve o primeiro', () => {
    const r = alvoMaisPerto(ORIGEM, 'right', [agente('longe', 13, 10), agente('perto', 11, 10)]);
    expect(r).toEqual({ tipo: 'agente', id: 'perto', distancia: 1 });
  });

  it('nenhum candidato no raio: null', () => {
    expect(alvoMaisPerto(ORIGEM, 'right', [agente('a', 13, 10)])).toBeNull();
    expect(alvoMaisPerto(ORIGEM, 'right', [])).toBeNull();
  });

  it('empate de distância: o de menor id', () => {
    const r = alvoMaisPerto(ORIGEM, 'right', [agente('b', 11, 10), agente('a', 11, 10)]);
    expect(r?.id).toBe('a');
    // a ordem da lista não muda o resultado
    expect(alvoMaisPerto(ORIGEM, 'right', [agente('a', 11, 10), agente('b', 11, 10)])?.id).toBe('a');
  });

  it('elevador a 1,4 tile e agente a 1,0: o agente', () => {
    const r = alvoMaisPerto(ORIGEM, 'right', [elevador('e0', 11.4, 10), agente('ana', 11, 10)]);
    expect(r?.tipo).toBe('agente');
  });

  it('agente atrás do boneco a 1,2 tile (mais de 0,6): null; a menos de 0,6 vale mesmo atrás', () => {
    expect(alvoMaisPerto(ORIGEM, 'right', [agente('ana', 8.8, 10)])).toBeNull();
    expect(alvoMaisPerto(ORIGEM, 'right', [agente('ana', 9.5, 10)])?.id).toBe('ana');
  });

  it('respeita o raio dado', () => {
    expect(alvoMaisPerto(ORIGEM, 'down', [agente('ana', 10, 11.4)], 1)).toBeNull();
    expect(alvoMaisPerto(ORIGEM, 'down', [agente('ana', 10, 11.4)])?.id).toBe('ana');
  });
});

// ---------------------------------------------------------------- integração com a simulação (sem canvas)

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};
const appearance: Appearance = {
  skin: '#f0c8a0',
  hair: '#3a2a20',
  hairStyle: 'short',
  eyes: '#222',
  top: '#3f7fd8',
  topAccent: '#fff',
  topStyle: 'tshirt',
  bottom: '#333',
  shoes: '#111',
  accessory: 'none',
  accessoryColor: '#000',
  lanyard: null,
  look: 'm',
};
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_700_000_000_000;
const ME = { name: 'Dono', look: 'm' as const, parts: {} };

const sala: RoomInfo = { id: '/a', name: 'a', path: '/a', slot: 0, seed: 7, createdAt: T0 };
const ana: AgentInfo = {
  id: 'ana',
  kind: 'main',
  roomId: '/a',
  name: 'Ana',
  look: 'f',
  role: 'Agente principal',
  sessionId: 's-ana',
  account: '.claude',
  status: 'working',
  recent: [],
  tasks: [],
  startedAt: T0,
  lastEventAt: T0,
  statusSince: T0,
  stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
  seed: 3,
};
const snapshot: OfficeSnapshot = {
  rev: 1,
  serverTime: T0,
  rooms: [sala],
  agents: [ana],
  accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
  meta: { demo: true, sources: [], startedAt: T0, version: 't' },
};

function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean): void {
  for (let i = 0, n = Math.round(seconds * 30); i < n; i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (until?.()) return;
  }
}

function escritorio() {
  // carteiras só em memória (null), como nas outras simulações de teste
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null, { floor: 1 });
  const clock = { now: T0 };
  sim.applySnapshot(snapshot, clock.now);
  run(sim, clock, 1);
  return { sim, clock };
}

describe('o jogador dentro do escritório (Sim fora do modo visita)', () => {
  it('nasce no elevador, anda com o teclado e o alvo é o elevador quando está perto dele', () => {
    const { sim, clock } = escritorio();
    expect(sim.visit).toBe(false);
    const v = sim.setVisitor(visitorInfo(ME, clock.now), clock.now)!;
    run(sim, clock, 10, () => !sim.visitorBusy);
    expect(sim.visitorBusy).toBe(false);
    expect(sim.chars.has(VISITOR_ID)).toBe(false);
    // recém-saído do elevador ele olha para baixo, de costas para a porta: o alvo só aparece quando vira para ela
    expect(alvoDoJogador(sim)).toBeNull();
    v.dir = 'up';
    const a = alvoDoJogador(sim);
    expect(a?.tipo).toBe('elevador');
    expect(posicaoDoAlvo(sim, a!)).not.toBeNull();
    // andando para longe do elevador, o alvo some
    const x0 = v.x;
    const y0 = v.y;
    sim.visitorIntent = { dx: 0, dy: 1, run: true };
    run(sim, clock, 3);
    sim.visitorIntent = { dx: 0, dy: 0, run: false };
    expect(Math.hypot(v.x - x0, v.y - y0)).toBeGreaterThan(TILE);
    expect(alvoDoJogador(sim)?.tipo).not.toBe('agente');
  });

  it('sai pelo elevador: o callback roda quando a porta fecha e o boneco some da simulação', () => {
    const { sim, clock } = escritorio();
    sim.setVisitor(visitorInfo(ME, clock.now), clock.now);
    run(sim, clock, 10, () => !sim.visitorBusy);
    let saiu = 0;
    expect(sim.visitorExit(() => saiu++)).toBe(true);
    run(sim, clock, 15, () => saiu > 0);
    expect(saiu).toBe(1);
  });

  it('sem jogador ligado nada muda: alvoDoJogador devolve null', () => {
    const { sim } = escritorio();
    expect(sim.visitor).toBeNull();
    expect(alvoDoJogador(sim)).toBeNull();
  });
});
