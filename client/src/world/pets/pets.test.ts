import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { ArtModule, RoomTheme } from '../../art/api';
import { PET_FRAMES, PET_H, PET_W, renderPet, type PetPose } from '../../art/pets';
import { loadPrefs, savePrefs, worldOptionsFrom } from '../../ui/prefs';
import { DEFAULT_WORLD_OPTIONS, type WorldOptions } from '../api';
import { FREE } from '../path/grid';
import { TILE } from '../constants';
import { Sim } from '../sim/sim';
import { MAX_PETS, PET_SOCIAL, SPECIES_IDS, addPet, petsOnFloor, pickVisitKind, sanitizePets, type PetsConfig } from './config';

describe('configuração dos pets', () => {
  it('valida: espécie desconhecida sai, nome vazio vira o padrão, andar inválido vira 1, ids repetidos ganham outro', () => {
    const c = sanitizePets({
      enabled: true,
      pets: [
        { id: 'a', species: 'cat', name: '  Mel  ', floor: 2 },
        { id: 'a', species: 'dog', name: '', floor: 9 },
        { id: 'x', species: 'dragon', name: 'Fogo' },
        { species: 'bird', name: 'x'.repeat(40) },
        'lixo',
        null,
      ],
    });
    expect(c.enabled).toBe(true);
    expect(c.pets.map((p) => [p.species, p.name, p.floor])).toEqual([
      ['cat', 'Mel', 2],
      ['dog', 'Totó', 1],
      ['bird', 'x'.repeat(16), 1],
    ]);
    expect(new Set(c.pets.map((p) => p.id)).size).toBe(3);
  });
  it('lixo ou ausente = desligado e vazio; liga só com true de verdade', () => {
    for (const raw of [undefined, null, 5, 'x', [], { enabled: 'sim' }]) expect(sanitizePets(raw)).toEqual({ enabled: false, pets: [] });
  });
  it(`limite de ${MAX_PETS} pets, na validação e ao adicionar`, () => {
    const many = sanitizePets({ enabled: true, pets: Array.from({ length: 30 }, () => ({ species: 'cat' })) });
    expect(many.pets).toHaveLength(MAX_PETS);
    expect(addPet(many, 'dog')).toBeNull();
  });
  it('addPet usa o nome padrão da espécie e ids únicos; petsOnFloor respeita ligado e andar', () => {
    let c: PetsConfig = { enabled: true, pets: [] };
    for (const sp of SPECIES_IDS) c = addPet(c, sp, sp === 'bird' ? 2 : 1)!;
    expect(c.pets.map((p) => p.name)).toEqual(['Mimi', 'Totó', 'Piu']);
    expect(new Set(c.pets.map((p) => p.id)).size).toBe(3);
    expect(petsOnFloor(c, 1).map((p) => p.species)).toEqual(['cat', 'dog']);
    expect(petsOnFloor(c, 2).map((p) => p.species)).toEqual(['bird']);
    expect(petsOnFloor({ ...c, enabled: false }, 1)).toEqual([]);
    expect(petsOnFloor(undefined, 1)).toEqual([]);
  });
  it('persiste nas preferências como as outras, e preferências antigas (sem pets) carregam desligadas', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadPrefs(storage).pets).toEqual({ enabled: false, pets: [] });
    const prefs = { ...loadPrefs(storage), pets: addPet({ enabled: true, pets: [] }, 'cat', 2)! };
    savePrefs(storage, prefs);
    const back = loadPrefs(storage);
    expect(back.pets).toEqual(prefs.pets);
    expect(worldOptionsFrom(back).pets).toEqual(prefs.pets); // o mundo recebe a mesma configuração
    mem.set('claubbo:prefs', JSON.stringify({ showNames: false }));
    expect(loadPrefs(storage).pets.enabled).toBe(false);
  });
});

describe('arte dos pets', () => {
  it('toda espécie, direção, pose e quadro desenha algo dentro do sprite, sem sair da folha', () => {
    for (const species of SPECIES_IDS) {
      for (const variant of [0, 1, 2]) {
        for (const dir of ['left', 'right', 'up', 'down'] as const) {
          for (const pose of Object.keys(PET_FRAMES) as PetPose[]) {
            for (let frame = 0; frame < PET_FRAMES[pose]; frame++) {
              const b = renderPet({ species, variant, dir, pose, frame });
              expect(b.w).toBe(PET_W);
              expect(b.h).toBe(PET_H);
              const bb = b.bounds();
              expect(bb, `${species}/${dir}/${pose}/${frame}`).not.toBeNull();
              expect(bb!.x).toBeGreaterThanOrEqual(0);
              expect(bb!.y).toBeGreaterThanOrEqual(0);
              expect(bb!.x + bb!.w).toBeLessThanOrEqual(PET_W);
              expect(bb!.y + bb!.h).toBeLessThanOrEqual(PET_H);
            }
          }
        }
      }
    }
  });
  it('esquerda é o espelho da direita (mesmo número de pixels)', () => {
    for (const species of SPECIES_IDS) {
      const l = renderPet({ species, variant: 0, dir: 'left', pose: 'stand', frame: 0 });
      const r = renderPet({ species, variant: 0, dir: 'right', pose: 'stand', frame: 0 });
      expect(l.countOpaque()).toBe(r.countOpaque());
    }
  });
});

// ---------------------------------------------------------------- comportamento (Sim real, sem DOM)

const T0 = 1_700_000_000_000;
const theme: RoomTheme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' };
const art = {
  appearanceFromSeed: () => ({ skin: '#f0c8a0', hair: '#3a2a20', hairStyle: 'short', eyes: '#222', top: '#3f7fd8', topAccent: '#fff', topStyle: 'tshirt', bottom: '#333', shoes: '#111', accessory: 'none', accessoryColor: '#000', lanyard: null, look: 'm' }),
  roomTheme: () => theme,
} as unknown as ArtModule;
const room = (id: string, slot: number): RoomInfo => ({ id, name: id, path: id, slot, seed: slot * 99 + 7, createdAt: T0 }) as RoomInfo;
const agent = (id: string, roomId: string): AgentInfo =>
  ({ id, kind: 'main', roomId, name: id, look: 'f', role: 'Agente principal', sessionId: `s-${id}`, account: '.claude', status: 'working', recent: [], tasks: [], startedAt: T0, lastEventAt: T0, statusSince: T0, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 }, seed: id.length * 1234567 }) as AgentInfo;
const snap = (rooms: RoomInfo[], agents: AgentInfo[] = []): OfficeSnapshot =>
  ({ rev: 1, serverTime: T0, rooms, agents, accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }], meta: { demo: true, sources: [], startedAt: T0, version: 't' } }) as OfficeSnapshot;

const cfg = (extra: Partial<PetsConfig> = {}): PetsConfig => ({
  enabled: true,
  pets: [
    { id: 'g', species: 'cat', name: 'Mimi', floor: 1 },
    { id: 'c', species: 'dog', name: 'Totó', floor: 1 },
    { id: 'p', species: 'bird', name: 'Piu', floor: 1 },
    { id: 't', species: 'cat', name: 'Termi', floor: 2 },
  ],
  ...extra,
});

function makeSim(floor: number, pets: PetsConfig | undefined, rooms = [room('a', 0), room('b', 1)]) {
  const opts: WorldOptions = { ...DEFAULT_WORLD_OPTIONS, pets };
  const sim = new Sim(art, () => opts, null, { floor });
  const clock = { now: T0 };
  sim.applySnapshot(snap(rooms.map((r) => (floor === 2 ? ({ ...r, floor: 2 } as RoomInfo) : r)), [agent('x', rooms[0].id)]), clock.now);
  return { sim, clock, opts };
}

function run(sim: Sim, clock: { now: number }, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += 1 / 30) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    each?.();
  }
}

describe('comportamento dos pets', () => {
  it('cada simulação (andar) só cria os pets do próprio andar; desligado = nenhum', () => {
    const one = makeSim(1, cfg());
    const two = makeSim(2, cfg());
    run(one.sim, one.clock, 1);
    run(two.sim, two.clock, 1);
    expect(one.sim.pets.list.map((p) => p.id)).toEqual(['g', 'c', 'p']);
    expect(two.sim.pets.list.map((p) => p.id)).toEqual(['t']);
    const off = makeSim(1, cfg({ enabled: false }));
    run(off.sim, off.clock, 1);
    expect(off.sim.pets.list).toHaveLength(0);
    const none = makeSim(1, undefined);
    run(none.sim, none.clock, 1);
    expect(none.sim.pets.list).toHaveLength(0);
  });

  it('nascem e andam só em tiles livres do prédio, nunca em parede ou móvel, e se movem de verdade', () => {
    const { sim, clock } = makeSim(1, cfg());
    const start = new Map<string, string>();
    let moved = 0;
    let slept = 0;
    run(sim, clock, 90, () => {
      for (const p of sim.pets.list) {
        if (!p.placed) continue;
        expect(sim.building.grid.walkable(p.tx, p.ty), `${p.id} em tile bloqueado ${p.tx},${p.ty}`).toBe(true);
        // a posição visual fica perto do tile lógico: nada de teletransporte para longe
        expect(Math.abs(p.x / TILE - p.tx - 0.5)).toBeLessThan(1.6);
        if (!start.has(p.id)) start.set(p.id, `${p.tx},${p.ty}`);
        else if (start.get(p.id) !== `${p.tx},${p.ty}`) moved++;
        if (p.pose === 'sleep') slept++;
      }
    });
    expect(start.size).toBe(3);
    expect(moved).toBeGreaterThan(30);
    expect(slept).toBeGreaterThan(0);
    for (const p of sim.pets.list) if (p.setting.species === 'bird') expect(p.pose).not.toBe('sleep');
  });

  it('paradas só em tile livre (assento e bloqueados são evitados)', () => {
    const { sim, clock } = makeSim(1, cfg());
    run(sim, clock, 60, () => {
      for (const p of sim.pets.list) if (p.placed && p.mode !== 'walk') expect(sim.building.grid.get(p.tx, p.ty)).toBe(FREE);
    });
  });

  it('reage a quem chega perto: gato ronrona, cachorro abana (coração), passarinho se assusta e foge', () => {
    for (const [species, emote] of [['cat', 'heart'], ['dog', 'heart'], ['bird', 'alert']] as const) {
      const { sim, clock } = makeSim(1, { enabled: true, pets: [{ id: 'z', species, name: 'Z', floor: 1 }] });
      run(sim, clock, 1);
      const pet = sim.pets.list[0];
      const ch = [...sim.chars.values()][0];
      ch.inside = false;
      ch.alpha = 1;
      ch.hiddenUntil = 0;
      ch.x = pet.x + TILE;
      ch.y = pet.y;
      const before = { tx: pet.tx, ty: pet.ty };
      pet.reactAfter = 0;
      pet.until = clock.now + 60_000; // parado, para a reação ser a única coisa que acontece
      run(sim, clock, 0.6);
      expect(pet.emote, species).toBe(emote);
      if (species === 'bird') {
        run(sim, clock, 2);
        expect(pet.tx !== before.tx || pet.ty !== before.ty, 'o passarinho saiu do lugar').toBe(true);
      } else expect(pet.pose).toBe(species === 'cat' ? 'sit' : 'stand');
    }
  });

  it('mudar a configuração em uso: nome atualiza sem o pet reaparecer, andar troca de simulação, remover tira', () => {
    const a = makeSim(1, cfg());
    const b = makeSim(2, cfg());
    run(a.sim, a.clock, 5);
    run(b.sim, b.clock, 5);
    const mimi = a.sim.pets.list.find((p) => p.id === 'g')!;
    const where = [mimi.x, mimi.y];
    const renamed = cfg({ pets: cfg().pets.map((p) => (p.id === 'g' ? { ...p, name: 'Nina' } : p)) });
    a.opts.pets = renamed;
    run(a.sim, a.clock, 0.05);
    expect(a.sim.pets.list.find((p) => p.id === 'g')).toBe(mimi); // o mesmo objeto
    expect(mimi.setting.name).toBe('Nina');
    expect(Math.hypot(mimi.x - where[0], mimi.y - where[1])).toBeLessThan(TILE); // só andou o tempo que passou
    const moved = cfg({ pets: cfg().pets.map((p) => (p.id === 'g' ? { ...p, floor: 2 as const } : p)) });
    a.opts.pets = moved;
    b.opts.pets = moved;
    run(a.sim, a.clock, 0.05);
    run(b.sim, b.clock, 0.05);
    expect(a.sim.pets.list.map((p) => p.id)).not.toContain('g');
    expect(b.sim.pets.list.map((p) => p.id)).toContain('g');
    a.opts.pets = { enabled: true, pets: [] };
    run(a.sim, a.clock, 0.05);
    expect(a.sim.pets.list).toHaveLength(0);
  });

  it('trocar o andar mostrado não mexe nos pets: a simulação do outro andar segue viva e a deixada fica intacta', () => {
    const a = makeSim(1, cfg());
    const b = makeSim(2, cfg());
    run(a.sim, a.clock, 6);
    run(b.sim, b.clock, 6);
    const snapOf = (s: Sim) => s.pets.list.map((p) => [p.id, p.x, p.y, p.pose, p.dir, p.mode]);
    const objs = [...a.sim.pets.list];
    const before = snapOf(a.sim);
    run(b.sim, b.clock, 30); // o mundo só desenha o andar 2 (nada é chamado no andar 1 neste teste)
    expect(snapOf(a.sim)).toEqual(before);
    expect(a.sim.pets.list.every((p, i) => p === objs[i])).toBe(true);
    run(a.sim, a.clock, 1); // volta: segue de onde parou
    expect(a.sim.pets.list.map((p) => p.id)).toEqual(['g', 'c', 'p']);
  });

  it('prédio muda (uma sala some): pet em tile que sumiu é recolocado em tile livre', () => {
    const { sim, clock } = makeSim(1, cfg(), [room('a', 0), room('b', 1)]);
    run(sim, clock, 3);
    sim.applySnapshot(snap([room('a', 0)], [agent('x', 'a')]), clock.now);
    run(sim, clock, 12, () => {
      for (const p of sim.pets.list) if (p.placed) expect(sim.building.grid.walkable(p.tx, p.ty), `${p.id} preso em ${p.tx},${p.ty}`).toBe(true);
    });
    expect(sim.pets.list.every((p) => p.placed)).toBe(true);
  });

  it('sem sala montada, o pet espera sem erro e aparece quando ela existe', () => {
    const opts: WorldOptions = { ...DEFAULT_WORLD_OPTIONS, pets: cfg() };
    const sim = new Sim(art, () => opts, null, { floor: 1 });
    const clock = { now: T0 };
    sim.applySnapshot(snap([]), clock.now);
    run(sim, clock, 2);
    expect(sim.pets.list.some((p) => p.placed)).toBe(false);
    sim.applySnapshot(snap([room('a', 0)]), clock.now);
    run(sim, clock, 5);
    expect(sim.pets.list.filter((p) => p.placed)).toHaveLength(3);
  });

  it('desempenho: teto de pets e custo baixo por quadro', () => {
    const many = { enabled: true, pets: Array.from({ length: MAX_PETS }, (_, i) => ({ id: `m${i}`, species: SPECIES_IDS[i % 3], name: `P${i}`, floor: 1 as const })) };
    const { sim, clock } = makeSim(1, many);
    run(sim, clock, 2);
    expect(sim.pets.list).toHaveLength(MAX_PETS);
    const t0 = performance.now();
    run(sim, clock, 60); // 1800 quadros
    expect((performance.now() - t0) / 1800).toBeLessThan(2); // folga grande: o alvo real é bem abaixo de 0,2 ms
  });
});

// ---------------------------------------------------------------- tutor e convivência com os personagens

function makeWith(agents: AgentInfo[], pets: PetsConfig, floor = 1) {
  const opts: WorldOptions = { ...DEFAULT_WORLD_OPTIONS, pets };
  const sim = new Sim(art, () => opts, null, { floor });
  const clock = { now: T0 };
  const rooms = [room('a', 0)].map((r) => (floor === 2 ? ({ ...r, floor: 2 } as RoomInfo) : r));
  const apply = (list: AgentInfo[]) => sim.applySnapshot(snap(rooms, list), clock.now);
  apply(agents);
  return { sim, clock, opts, apply };
}
const withStatus = (a: AgentInfo, status: AgentInfo['status']): AgentInfo => ({ ...a, status });
const one = (extra: Partial<PetsConfig['pets'][number]> = {}): PetsConfig => ({ enabled: true, pets: [{ id: 'g', species: 'cat', name: 'Mimi', floor: 1, ...extra }] });
const manhattan = (a: { tx: number; ty: number }, b: { tx: number; ty: number }) => Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);

/** Muda temporariamente as chances/tempos da convivência (restaura no fim). */
function withSocial<T>(patch: Record<string, unknown>, fn: () => T): T {
  const target = PET_SOCIAL as unknown as Record<string, unknown>;
  const old = Object.fromEntries(Object.keys(patch).map((k) => [k, target[k]]));
  Object.assign(target, patch);
  try {
    return fn();
  } finally {
    Object.assign(target, old);
  }
}

describe('tutor: configuração', () => {
  it('valida o tutor: texto limpo e curto; vazio, lixo ou tipo errado = automático (campo some)', () => {
    const c = sanitizePets({
      enabled: true,
      pets: [
        { id: 'a', species: 'cat', tutor: '  .claude:123  ' },
        { id: 'b', species: 'dog', tutor: '' },
        { id: 'c', species: 'bird', tutor: 42 },
        { id: 'd', species: 'cat', tutor: 'x'.repeat(500) },
      ],
    });
    expect(c.pets[0].tutor).toBe('.claude:123');
    expect('tutor' in c.pets[1]).toBe(false);
    expect('tutor' in c.pets[2]).toBe(false);
    expect(c.pets[3].tutor).toHaveLength(200);
  });

  it('persiste o tutor nas preferências e chega ao mundo; preferências antigas (sem tutor) seguem automáticas', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const prefs = {
      ...loadPrefs(storage),
      pets: {
        enabled: true,
        pets: [
          { id: 'g', species: 'cat' as const, name: 'Mimi', floor: 1 as const, tutor: '.claude:7' },
          { id: 'c', species: 'dog' as const, name: 'Totó', floor: 2 as const },
        ],
      },
    };
    savePrefs(storage, prefs);
    const back = loadPrefs(storage);
    expect(back.pets.pets[0].tutor).toBe('.claude:7');
    expect('tutor' in back.pets.pets[1]).toBe(false);
    expect(worldOptionsFrom(back).pets?.pets[0].tutor).toBe('.claude:7');
    mem.set('claubbo:prefs', JSON.stringify({ pets: { enabled: true, pets: [{ id: 'g', species: 'cat', name: 'Mimi', floor: 1 }] } }));
    expect(loadPrefs(storage).pets.pets[0].tutor).toBeUndefined();
  });

  it('quem não é tutor só cumprimenta; o tutor escolhe carinho, brincar ou comida', () => {
    let seed = 1;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 50; i++) expect(pickVisitKind(rng, false)).toBe('cumprimento');
    const kinds = new Set(Array.from({ length: 200 }, () => pickVisitKind(rng, true)));
    expect([...kinds].sort()).toEqual(['brincar', 'carinho', 'comida']);
  });
});

describe('tutor: escolha e queda', () => {
  const two = [agent('ana', 'a'), agent('beto', 'a')];

  it('tutor escolhido (e do andar) é o usado; sem escolha, o mundo escolhe um agente do andar e mantém', () => {
    const fixed = makeWith(two, one({ tutor: 'beto' }));
    run(fixed.sim, fixed.clock, 2);
    expect(fixed.sim.pets.list[0].tutorId).toBe('beto');
    const auto = makeWith(two, one());
    run(auto.sim, auto.clock, 2);
    const t = auto.sim.pets.list[0].tutorId;
    expect(['ana', 'beto']).toContain(t);
    run(auto.sim, auto.clock, 60);
    expect(auto.sim.pets.list[0].tutorId).toBe(t); // estável enquanto ele estiver lá
  });

  it('tutor que não está no andar (ou nunca existiu) cai para automático sem erro', () => {
    const { sim, clock } = makeWith(two, one({ tutor: 'fantasma' }));
    run(sim, clock, 2);
    expect(['ana', 'beto']).toContain(sim.pets.list[0].tutorId);
  });

  it('tutor excluído/saiu do andar: cai para outro agente; sem ninguém, fica sem tutor; ao voltar, a escolha vale de novo', () => {
    const { sim, clock, apply } = makeWith(two, one({ tutor: 'beto' }));
    run(sim, clock, 2);
    expect(sim.pets.list[0].tutorId).toBe('beto');
    apply([two[0]]); // beto sai
    run(sim, clock, 40); // quem sai demora a sumir (anda até o elevador)
    expect(sim.pets.list[0].tutorId).toBe('ana');
    apply([]); // ninguém
    run(sim, clock, 40);
    expect(sim.pets.list[0].tutorId).toBeNull();
    for (const p of sim.pets.list) expect(sim.building.grid.walkable(p.tx, p.ty)).toBe(true);
    apply(two); // volta
    run(sim, clock, 5);
    expect(sim.pets.list[0].tutorId).toBe('beto');
  });
});

describe('pet e tutor', () => {
  it('com frequência vai até o tutor, fica ao lado dele (deitado/dormindo); o tutor ocupado segue trabalhando', () => {
    const { sim, clock } = makeWith([agent('ana', 'a')], one({ tutor: 'ana' }));
    const ana = () => sim.chars.get('ana')!;
    run(sim, clock, 5);
    let near = 0;
    let frames = 0;
    let restedNear = 0;
    let trips = 0;
    let wasTrip = false;
    run(sim, clock, 240, () => {
      const p = sim.pets.list[0];
      if (!p.placed) return;
      frames++;
      if (manhattan(p, ana()) <= 3) near++;
      if (manhattan(p, ana()) <= 3 && (p.pose === 'sleep' || p.pose === 'sit') && p.mode === 'idle') restedNear++;
      if (p.toTutor && !wasTrip) trips++;
      wasTrip = p.toTutor;
      expect(sim.building.grid.walkable(p.tx, p.ty)).toBe(true);
      expect(ana().mode).toBe('work'); // o agente segue trabalhando, na mesa
    });
    expect(trips).toBeGreaterThanOrEqual(2);
    expect(restedNear).toBeGreaterThan(30);
    // e passa bem mais tempo perto dele do que passaria sem o vínculo
    const baseline = withSocial({ toTutorChance: 0 }, () => {
      const b = makeWith([agent('ana', 'a')], one({ tutor: 'ana' }));
      run(b.sim, b.clock, 5);
      let n = 0;
      let f = 0;
      run(b.sim, b.clock, 240, () => {
        const p = b.sim.pets.list[0];
        if (!p.placed) return;
        f++;
        if (manhattan(p, b.sim.chars.get('ana')!) <= 3) n++;
      });
      return n / f;
    });
    expect(near / frames).toBeGreaterThan(baseline + 0.1);
  });

  it('passarinho voa até o tutor (mais alto e mais rápido que o pulinho normal)', () => {
    const { sim, clock } = makeWith([agent('ana', 'a')], one({ species: 'bird', tutor: 'ana' }));
    run(sim, clock, 5);
    let maxLift = 0;
    let flew = false;
    run(sim, clock, 240, () => {
      const p = sim.pets.list[0];
      if (p.flying) {
        flew = true;
        maxLift = Math.max(maxLift, p.lift);
        expect(sim.building.grid.walkable(p.tx, p.ty)).toBe(true);
      }
    });
    expect(flew).toBe(true);
    expect(maxLift).toBeGreaterThan(5);
  });
});

describe('personagens e pets', () => {
  const idle = (id: string) => withStatus(agent(id, 'a'), 'idle');

  it('tutor ocioso vai até o pet, fica ao lado (carinho/brincar/comida, com ícone), o pet espera parado e a visita acaba', () => {
    withSocial({ tutorVisitChance: 1 }, () => {
      const { sim, clock } = makeWith([idle('ana')], one({ tutor: 'ana' }));
      run(sim, clock, 20);
      const ana = sim.chars.get('ana')!;
      let metKind: string | null = null;
      const icons = new Set<string>();
      let adjacentAtMeet = false;
      let visits = 0;
      let wasClaimed = false;
      run(sim, clock, 600, () => {
        const p = sim.pets.list[0];
        expect(sim.building.grid.walkable(ana.tx, ana.ty)).toBe(true);
        expect(sim.building.grid.walkable(p.tx, p.ty)).toBe(true);
        if (p.claim?.kind) {
          metKind = p.claim.kind;
          if (ana.icon) icons.add(ana.icon);
          if (Math.max(Math.abs(ana.tx - p.tx), Math.abs(ana.ty - p.ty)) <= 1) adjacentAtMeet = true;
          expect(p.mode).toBe('idle'); // o pet não sai andando no meio do carinho
        }
        if (p.claim && !wasClaimed) visits++;
        wasClaimed = !!p.claim;
      });
      expect(visits).toBeGreaterThanOrEqual(1);
      expect(['carinho', 'brincar', 'comida']).toContain(metKind);
      expect(adjacentAtMeet).toBe(true);
      expect([...icons].some((i) => ['heart', 'star', 'sparkle'].includes(i))).toBe(true);
      expect(visits).toBeLessThanOrEqual(12); // descanso entre visitas: nada de spam
    });
  });

  it('outro agente (não o tutor) só cumprimenta; o tutor faz carinho, brinca ou dá comida', () => {
    withSocial({ tutorVisitChance: 1, strangerVisitChance: 1, strangerMaxTiles: 99 }, () => {
      const { sim, clock } = makeWith([idle('ana'), idle('beto')], one({ tutor: 'ana' }));
      run(sim, clock, 20);
      const kinds = new Set<string>();
      run(sim, clock, 900, () => {
        const c = sim.pets.list[0].claim;
        if (c?.kind) kinds.add(`${c.by}:${c.kind}`);
      });
      const list = [...kinds];
      expect(list.length).toBeGreaterThan(0);
      expect(list.filter((k) => k.startsWith('beto:')).every((k) => k === 'beto:cumprimento')).toBe(true);
      expect(list.filter((k) => k.startsWith('ana:')).every((k) => k !== 'ana:cumprimento')).toBe(true);
    });
  });

  it('agente trabalhando não larga o trabalho: nenhuma visita parte dele e ele fica na mesa', () => {
    withSocial({ tutorVisitChance: 1, strangerVisitChance: 1, strangerMaxTiles: 99 }, () => {
      const { sim, clock } = makeWith([agent('ana', 'a')], one({ tutor: 'ana' }));
      run(sim, clock, 10);
      const ana = sim.chars.get('ana')!;
      const home = ana.homeSpot;
      let atHome = 0;
      let frames = 0;
      run(sim, clock, 300, () => {
        frames++;
        expect(sim.pets.list[0].claim).toBeNull();
        if (ana.atSpot === home) atHome++;
      });
      expect(atHome / frames).toBeGreaterThan(0.95);
      expect(ana.mode).toBe('work');
    });
  });

  it('visita a caminho: se o agente é chamado ao trabalho, o pet é liberado e segue a vida', () => {
    withSocial({ tutorVisitChance: 1 }, () => {
      const a = idle('ana');
      const { sim, clock, apply } = makeWith([a], one({ tutor: 'ana' }));
      run(sim, clock, 20);
      let guard = 0;
      while (!sim.pets.list[0].claim && guard++ < 600) run(sim, clock, 1);
      expect(sim.pets.list[0].claim?.by).toBe('ana');
      apply([withStatus(a, 'working')]); // chegou trabalho
      run(sim, clock, 2);
      expect(sim.pets.list[0].claim).toBeNull();
      expect(sim.chars.get('ana')!.mode).toBe('work');
      // o pet não fica travado: volta a andar/decidir sozinho
      const p = sim.pets.list[0];
      const at = `${p.tx},${p.ty}`;
      let moved = false;
      run(sim, clock, 90, () => {
        if (`${p.tx},${p.ty}` !== at) moved = true;
      });
      expect(moved).toBe(true);
    });
  });

  it('sem pets, o comportamento dos personagens não muda (nenhum sorteio extra)', () => {
    const a = makeWith([idle('ana')], { enabled: false, pets: [] });
    const b = makeWith([idle('ana')], { enabled: true, pets: [] });
    run(a.sim, a.clock, 120);
    run(b.sim, b.clock, 120);
    const ca = a.sim.chars.get('ana')!;
    const cb = b.sim.chars.get('ana')!;
    expect([ca.tx, ca.ty, ca.pose]).toEqual([cb.tx, cb.ty, cb.pose]);
  });
});
