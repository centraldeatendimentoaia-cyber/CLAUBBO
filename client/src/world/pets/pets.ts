// Pets do escritório: estado e comportamento. Reaproveita o que os personagens já usam: a WalkGrid do prédio (paredes e
// móveis bloqueiam), o PathFinder (A*) da simulação, TILE e o laço de atualização do Sim. Cada Sim (um por andar) cuida
// dos pets do andar dele, então trocar de andar na câmera não cria nem apaga nenhum pet.
import { mulberry32, hash32 } from '../../../../shared/hash';
import type { PetPose } from '../../art/pets';
import type { Dir } from '../../art/api';
import { FOOT_DX, FOOT_DY, TILE } from '../constants';
import { FREE, type WalkGrid } from '../path/grid';
import type { PathFinder } from '../path/astar';
import { dirOf } from '../sim/character';
import { MAX_PETS, PET_SOCIAL, SPECIES, between, petsOnFloor, type PetSetting, type PetVisitKind, type PetsConfig } from './config';

type Mode = 'idle' | 'walk' | 'rest';

export class Pet {
  readonly id: string;
  setting: PetSetting;
  readonly rng: () => number;
  /** Pelagem: derivada do id (estável). */
  readonly variant: number;
  /** Pés, em px de mundo. */
  x = 0;
  y = 0;
  tx = 0;
  ty = 0;
  dir: Dir = 'down';
  pose: PetPose = 'stand';
  animT = 0;
  mode: Mode = 'idle';
  placed = false;
  path: number[] = [];
  pi = 0;
  /** Fim da pausa atual (ms do relógio do mundo). */
  until = 0;
  speedMul = 1;
  /** Altura visual (px) do pulinho; só desenho. */
  lift = 0;
  /** Coraçãozinho/susto até este instante. */
  emoteUntil = 0;
  emote: 'heart' | 'alert' | null = null;
  /** Próxima vez que pode reagir a alguém (ms). */
  reactAfter = 0;
  /** Tutor atual (id de agente do mesmo andar), ou null. Resolvido pelo PetManager a partir da configuração. */
  tutorId: string | null = null;
  /** Próxima ida espontânea até o tutor (ms). */
  nextTutorAt = 0;
  /** Fim da última parada ao lado do tutor (ms): só quem esteve com ele há pouco o segue. */
  stayUntil = 0;
  /** Próxima vez que pode seguir o tutor (ms). */
  followAfter = 0;
  /** O caminho atual vai até o tutor. */
  toTutor = false;
  /** Passarinho voando (mais rápido e alto) até o tutor. */
  flying = false;
  /** Um personagem vem até este pet: fica parado esperando e, na chegada, reage (ver PetManager.claim/meet). */
  claim: { by: string; until: number; kind: PetVisitKind | null } | null = null;
  /** Descanso de visitas: antes disso ninguém o procura. */
  visitAfter = 0;

  constructor(setting: PetSetting) {
    this.id = setting.id;
    this.setting = setting;
    const h = hash32(setting.id + setting.species);
    this.rng = mulberry32(h ^ 0x9e3779b9);
    this.variant = h % 3;
  }

  get species() {
    return SPECIES[this.setting.species];
  }

  placeAtTile(tx: number, ty: number): void {
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE + FOOT_DX;
    this.y = ty * TILE + FOOT_DY;
    this.placed = true;
    this.path.length = 0;
    this.pi = 0;
    this.mode = 'idle';
  }

  setPose(p: PetPose): void {
    if (this.pose !== p) {
      this.pose = p;
      this.animT = 0;
    }
  }

  depth(): number {
    return this.y;
  }

  /** Visual: o que o renderer precisa para pintar. */
  get look(): { dir: Dir; pose: PetPose } {
    return { dir: this.dir, pose: this.pose };
  }
}

/** O que o pet precisa saber de um personagem. */
export interface PetPerson {
  id: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  inside: boolean;
  alpha: number;
  gone: boolean;
  leaving: boolean;
  mode: string;
  info: { kind: string };
}

/** O que o gerenciador precisa do mundo (o Sim fornece). */
export interface PetHost {
  grid(): WalkGrid;
  finder(): PathFinder;
  /** Gente do andar: onde está (px e tile) e se conta (não escondida em elevador/cabine). O Character do Sim já serve. */
  people(): Iterable<PetPerson>;
  /** Um personagem pelo id (ou undefined). */
  person(id: string): PetPerson | undefined;
  /** Retângulos (em tiles) das salas montadas: lugares bons para ficar. */
  rooms(): { x: number; y: number; w: number; h: number }[];
  liveliness(): 'calm' | 'normal' | 'lively';
}

const NEAR = 2.6 * TILE;
const LOOK_EVERY_MS = 350;
const SLEEP_WAKE = 1.1 * TILE;

export class PetManager {
  readonly list: Pet[] = [];
  private gridVersion = -1;
  private nextLook = 0;

  constructor(
    private readonly host: PetHost,
    /** Andar do mundo que esta simulação cuida (1 ou 2). */
    private readonly floor: () => number,
  ) {}

  /** Alinha os pets existentes com a configuração: cria os que faltam, tira os que saíram, atualiza nome/espécie/tutor. */
  sync(cfg: PetsConfig | undefined): void {
    const want = petsOnFloor(cfg, this.floor()).slice(0, MAX_PETS);
    const ids = new Set(want.map((w) => w.id));
    for (let i = this.list.length - 1; i >= 0; i--) if (!ids.has(this.list[i].id)) this.list.splice(i, 1);
    for (const w of want) {
      const cur = this.list.find((p) => p.id === w.id);
      if (!cur) this.list.push(new Pet(w));
      else if (cur.setting.species !== w.species) {
        // outra espécie: recomeça o pet no mesmo id (mesmo lugar não faz sentido: o corpo mudou)
        this.list.splice(this.list.indexOf(cur), 1, new Pet(w));
      } else cur.setting = w;
    }
  }

  update(dt: number, now: number, gridVersion: number): void {
    if (!this.list.length) return;
    const grid = this.host.grid();
    if (gridVersion !== this.gridVersion) {
      this.gridVersion = gridVersion;
      for (const p of this.list) if (p.placed) this.revalidate(p, grid);
    }
    const doLook = now >= this.nextLook;
    if (doLook) this.nextLook = now + LOOK_EVERY_MS;
    const all = doLook ? [...this.host.people()] : [];
    const people = all.filter((c) => !c.gone && !c.inside && c.alpha > 0.5);
    for (const p of this.list) {
      if (doLook) this.resolveTutor(p, all);
      if (p.claim) this.checkClaim(p, now);
      if (!p.placed && !this.place(p, grid)) continue;
      p.animT += dt * 1000;
      if (p.emote && now >= p.emoteUntil) p.emote = null;
      if (doLook && !p.claim) {
        this.notice(p, people, now, grid);
        this.follow(p, now, grid);
      }
      this.run(p, dt, now, grid);
    }
  }

  // ------------------------------------------------------------------ tutor

  /** Tutor da configuração se ele está no andar; senão um agente do andar escolhido de forma estável (automático). */
  private resolveTutor(p: Pet, all: readonly PetPerson[]): void {
    const here = new Map<string, PetPerson>();
    for (const c of all) if (!c.gone && !c.leaving) here.set(c.id, c);
    const want = p.setting.tutor;
    if (want && here.has(want)) {
      p.tutorId = want;
      return;
    }
    if (p.tutorId && p.tutorId !== want && here.has(p.tutorId)) return; // o automático de antes continua valendo
    const mains = [...here.values()].filter((c) => c.info.kind !== 'sub');
    const pool = (mains.length ? mains : [...here.values()]).map((c) => c.id).sort();
    p.tutorId = pool.length ? pool[hash32(p.id) % pool.length] : null;
  }

  private tutorOf(p: Pet): PetPerson | null {
    const t = p.tutorId ? this.host.person(p.tutorId) : undefined;
    return t && !t.gone && !t.leaving && !t.inside ? t : null;
  }

  private distTiles(p: Pet, t: PetPerson): number {
    return Math.abs(p.tx - t.tx) + Math.abs(p.ty - t.ty);
  }

  /** Vai até um tile livre ao lado do tutor (caminho pela grade, sem atravessar nada). */
  private goToTutor(p: Pet, t: PetPerson, grid: WalkGrid): boolean {
    const spots: { x: number; y: number }[] = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && grid.get(t.tx + dx, t.ty + dy) === FREE) spots.push({ x: t.tx + dx, y: t.ty + dy });
    for (let k = 0; k < 4 && spots.length; k++) {
      const s = spots.splice(Math.floor(p.rng() * spots.length), 1)[0];
      if (s.x === p.tx && s.y === p.ty) return false;
      if (this.walkTo(p, s.x, s.y)) {
        p.toTutor = true;
        if (p.species.hops) {
          p.flying = true;
          p.speedMul = PET_SOCIAL.flightSpeed;
        }
        return true;
      }
    }
    return false;
  }

  /** Chegou perto do tutor: deita/dorme/senta aos pés dele por um tempo. */
  private settleByTutor(p: Pet, now: number): void {
    const t = this.tutorOf(p);
    if (t) p.dir = dirOf(t.x - p.x, t.y - p.y, p.dir);
    const stay = between(p.rng, PET_SOCIAL.stayMs);
    if (p.species.sleeps && p.rng() < PET_SOCIAL.sleepByTutorChance) p.setPose('sleep');
    else p.setPose(p.species.hops ? 'stand' : 'sit');
    if (p.pose === 'sit' && p.rng() < 0.4) {
      p.emote = 'heart';
      p.emoteUntil = now + 1400;
    }
    p.until = now + stay;
    p.stayUntil = p.until;
  }

  /** Quem esteve com o tutor há pouco o acompanha quando ele se muda para longe (de tempos em tempos). */
  private follow(p: Pet, now: number, grid: WalkGrid): void {
    if (p.mode !== 'idle' || p.pose === 'sleep' || now < p.followAfter || now > p.stayUntil + 20_000) return;
    const t = this.tutorOf(p);
    if (!t || this.distTiles(p, t) <= PET_SOCIAL.followTiles) return;
    p.followAfter = now + 5000 + p.rng() * 4000;
    if (p.rng() < 0.5) this.goToTutor(p, t, grid);
  }

  // ------------------------------------------------------------------ visitas de personagens

  /** Pets disponíveis para receber visita: parados, colocados, sem visita em curso e fora do descanso. */
  visitable(now: number): Pet[] {
    return this.list.filter((p) => p.placed && !p.claim && p.mode === 'idle' && now >= p.visitAfter);
  }

  /** Tiles livres ao redor do pet (onde o personagem pode parar), embaralhados. */
  approachTiles(p: Pet): { x: number; y: number }[] {
    const grid = this.host.grid();
    const out: { x: number; y: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && grid.get(p.tx + dx, p.ty + dy) === FREE) out.push({ x: p.tx + dx, y: p.ty + dy });
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(p.rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** O personagem `by` está a caminho: o pet fica onde está (até `ms`) à espera. */
  claim(p: Pet, by: string, now: number, ms: number): void {
    p.claim = { by, until: now + ms, kind: null };
    p.path.length = 0;
    p.pi = 0;
    p.mode = 'idle';
    p.toTutor = false;
    p.flying = false;
    p.speedMul = 1;
  }

  /** O personagem chegou: começa a visita (carinho, brincadeira, comida, cumprimento) por `ms`. */
  meet(p: Pet, by: string, kind: PetVisitKind, now: number, ms: number): void {
    if (p.claim?.by !== by) return;
    p.claim.kind = kind;
    p.claim.until = now + ms + 600;
    const who = this.host.person(by);
    if (who) p.dir = dirOf(who.x - p.x, who.y - p.y, p.dir);
    if (kind === 'carinho' || kind === 'comida') {
      p.setPose(p.species.hops ? 'stand' : 'sit');
      p.emote = 'heart';
      p.emoteUntil = now + ms;
    } else if (p.pose === 'sleep') p.setPose('stand');
  }

  /** Fim da visita (ou desistência): o pet volta à vida normal e descansa de visitas por um tempo. */
  release(p: Pet, by: string | null, now: number): void {
    if (!p.claim || (by && p.claim.by !== by)) return;
    p.claim = null;
    p.until = now + 1200 + p.rng() * 1500;
    p.reactAfter = now + 4000;
    p.visitAfter = now + between(p.rng, PET_SOCIAL.visitCooldownMs);
    p.lift = 0;
  }

  /** Visita que acabou por outro motivo: tempo esgotado, o personagem sumiu ou voltou ao trabalho. */
  private checkClaim(p: Pet, now: number): void {
    const c = p.claim;
    if (!c) return;
    const who = this.host.person(c.by);
    if (now >= c.until || !who || who.gone || who.mode !== 'idle') this.release(p, null, now);
  }

  /** Pet parado com alguém: animação curta da visita. */
  private hold(p: Pet): void {
    const k = p.claim?.kind;
    if (k === 'brincar') p.lift = Math.abs(Math.sin(p.animT / 140)) * 2.5;
  }

  // ------------------------------------------------------------------ colocação

  private freeTiles(grid: WalkGrid): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const r of this.host.rooms()) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (grid.get(x, y) === FREE) out.push({ x, y });
    return out;
  }

  private place(p: Pet, grid: WalkGrid): boolean {
    const tiles = this.freeTiles(grid);
    const t = tiles.length ? tiles[Math.floor(p.rng() * tiles.length)] : null;
    if (!t) return false; // ainda sem sala montada: tenta no próximo quadro
    p.placeAtTile(t.x, t.y);
    p.until = 0;
    return true;
  }

  /** O prédio mudou (sala montada, desmontada, reformada): quem ficou em tile bloqueado vai para o mais perto. */
  private revalidate(p: Pet, grid: WalkGrid): void {
    p.path.length = 0;
    p.pi = 0;
    p.toTutor = false;
    p.flying = false;
    if (p.mode === 'walk') p.mode = 'idle';
    if (grid.walkable(p.tx, p.ty)) return;
    const n = grid.nearestWalkable(p.tx, p.ty, 10);
    if (n) p.placeAtTile(n.x, n.y);
    else p.placed = false;
  }

  // ------------------------------------------------------------------ reação a quem passa

  private notice(p: Pet, people: { x: number; y: number }[], now: number, grid: WalkGrid): void {
    if (now < p.reactAfter) return;
    let best: { x: number; y: number } | null = null;
    let bd = NEAR;
    for (const c of people) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) return;
    const sp = p.species;
    if (p.pose === 'sleep' && bd > SLEEP_WAKE) return; // soneca leve: só acorda com alguém bem perto
    p.reactAfter = now + 7000 + p.rng() * 6000;
    p.toTutor = false;
    p.flying = false;
    if (sp.reaction === 'startle') {
      // foge para longe
      p.emote = 'alert';
      p.emoteUntil = now + 900;
      this.goAway(p, best, grid);
      p.speedMul = 2.2;
      return;
    }
    p.path.length = 0;
    p.mode = 'idle';
    p.dir = dirOf(best.x - p.x, best.y - p.y, p.dir);
    p.setPose(sp.reaction === 'purr' ? 'sit' : 'stand');
    p.emote = 'heart';
    p.emoteUntil = now + 1600;
    p.until = now + 1800 + p.rng() * 1500;
    p.speedMul = 1;
  }

  private goAway(p: Pet, from: { x: number; y: number }, grid: WalkGrid): void {
    const ax = Math.sign(p.x - from.x) || 1;
    const ay = Math.sign(p.y - from.y) || 1;
    for (let k = 0; k < 6; k++) {
      const tx = p.tx + ax * (3 + Math.floor(p.rng() * 4));
      const ty = p.ty + (k % 2 ? ay : 0) * Math.floor(p.rng() * 3);
      if (grid.get(tx, ty) === FREE && this.walkTo(p, tx, ty)) return;
    }
  }

  // ------------------------------------------------------------------ andar

  private walkTo(p: Pet, gx: number, gy: number): boolean {
    const out: number[] = [];
    if (!this.host.finder().find(p.tx, p.ty, gx, gy, out) || !out.length) return false;
    p.path = out;
    p.pi = 0;
    p.mode = 'walk';
    return true;
  }

  private run(p: Pet, dt: number, now: number, grid: WalkGrid): void {
    p.lift = 0;
    if (p.claim) return this.hold(p);
    if (p.mode === 'walk') return this.walk(p, dt, now);
    if (!p.until) p.until = now + 800 + p.rng() * 3000; // primeira pausa depois de aparecer
    if (now < p.until) {
      if (p.pose === 'stand' && p.species.hops && p.rng() < dt * 0.4) p.lift = 2; // passarinho ciscando
      return;
    }
    this.decide(p, now, grid);
  }

  private decide(p: Pet, now: number, grid: WalkGrid): void {
    const live = this.host.liveliness();
    const wander = live === 'lively' ? 0.7 : live === 'calm' ? 0.3 : 0.5;
    p.speedMul = 1;
    p.flying = false;
    p.toTutor = false;
    p.emote = null;
    // com frequência: vai até o tutor e fica por perto (ou já está perto e fica mais um tempo)
    const tutor = this.tutorOf(p);
    if (tutor && now >= p.nextTutorAt && p.rng() < PET_SOCIAL.toTutorChance) {
      p.nextTutorAt = now + between(p.rng, PET_SOCIAL.toTutorEveryMs);
      if (this.distTiles(p, tutor) <= 3) {
        this.settleByTutor(p, now);
        p.mode = 'idle';
        return;
      }
      if (this.goToTutor(p, tutor, grid)) return;
    }
    const roll = p.rng();
    if (p.pose === 'sleep' && p.species.sleeps && roll < 0.35) {
      p.until = now + 6000 + p.rng() * 10_000; // continua dormindo
      return;
    }
    if (roll < wander) {
      for (let k = 0; k < 8; k++) {
        const gx = p.tx + Math.round((p.rng() * 2 - 1) * 7);
        const gy = p.ty + Math.round((p.rng() * 2 - 1) * 5);
        if (grid.get(gx, gy) === FREE && (gx !== p.tx || gy !== p.ty) && this.walkTo(p, gx, gy)) return;
      }
    }
    const rest = p.rng();
    if (p.species.sleeps && rest < (live === 'calm' ? 0.45 : 0.3)) {
      p.setPose('sleep');
      p.until = now + 14_000 + p.rng() * 26_000;
    } else if (rest < 0.7) {
      p.setPose('sit');
      p.until = now + 4000 + p.rng() * 6000;
    } else {
      p.setPose('stand');
      p.until = now + 2500 + p.rng() * 4000;
    }
    p.mode = 'idle';
    if (p.rng() < 0.5) p.dir = (['left', 'right', 'down'] as const)[Math.floor(p.rng() * 3)];
  }

  private walk(p: Pet, dt: number, now: number): void {
    let budget = p.species.speed * TILE * p.speedMul * dt;
    while (budget > 0.0001 && p.pi < p.path.length) {
      const nx = p.path[p.pi];
      const ny = p.path[p.pi + 1];
      const gx = nx * TILE + FOOT_DX;
      const gy = ny * TILE + FOOT_DY;
      const dx = gx - p.x;
      const dy = gy - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) p.dir = dirOf(dx, dy, p.dir);
      if (d <= budget) {
        p.x = gx;
        p.y = gy;
        p.tx = nx;
        p.ty = ny;
        budget -= d;
        p.pi += 2;
      } else {
        p.x += (dx / d) * budget;
        p.y += (dy / d) * budget;
        budget = 0;
      }
    }
    p.setPose('walk');
    if (p.flying) p.lift = PET_SOCIAL.flightLift + Math.sin(p.animT / 130) * 1.5;
    else if (p.species.hops) p.lift = Math.abs(Math.sin(p.animT / 110)) * 3;
    if (p.pi >= p.path.length) {
      const toTutor = p.toTutor;
      p.path.length = 0;
      p.pi = 0;
      p.mode = 'idle';
      p.speedMul = 1;
      p.flying = false;
      p.toTutor = false;
      p.setPose('stand');
      p.until = now + 1500 + p.rng() * 3500;
      if (toTutor) this.settleByTutor(p, now);
    }
  }
}
