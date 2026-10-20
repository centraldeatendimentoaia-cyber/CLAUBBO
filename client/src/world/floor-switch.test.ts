// Trocar de andar só troca a câmera/qual simulação é desenhada: os agentes dos dois andares seguem onde estão.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../shared/types';
import type { ArtModule, RoomTheme } from '../art/api';
import { setFloor } from '../floor';
import { OfficeStore } from '../net/store';
import { DEFAULT_WORLD_OPTIONS } from './api';
import { createWorld } from './index';
import { Sim } from './sim/sim';

const T0 = 1_700_000_000_000;
const theme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' } as RoomTheme;
const art = {
  appearanceFromSeed: () => ({ skin: '#f0c8a0', hair: '#3a2a20', hairStyle: 'short', eyes: '#222', top: '#3f7fd8', topAccent: '#fff', topStyle: 'tshirt', bottom: '#333', shoes: '#111', accessory: 'none', accessoryColor: '#000', lanyard: null, look: 'm' }),
  roomTheme: () => theme,
} as unknown as ArtModule;

const room = (id: string, slot: number, floor?: number): RoomInfo => ({ id, name: id, path: id, slot, seed: slot * 99 + 7, createdAt: T0, ...(floor ? { floor } : {}) }) as RoomInfo;
const agent = (id: string, roomId: string): AgentInfo =>
  ({ id, kind: 'main', roomId, name: id, look: 'f', role: 'Agente principal', sessionId: `s-${id}`, account: '.claude', status: 'working', recent: [], tasks: [], startedAt: T0, lastEventAt: T0, statusSince: T0, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 }, seed: id.length * 1234567 }) as AgentInfo;
const snap = (): OfficeSnapshot =>
  ({
    rev: 1,
    serverTime: T0,
    rooms: [room('esc', 0), room('cli', 1, 2)],
    agents: [agent('ana', 'esc'), agent('bia', 'cli')],
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't' },
  }) as OfficeSnapshot;

afterEach(() => {
  setFloor(1);
  vi.unstubAllGlobals();
});

describe('causa: simulação única descartava o outro andar', () => {
  it('uma Sim sem andar fixo manda os agentes do andar deixado embora ao trocar (o bug)', () => {
    setFloor(1);
    const sim = new Sim(art, () => DEFAULT_WORLD_OPTIONS, null);
    sim.applySnapshot(snap(), T0);
    expect([...sim.chars.keys()]).toEqual(['ana']);
    setFloor(2);
    sim.applySnapshot(snap(), T0 + 1000);
    expect(sim.chars.get('ana')!.missingSince).not.toBeNull(); // "sumiu do snapshot" -> vai embora
    expect(sim.rooms.get('esc')!.listed).toBe(false); // sala se desmonta
  });
});

describe('uma simulação por andar', () => {
  it('Sim fixada num andar só recebe o dela e não reage à troca de andar', () => {
    const one = new Sim(art, () => DEFAULT_WORLD_OPTIONS, null, { floor: 1 });
    const two = new Sim(art, () => DEFAULT_WORLD_OPTIONS, null, { floor: 2 });
    one.applySnapshot(snap(), T0);
    two.applySnapshot(snap(), T0);
    expect([...one.chars.keys()]).toEqual(['ana']);
    expect([...two.chars.keys()]).toEqual(['bia']);
    const before = (s: Sim) => [...s.chars.values()].map((c) => [c.id, c.tx, c.ty, c.mode, c.roomId, c.leaving, c.gone]);
    const a = before(one);
    const b = before(two);
    const ana = one.chars.get('ana');
    const bia = two.chars.get('bia');
    for (const f of [2, 1, 2, 1]) {
      setFloor(f);
      one.applySnapshot(snap(), T0 + 1000);
      two.applySnapshot(snap(), T0 + 1000);
    }
    expect(before(one)).toEqual(a);
    expect(before(two)).toEqual(b);
    expect(one.chars.get('ana')).toBe(ana); // o mesmo personagem: sem respawn
    expect(two.chars.get('bia')).toBe(bia);
    expect(ana!.missingSince).toBeNull();
    expect(bia!.missingSince).toBeNull();
    expect(one.rooms.get('esc')!.listed).toBe(true);
    expect(two.rooms.get('cli')!.listed).toBe(true);
  });
});

describe('no mundo: ida e volta entre andares', () => {
  it('posições, estados e salas iguais, sem saída nem entrada, e o outro andar já estava lá', () => {
    vi.stubGlobal('document', Object.assign(new EventTarget(), { fonts: new EventTarget() }));
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const canvas = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 600, width: 800, height: 600, style: {}, getContext: () => ({}) }) as unknown as HTMLCanvasElement;
    const store = new OfficeStore();
    store.snapshot = snap();
    setFloor(1);
    const world = createWorld(canvas, store);
    type St = { rooms: { id: string; phase: string; listed: boolean }[]; chars: { id: string; tile: number[]; mode: string; room: string; leaving?: boolean; gone?: boolean }[] };
    const st = () => {
      const s = world.debug.state() as St & { camera: unknown };
      return { rooms: s.rooms, chars: s.chars };
    };
    try {
      const andar1 = st();
      expect(andar1.chars.map((c) => c.id)).toEqual(['ana']);
      setFloor(2);
      const andar2 = st();
      expect(andar2.chars.map((c) => c.id)).toEqual(['bia']);
      expect(andar2.rooms.every((r) => r.phase === 'ready' && r.listed)).toBe(true); // já montado: nada de entrada
      setFloor(1);
      expect(st()).toEqual(andar1);
      setFloor(2);
      expect(st()).toEqual(andar2);
      setFloor(1);
      expect(st()).toEqual(andar1);
    } finally {
      world.destroy();
      store.disconnect();
    }
  });
});
