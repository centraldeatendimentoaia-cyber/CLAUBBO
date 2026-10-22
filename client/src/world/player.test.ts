// Boneco do jogador no escritório: o alvo mais perto (puro) e a integração com a simulação, sem canvas.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../art/api';
import { DEFAULT_WORLD_OPTIONS } from './api';
import { TILE } from './constants';
import { alvoDoJogador, alvoMaisPerto, objetoMaisPerto, posicaoDoAlvo } from './player';
import { objetosDoPredio, type ObjetoCand } from './objetos';
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

  it('elevador atrás do boneco, dentro do raio: é alvo (só agente exige a frente)', () => {
    expect(alvoMaisPerto(ORIGEM, 'right', [elevador('e0', 8.8, 10)])?.id).toBe('e0');
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
    // recém-saído do elevador ele olha para baixo, de costas para a porta: o elevador vale só pelo raio
    expect(v.dir).toBe('down');
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

describe('objetoMaisPerto', () => {
  const obj = (id: string, x: number, y: number, w = 2, h = 1): ObjetoCand => ({ id, kind: 'sofa', categoria: 'sentar', x, y, w, h });

  it('mede até a borda do móvel e exige o móvel à frente', () => {
    const sofa = obj('sofa', 11, 9.5);
    expect(objetoMaisPerto(ORIGEM, 'right', [sofa])).toMatchObject({ tipo: 'objeto', id: 'sofa', categoria: 'sentar', distancia: 1 });
    expect(objetoMaisPerto(ORIGEM, 'left', [sofa])).toBeNull();
  });

  it('colado no móvel vale mesmo olhando para o outro lado', () => {
    expect(objetoMaisPerto({ x: 10.8, y: 10 }, 'left', [obj('sofa', 11, 9.5)])?.id).toBe('sofa');
  });

  it('além de um tile: null; empate vai para o menor id', () => {
    expect(objetoMaisPerto(ORIGEM, 'right', [obj('longe', 12.5, 9.5)])).toBeNull();
    expect(objetoMaisPerto(ORIGEM, 'right', [obj('b', 11, 9.5), obj('a', 11, 9.5)])?.id).toBe('a');
  });
});

describe('móveis do prédio', () => {
  it('o lounge tem fliperama e mesa de pingue-pongue interagíveis, com id estável e único', () => {
    const { sim } = escritorio();
    const todos = objetosDoPredio(sim.building);
    expect(todos.some((o) => o.categoria === 'fliperama')).toBe(true);
    expect(todos.some((o) => o.categoria === 'pingpong')).toBe(true);
    expect(new Set(todos.map((o) => o.id)).size).toBe(todos.length);
    expect(objetosDoPredio(sim.building)).toBe(todos); // cache por prédio
  });

  it('o jogador perto do fliperama, olhando para ele, tem o fliperama como alvo', () => {
    const { sim, clock } = escritorio();
    sim.setVisitor(visitorInfo(ME, clock.now), clock.now);
    run(sim, clock, 10, () => !sim.visitorBusy);
    const f = objetosDoPredio(sim.building).find((o) => o.categoria === 'fliperama')!;
    const v = sim.visitor!;
    v.x = (f.x + f.w / 2) * TILE;
    v.y = (f.y + f.h + 0.3) * TILE;
    v.dir = 'up';
    const a = alvoDoJogador(sim);
    expect(a).toMatchObject({ tipo: 'objeto', id: f.id, categoria: 'fliperama' });
    expect(posicaoDoAlvo(sim, a!)).not.toBeNull();
  });
});

describe('presença: convidados na simulação', () => {
  const ANA = { name: 'Ana', look: 'f' as const };

  it('aparece no ponto avisado, anda até o novo ponto e some ao ser removido; entra em people() e person()', () => {
    const { sim, clock } = escritorio();
    const id = 'convidado:ana';
    sim.setGuest(id, visitorInfo(ANA, clock.now, id), 10, 10, 'down');
    const g = sim.guests.get(id)!;
    expect(g).toBeDefined();
    expect([g.x, g.y]).toEqual([10 * TILE, 10 * TILE]);
    expect([...sim.people()]).toContain(g);
    expect(sim.person(id)).toBe(g);
    sim.setGuest(id, visitorInfo(ANA, clock.now, id), 13, 10, 'up');
    run(sim, clock, 5);
    expect(g.x).toBeCloseTo(13 * TILE, 0);
    expect(g.dir).toBe('up'); // chegou: vira para onde avisou
    expect(g.pose).toBe('stand');
    sim.removeGuest(id);
    expect(sim.guests.size).toBe(0);
    expect(sim.person(id)).toBeUndefined();
  });

  it('o convidado não é alvo do jogador (não entra em chars)', () => {
    const { sim, clock } = escritorio();
    sim.setVisitor(visitorInfo(ME, clock.now), clock.now);
    run(sim, clock, 10, () => !sim.visitorBusy);
    const v = sim.visitor!;
    sim.setGuest('convidado:ana', visitorInfo(ANA, clock.now, 'convidado:ana'), v.x / TILE + 0.5, v.y / TILE, 'down');
    v.dir = 'right';
    expect(alvoDoJogador(sim)?.id).not.toBe('convidado:ana');
    expect(sim.chars.has('convidado:ana')).toBe(false);
  });

  it('longe demais (outro canto do mapa) aparece direto no ponto, sem atravessar o prédio', () => {
    const { sim, clock } = escritorio();
    const id = 'convidado:ana';
    sim.setGuest(id, visitorInfo(ANA, clock.now, id), 5, 5, 'down');
    sim.setGuest(id, visitorInfo(ANA, clock.now, id), 40, 20, 'left');
    run(sim, clock, 0.2);
    expect(sim.guests.get(id)!.x).toBeCloseTo(40 * TILE, 0);
  });
});
