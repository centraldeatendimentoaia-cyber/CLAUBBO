import { describe, expect, it, vi } from 'vitest';
import type { AgentInfo, RoomInfo } from '../../../shared/types';
import { buildFloors, createBuildingView, currentFloorN, floorTarget, layoutFloors, onToggleBuilding, paintFacade, poseFor, rideMs, stepFloor, toggleBuilding } from './building-view';
import { elevatorFrame } from './camera';

const room = (id: string, name: string, slot: number, floor?: number): RoomInfo => ({ id, name, path: '', slot, seed: slot, createdAt: 0, ...(floor ? { floor } : {}) }) as RoomInfo;
const agent = (id: string, roomId: string, kind: 'main' | 'sub' = 'main'): AgentInfo => ({ id, roomId, kind, name: id, seed: id.length }) as AgentInfo;

const rooms = [room('c', 'Cliente', 2), room('a', 'Alfa', 0), room('t', 'Terminal 1', 5, 2), room('b', 'Beta', 1)];
const agents = [agent('x', 'a'), agent('y', 'a'), agent('s', 'a', 'sub'), agent('z', 'b')];

describe('buildFloors', () => {
  it('térreo, uma sala por andar na ordem do slot e o andar CLI no topo', () => {
    const f = buildFloors(rooms, agents);
    expect(f.map((x) => [x.n, x.kind, x.label])).toEqual([
      [1, 'lobby', 'Térreo'],
      [2, 'room', 'Alfa'],
      [3, 'room', 'Beta'],
      [4, 'room', 'Cliente'],
      [5, 'cli', 'Terminais CLI'],
    ]);
  });
  it('as salas do andar 2 (terminais) não viram andar; conta só agentes principais', () => {
    const f = buildFloors(rooms, agents);
    expect(f.some((x) => x.roomId === 't')).toBe(false);
    expect(f.find((x) => x.roomId === 'a')?.agents).toBe(2);
  });
  it('sem salas ainda há térreo e terminais', () => {
    expect(buildFloors([], []).map((x) => x.kind)).toEqual(['lobby', 'cli']);
  });
  it('acompanha as salas reais: sala nova = andar novo', () => {
    expect(buildFloors([...rooms, room('d', 'Delta', 9)], agents)).toHaveLength(buildFloors(rooms, agents).length + 1);
  });
});

describe('destino e navegação', () => {
  const f = buildFloors(rooms, agents);
  it('floorTarget separa mundo 1/2 e sala', () => {
    expect(floorTarget(f[0])).toEqual({ world: 1, roomId: undefined });
    expect(floorTarget(f[2])).toEqual({ world: 1, roomId: 'b' });
    expect(floorTarget(f[4])).toEqual({ world: 2 });
  });
  it('currentFloorN: sala enquadrada, terminais ou térreo', () => {
    expect(currentFloorN(f, 1, 'c')).toBe(4);
    expect(currentFloorN(f, 1, null)).toBe(1);
    expect(currentFloorN(f, 2, null)).toBe(5);
  });
  it('stepFloor trava nos extremos', () => {
    expect(stepFloor(f, 5, 1)).toBe(5);
    expect(stepFloor(f, 1, -1)).toBe(1);
    expect(stepFloor(f, 2, 1)).toBe(3);
  });
});

describe('fachada', () => {
  const specs = buildFloors(rooms, agents);
  it('andares empilhados: térreo embaixo, CLI em cima, sem vão', () => {
    const { floors } = layoutFloors(specs);
    expect(floors.map((x) => x.n)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < floors.length; i++) expect(floors[i].y + floors[i].h).toBe(floors[i - 1].y);
  });
  it('pinta o buffer inteiro e os agentes reais (só principais) ficam clicáveis', () => {
    const fa = paintFacade(specs, rooms, agents);
    expect(fa.px).toHaveLength(fa.W * fa.H * 4);
    expect(fa.px[3]).toBe(255);
    expect(fa.agentRects.map((a) => a.name).sort()).toEqual(['x', 'y', 'z']);
  });
});

describe('câmera de elevador', () => {
  const fa = paintFacade(buildFloors(rooms, agents), rooms, agents);
  const wide = poseFor(fa, 0, 880, 640);
  const up = poseFor(fa, 4, 880, 640);
  it('fachada inteira cabe no quadro; andar chega mais perto e centraliza no andar', () => {
    expect(wide.z).toBeLessThan(up.z);
    expect(wide.z * fa.H).toBeLessThanOrEqual(640 + 1e-6);
    const f = fa.floors.find((x) => x.n === 4)!;
    expect(up.cy).toBe(f.y + f.h / 2);
  });
  it('a cabine para no andar escolhido', () => {
    expect(up.cabin).toBe(fa.floors.find((x) => x.n === 4)!.y + 48 - 18);
  });
  it('começa e termina nas poses, cabine acompanha', () => {
    expect(elevatorFrame(wide, up, 0)).toEqual(wide);
    expect(elevatorFrame(wide, up, 1)).toEqual({ ...up, z: up.z });
    expect(elevatorFrame(wide, up, 0.5).cabin).toBeCloseTo((wide.cabin + up.cabin) / 2, 6);
  });
  it('entre andares, o zoom se afasta no meio (arco) e volta ao fim', () => {
    const a = poseFor(fa, 2, 880, 640);
    const b = poseFor(fa, 4, 880, 640);
    const mid = elevatorFrame(a, b, 0.5, 2);
    expect(mid.z).toBeLessThan(a.z - 1.9);
    expect(elevatorFrame(a, b, 1, 2).z).toBeCloseTo(b.z, 6);
    expect(elevatorFrame(a, b, 0, 2).z).toBeCloseTo(a.z, 6);
  });
  it('viagens mais longas duram mais, com teto', () => {
    expect(rideMs(1, 2)).toBeLessThan(rideMs(1, 4));
    expect(rideMs(1, 9)).toBe(rideMs(1, 5));
  });
});

describe('fachada aberta com a barra do topo', () => {
  type Fake = EventTarget & { style: Record<string, string>; [k: string]: unknown };
  const made: Fake[] = [];
  const keys = new Map<string, (e: unknown) => void>();
  let frames: ((t: number) => void)[] = [];

  const setup = () => {
    const ctx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? {} : () => undefined), set: () => true });
    const el = (): Fake => {
      const e = Object.assign(new EventTarget(), {
        style: {} as Record<string, string>,
        className: '',
        offsetWidth: 0,
        offsetLeft: 0,
        offsetTop: 0,
        clientWidth: 880,
        clientHeight: 600,
        width: 0,
        height: 0,
        setAttribute: () => undefined,
        append: () => undefined,
        remove: () => undefined,
        focus: () => undefined,
        getContext: () => ctx,
        getBoundingClientRect: () => ({ left: 0, top: 64, width: 880, height: 600 }),
      });
      made.push(e as unknown as Fake);
      return e as unknown as Fake;
    };
    vi.stubGlobal('document', { createElement: el, querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 64 }) }) });
    vi.stubGlobal('ImageData', class {});
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('addEventListener', (t: string, cb: (e: unknown) => void) => keys.set(t, cb));
    vi.stubGlobal('removeEventListener', (t: string) => keys.delete(t));
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => (frames = []));
    return el();
  };
  /** Roda os quadros pendentes bem depois do fim de qualquer viagem. */
  const pump = () => {
    for (let i = 0; i < 3; i++) {
      const run = frames;
      frames = [];
      run.forEach((cb) => cb(performance.now() + 60_000));
    }
  };
  const press = (key: string) => keys.get('keydown')!({ key, preventDefault() {}, stopPropagation() {} });

  it('a camada começa abaixo da barra, o botão alterna a fachada e ↑ ↓ Enter Esc seguem valendo', async () => {
    vi.useFakeTimers();
    const canvas = setup();
    (canvas as unknown as { parentElement: unknown }).parentElement = { append: () => undefined };
    const arrive = vi.fn();
    const view = createBuildingView(canvas as unknown as HTMLCanvasElement, { data: () => ({ rooms, agents }), where: () => ({ worldFloor: 1, roomId: null }), arrive });
    const off = onToggleBuilding(() => view.toggle());
    try {
      toggleBuilding(); // o clique no botão "Andar" da barra
      const layer = made.find((e) => e.className === 'ev2-building')!;
      expect(view.open).toBe(true);
      expect(layer.style.display).toBe('block');
      expect(layer.style.top).toBe('64px'); // fundo da barra do topo
      expect(layer.style.height).toBe('calc(100% - 64px)');
      expect(layer.style.width).toBe('100%'); // canvas não estica só com inset
      pump();
      press('ArrowUp');
      pump();
      press('ArrowUp');
      pump();
      press('ArrowDown');
      pump();
      press('ArrowUp');
      pump();
      press('Enter');
      pump();
      expect(arrive).toHaveBeenCalledWith({ world: 1, roomId: 'b' }); // andar 3 = sala Beta
      vi.advanceTimersByTime(400);
      expect(view.open).toBe(false);
      expect(keys.has('keydown')).toBe(false);
      toggleBuilding(); // abre de novo
      expect(view.open).toBe(true);
      pump();
      press('Escape'); // fachada inteira → Esc de novo fecha
      pump();
      press('Escape');
      pump();
      vi.advanceTimersByTime(400);
      expect(view.open).toBe(false);
      toggleBuilding(); // reabre e fecha pelo mesmo botão
      pump();
      toggleBuilding();
      pump();
      vi.advanceTimersByTime(400);
      expect(view.open).toBe(false);
      expect(arrive).toHaveBeenCalledTimes(1);
    } finally {
      off();
      view.destroy();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
