// Mundo do escritório: liga a simulação (sim/), o desenho (render/), a câmera e a entrada,
// e implementa o contrato WorldApi consumido pela UI.
import * as artModule from '../art';
import { TILE, type ArtModule } from '../art/api';
import type { OfficeStore } from '../net/store';
import { getFloor, onFloor, setFloor } from '../floor';
import { DEFAULT_WORLD_OPTIONS, seasonalThemeFor, type PlayerWorld, type Selection, type SocialEvent, type SoundCue, type WorldApi, type WorldOptions, type WorldPlayback } from './api';
import { loadWorldAssets, type WorldAssets } from './assets';
import { createBuildingView, onToggleBuilding } from './building-view';
import { Camera, overviewFrame } from './camera';
import { createDebug, type WorldDebug } from './debug';
import { BUILDING_H, COL_W } from './constants';
import { RECEPTION_ID } from './layout/core';
import { inRect } from './layout/geometry';
import { attachInput, modalOpen, type Hit } from './input';
import { intentFrom, moveKeyOf } from './city/input';
import { alvoDoJogador, posicaoDoAlvo, type Alvo } from './player';
import type { AgentInfo } from '../../../shared/types';
import { rebaseSnapshot } from './playback';
import { Overlay } from './render/overlay';
import { Renderer } from './render/renderer';
import { Sim, type VisitLight } from './sim/sim';
import { NO_INTENT, VISITOR_ID, visitorInfo, type VisitorIntent } from './sim/visitor';
import { SoundCues } from './sound-cues';

export * from './api';
export type { Alvo } from './player';
export type { WorldDebug } from './debug';

const art: ArtModule = artModule;

/** O que a cena Visita usa do mundo dela (createWorld com `visit: true`). */
export interface VisitWorld {
  /** O meu personagem entra pelo elevador (null tira). */
  setVisitor(me: { name: string; look: 'f' | 'm'; parts?: AgentInfo['parts'] } | null): void;
  /** O teclado: para onde o visitante anda. */
  setIntent(intent: VisitorIntent): void;
  /** Luzes do prédio (apagado, discreto, ao vivo). */
  setLight(mode: VisitLight): void;
  /** Perto de um elevador, livre para sair? */
  atExit(): boolean;
  /** Anda até o elevador mais perto, entra e some; `done` quando a porta fecha. */
  exit(done: () => void): boolean;
  /** Posição do visitante na tela (px CSS), para a dica "Sair (E)"; null fora da tela ou sem visitante. */
  visitorScreen(): { x: number; y: number } | null;
  /** O quadro da parede da recepção na tela (px CSS): o lugar do quadro de carimbos da portaria; null fora da tela. */
  boardScreen(): { x: number; y: number; w: number; h: number } | null;
}

export interface CreateWorldOptions {
  /**
   * Visita a um prédio do mundo (cena Visita): `Sim` sem nada que dependa do tempo do status (SimMode.visit), o
   * visitante andando com o teclado e o clique (a câmera o segue) e as carteiras da vida social na chave `world:`.
   */
  visit?: boolean;
}

export function createWorld(canvas: HTMLCanvasElement, store: OfficeStore, o: CreateWorldOptions = {}): WorldApi & { debug: WorldDebug; visit: VisitWorld; player?: PlayerWorld } {
  let options: WorldOptions = { ...DEFAULT_WORLD_OPTIONS };
  const visitMode = !!o.visit;
  const camera = new Camera();
  // Simulação e desenho são recriados quando o timelapse entra, pula ou sai (rebuild).
  let sim!: Sim;
  let renderer!: Renderer;
  let overlay!: Overlay;
  let assets: WorldAssets | null = null;
  /** Timelapse ligado: relógio próprio do mundo (`worldNow`), acelerado pelo fator de animação. */
  let playback: WorldPlayback | null = null;
  let worldNow = 0;
  const selectCbs = new Set<(s: Selection) => void>();
  const hoverCbs = new Set<(id: string | null) => void>();
  const socialCbs = new Set<(e: SocialEvent) => void>();
  const soundCbs = new Set<(c: SoundCue) => void>();
  const roomMenuCbs = new Set<(roomId: string, at: { x: number; y: number }) => void>();
  let cues!: SoundCues;
  // Uma simulação por andar, todas rodando: trocar de andar só troca qual é desenhada (os agentes do outro andar seguem
  // onde estão, sem sair nem entrar). Na visita há um só, sem fixar o andar.
  interface Layer {
    floor: number;
    sim: Sim;
    renderer: Renderer;
    overlay: Overlay;
    cues: SoundCues;
  }
  const makeLayer = (floor: number): Layer => {
    // só a simulação do andar 1 guarda as carteiras no navegador (as duas gravariam na mesma chave)
    const s = new Sim(art, () => options, playback || (!visitMode && floor !== 1) ? null : undefined, visitMode ? { visit: true } : { floor });
    const r = new Renderer(canvas, art, s, camera);
    if (assets) r.setAssets(assets);
    if (playback) {
      const p = playback;
      r.clock = () => p.clock();
    }
    return { floor, sim: s, renderer: r, overlay: new Overlay(r.ctx, s, r, camera), cues: new SoundCues(s, camera) };
  };
  const layers = new Map<number, Layer>();

  // ---------------------------------------------------------------- boneco do jogador (fora da visita)
  // O meu boneco é o visitante da cena Visita (Sim.setVisitor) vivendo na simulação de UM andar. Cada página tem o seu
  // (não é compartilhado), ele nasce no elevador do andar 1 e a posição não é guardada entre sessões.
  let playerMe: { name: string; look: 'f' | 'm'; parts?: AgentInfo['parts'] } | null = null;
  let playerFloor = 1;
  let playerIntent: VisitorIntent = { ...NO_INTENT };
  /** Andar de destino pedido pelo elevador; a troca roda no início do próximo quadro, fora do passo da simulação. */
  let pendingPlayerFloor: number | null = null;
  const playerSim = (): Sim | undefined => layers.get(playerFloor)?.sim;
  /** Põe o boneco no elevador do andar (null = tira de todos os andares). */
  const placePlayer = (floor: number | null) => {
    const now = Date.now();
    for (const l of layers.values()) if (l.sim.visitor) l.sim.setVisitor(null, now);
    if (floor === null || !playerMe) return;
    playerFloor = layers.has(floor) ? floor : 1;
    const s = playerSim();
    if (!s) return;
    s.setVisitor(visitorInfo(playerMe, now), now);
    s.visitorIntent = { ...playerIntent };
  };
  let activeFloor = visitMode ? 1 : getFloor();
  /** Andares que o snapshot pede: um por sala do Escritório, mais sempre o 1 e o 2 (terminais). Visita: só o 1. */
  const wantedFloors = (): Set<number> => {
    const out = new Set<number>(visitMode ? [1] : [1, 2]);
    if (!visitMode) for (const r of store.snapshot?.rooms ?? []) out.add(r.floor ?? 1);
    return out;
  };
  const buildLayers = () => {
    layers.clear();
    for (const f of wantedFloors()) layers.set(f, makeLayer(f));
  };
  /** Acompanha as salas: andar novo ganha simulação (monta já pronto), andar sem sala some. */
  const syncLayers = () => {
    const want = wantedFloors();
    for (const f of want) if (!layers.has(f)) layers.set(f, makeLayer(f));
    for (const f of [...layers.keys()]) if (!want.has(f)) layers.delete(f);
    if (!layers.has(activeFloor)) setFloor(1);
    // o andar do boneco sumiu: ele volta ao elevador do andar 1
    if (playerMe && !playback && !playerSim()?.visitor && pendingPlayerFloor === null) placePlayer(1);
  };
  const useLayer = (floor: number) => {
    const l = layers.get(floor) ?? layers.get(1)!;
    activeFloor = l.floor;
    sim = l.sim;
    renderer = l.renderer;
    overlay = l.overlay;
    cues = l.cues;
  };
  buildLayers();
  useLayer(activeFloor);
  let selection: Selection = null;
  let hover: string | null = null;
  let mouse: { x: number; y: number } | null = null;
  let raf = 0;
  let lastTs = 0;
  let hiddenAt = 0;
  /** Escritório fora da tela (cidade aberta): sem laço de desenho nem teclado da câmera. */
  let suspended = false;
  let suspendedAt = 0;
  let userMoved = false;
  let framed = false;
  let lastCols = -1;
  /** Sala enquadrada pela última vez (a fachada começa nela) e sala a enquadrar quando a troca de andar terminar de montar. */
  let viewRoom: string | null = null;
  let pendingRoom: { id: string; until: number } | null = null;
  const abort = new AbortController();

  // Prédio por fora: o botão "Andar" abre a fachada; na chegada ao andar, o mundo troca de andar e enquadra a sala.
  const building = visitMode
    ? null
    : createBuildingView(canvas, {
        data: () => (store.snapshot ? { rooms: store.snapshot.rooms, agents: store.snapshot.agents } : null),
        where: () => ({ worldFloor: getFloor(), roomId: viewRoom }),
        arrive: (t) => {
          setFloor(t.world);
          if (t.roomId) pendingRoom = { id: t.roomId, until: Date.now() + 6000 };
          else {
            pendingRoom = null;
            userMoved = false;
            overview(false);
          }
        },
      });
  const offBuilding = building ? onToggleBuilding(() => !suspended && building.toggle()) : () => {};

  // ------------------------------------------------------------------ tamanho/DPR

  const resize = () => {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const pw = Math.floor(w * dpr);
    const ph = Math.floor(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    camera.setView(w, h, dpr);
    updateBounds();
  };

  const buildingRect = () => ({ x: 0, y: 0, w: sim.building.cols * COL_W * TILE, h: BUILDING_H * TILE });

  const updateBounds = () => {
    const b = buildingRect();
    camera.bounds = { x: b.x - 7 * TILE, y: b.y - 6 * TILE, w: b.w + 14 * TILE, h: b.h + 18 * TILE };
    const fit = camera.fitZoom(b, 16);
    camera.minZoom = Math.min(1, Math.max(0.25, fit));
    camera.clamp();
  };

  const overviewTarget = () => {
    const f = overviewFrame(buildingRect(), camera.viewW, camera.viewH, camera.insets);
    const fit = Math.max(camera.minZoom, f.zoom);
    const snapped = camera.snapZoom(fit, 'down');
    const zoom = snapped >= fit * 0.82 ? snapped : fit;
    const z = Math.min(zoom, 4);
    const c = camera.centerFor(f.cx, f.cy, z);
    // as margens de tela (pílulas acima, meio-fio abaixo) não são simétricas
    return { x: c.x, y: c.y - f.dy / z, zoom: z };
  };

  const overview = (animate = true) => {
    camera.follow = null;
    viewRoom = null;
    const o = overviewTarget();
    if (animate) camera.animateTo(o.x, o.y, o.zoom, Date.now(), 420);
    else {
      camera.stop();
      camera.x = o.x;
      camera.y = o.y;
      camera.zoom = o.zoom;
      camera.clamp();
    }
  };

  // ------------------------------------------------------------------ seleção e foco

  const emitSelect = () => selectCbs.forEach((cb) => cb(selection));

  const sameSelection = (a: Selection, b: Selection) => a === b || (!!a && !!b && a.type === b.type && a.id === b.id);

  const setSelection = (sel: Selection, focus = false) => {
    const same = sameSelection(sel, selection);
    selection = sel;
    // com "seguir selecionado" ligado, a câmera acompanha o agente escolhido (ou para de seguir)
    if (options.followSelected) camera.follow = sel?.type === 'agent' ? sel.id : null;
    if (focus && sel) {
      if (sel.type === 'agent') focusAgent(sel.id, { follow: options.followSelected });
      else focusRoom(sel.id);
    }
    if (!same) emitSelect();
  };

  const focusAgent = (id: string, opts: { follow?: boolean } = {}) => {
    const ch = sim.person(id);
    if (!ch) return;
    userMoved = true;
    const zoom = Math.max(camera.zoom, camera.snapZoom(3));
    const c = camera.centerFor(ch.x, ch.y - 12, zoom);
    camera.animateTo(c.x, c.y, zoom, Date.now(), 420);
    camera.follow = opts.follow ? id : null;
  };

  const focusRoom = (id: string) => {
    const room = sim.rooms.get(id);
    if (!room) return;
    userMoved = true;
    viewRoom = id;
    camera.follow = null;
    const r = room.layout.rect;
    const rect = { x: r.x * TILE, y: r.y * TILE - 8, w: r.w * TILE, h: r.h * TILE + 16 };
    const fit = camera.fitZoom(rect, 40);
    const zoom = Math.min(4, Math.max(camera.minZoom, camera.snapZoom(fit, 'down')));
    const c = camera.centerFor(rect.x + rect.w / 2, rect.y + rect.h / 2, zoom);
    camera.animateTo(c.x, c.y, zoom, Date.now(), 420);
  };

  const zoomStep = (steps: number, sx = camera.viewW / 2, sy = camera.viewH / 2) => {
    userMoved = true;
    camera.zoomAt(camera.stepZoom(steps), sx, sy, Date.now(), true);
  };

  // ------------------------------------------------------------------ hit-test

  const pick = (sx: number, sy: number): Hit => {
    const w = camera.screenToWorld(sx, sy);
    let best: string | null = null;
    let bestDepth = -Infinity;
    const slack = Math.max(1, 3 / camera.zoom);
    for (const [id, h] of renderer.heads) {
      if (!h.visible || id === VISITOR_ID) continue;
      if (w.x < h.bx - slack || w.x > h.bx + h.bw + slack || w.y < h.by - slack || w.y > h.by + h.bh + slack) continue;
      if (h.depth > bestDepth) {
        bestDepth = h.depth;
        best = id;
      }
    }
    if (best) return { type: 'agent', id: best };
    const tx = Math.floor(w.x / TILE);
    const ty = Math.floor(w.y / TILE);
    for (const room of sim.rooms.values()) if (room.present && !room.ghost && inRect(room.layout.rect, tx, ty)) return { type: 'room', id: room.id };
    return null;
  };

  const setHover = (id: string | null) => {
    if (id === hover) return;
    hover = id;
    canvas.style.cursor = id ? 'pointer' : 'grab';
    hoverCbs.forEach((cb) => cb(id));
  };

  /** Visita: um toque no chão leva o visitante até lá (num agente, abre o cartão dele). */
  const visitClick = (hit: Hit, at: { x: number; y: number }) => {
    if (hit?.type === 'agent') return setSelection(hit);
    setSelection(null);
    const w = camera.screenToWorld(at.x, at.y);
    if (sim.visitorWalkTo(Math.floor(w.x / TILE), Math.floor(w.y / TILE))) followVisitor();
  };
  const followVisitor = () => {
    if (!sim.visitor) return;
    userMoved = true;
    camera.follow = VISITOR_ID;
  };

  const detachInput = attachInput(canvas, camera, {
    pick,
    click: (hit, at) => (visitMode ? visitClick(hit, at) : setSelection(hit)),
    doubleClick: (hit) => {
      if (hit?.type === 'agent') {
        setSelection(hit);
        focusAgent(hit.id, { follow: true });
      } else if (hit?.type === 'room') focusRoom(hit.id);
    },
    hover: (sx, sy, inside) => {
      mouse = inside ? { x: sx, y: sy } : null;
      if (!inside) setHover(null);
    },
    interact: () => {
      userMoved = true;
      camera.follow = null;
      camera.stop();
    },
    overview: () => overview(true),
    zoomStep,
    active: () => !suspended,
    keys: () => !visitMode,
    moveKeys: () => !!playerMe,
  });

  // ------------------------------------------------------------------ dados

  const onSnapshot = () => {
    const snap = store.snapshot;
    if (!snap) return;
    try {
      // No timelapse, os horários do snapshot vão para o relógio do mundo (world/playback.ts).
      const input = playback ? rebaseSnapshot(snap, worldNow - snap.serverTime) : snap;
      syncLayers();
      for (const l of layers.values()) l.sim.applySnapshot(input, playback ? worldNow : Date.now());
    } catch (err) {
      console.error('[mundo] snapshot inválido ignorado', err);
    }
  };
  const offSnapshot = store.on('snapshot', onSnapshot);
  /** Troca de andar: só muda qual simulação é desenhada e a câmera reenquadra. Nenhum agente é tocado. */
  const showFloor = () => {
    const floor = visitMode ? 1 : getFloor();
    if (floor === activeFloor || !layers.has(floor)) return;
    useLayer(floor);
    debug = createDebug(sim, renderer, camera, markMoved);
    camera.follow = null;
    lastCols = -1;
    userMoved = false;
    setHover(null);
  };
  const offFloor = onFloor(showFloor);
  if (store.snapshot) onSnapshot();

  void loadWorldAssets(abort.signal).then((a) => {
    if (!a) return;
    assets = a;
    renderer.setAssets(a);
  });

  // medições de texto em cache: refaz quando alguma fonte termina de carregar
  if (document.fonts) document.fonts.addEventListener?.('loadingdone', () => overlay.resetCaches(), { signal: abort.signal });

  // ------------------------------------------------------------------ laço

  const loop = (ts: number) => {
    raf = requestAnimationFrame(loop);
    const real = Date.now();
    const realDt = lastTs ? Math.min(0.1, Math.max(0, (ts - lastTs) / 1000)) : 1 / 60;
    lastTs = ts;
    // Timelapse: simulação e desenho no relógio do mundo (acelerado ou parado); a câmera segue no tempo real.
    const k = playback ? Math.max(0, playback.scale()) : 1;
    const dt = realDt * k;
    if (playback) worldNow += dt * 1000;
    const now = playback ? worldNow : real;
    try {
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      if (canvas.clientWidth !== camera.viewW || canvas.clientHeight !== camera.viewH || dpr !== camera.dpr) resize();
      if (pendingPlayerFloor !== null) {
        const f = pendingPlayerFloor;
        pendingPlayerFloor = null;
        if (playerMe && !playback && layers.has(f)) {
          placePlayer(f);
          setFloor(f);
          followVisitor();
        }
      }
      sim.update(dt, now);
      for (const l of layers.values()) {
        if (l.sim === sim) continue;
        l.sim.update(dt, now);
        l.sim.social.events.length = 0;
      }
      // partidas e apostas resolvidas: para o feed (as do timelapse são encenação do passado: ficam fora)
      const events = sim.social.events;
      if (events.length) {
        if (!playback) for (const e of events) for (const cb of socialCbs) cb(e);
        events.length = 0;
      }
      renderer.sync(seasonalThemeFor(options.theme, new Date()));
      if (pendingRoom) {
        if (sim.rooms.get(pendingRoom.id)?.present) {
          const id = pendingRoom.id;
          pendingRoom = null;
          focusRoom(id);
        } else if (Date.now() > pendingRoom.until) pendingRoom = null;
      }
      if (sim.building.cols !== lastCols) {
        lastCols = sim.building.cols;
        updateBounds();
        if (!framed && sim.initialized) {
          overview(false);
          framed = true;
        } else if (!userMoved) overview(true);
      }
      // visita (e jogador): andando pelo teclado, a câmera vai junto
      if ((visitMode || playerMe) && sim.visitor && (sim.visitorIntent.dx || sim.visitorIntent.dy) && camera.follow !== VISITOR_ID) followVisitor();
      const followCh = camera.follow ? sim.person(camera.follow) : undefined;
      if (camera.follow && !followCh) camera.follow = null;
      camera.update(real, followCh ? camera.centerFor(followCh.x, followCh.y - 12, camera.zoom) : null, realDt);
      renderer.frame(now, dt, options, { agent: selection?.type === 'agent' ? selection.id : null, room: selection?.type === 'room' ? selection.id : null, hover });
      overlay.draw(now, options, { agent: selection?.type === 'agent' ? selection.id : null, room: selection?.type === 'room' ? selection.id : null, hover });
      renderer.pruneHeads();
      // No timelapse o mundo fica mudo: o teclado e o elevador em alta velocidade só fariam barulho.
      if (soundCbs.size && !playback) cues.update(now, (c) => soundCbs.forEach((cb) => cb(c)));
      if (mouse) {
        const hit = pick(mouse.x, mouse.y);
        setHover(hit?.type === 'agent' ? hit.id : null);
      }
      // seleção de quem já foi embora
      if (selection?.type === 'agent' && !sim.chars.has(selection.id)) setSelection(null);
      if (selection?.type === 'room' && !sim.rooms.has(selection.id)) setSelection(null);
    } catch (err) {
      console.error('[mundo] erro no frame', err);
    }
  };

  const onVisibility = () => {
    if (suspended) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    lastTs = 0;
    if (hiddenAt && Date.now() - hiddenAt > 5000) for (const l of layers.values()) l.sim.fastForward(playback ? worldNow : Date.now());
    hiddenAt = 0;
  };

  // Botão direito numa sala (ou num agente dentro dela): a UI oferece renomear a sala.
  const onContextMenu = (e: MouseEvent) => {
    if (!roomMenuCbs.size) return;
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const hit = pick(sx, sy);
    const w = camera.screenToWorld(sx, sy);
    const roomId =
      hit?.type === 'room'
        ? hit.id
        : hit?.type === 'agent'
          ? (sim.chars.get(hit.id)?.roomId ?? null)
          : ([...sim.rooms.values()].find((room) => room.present && !room.ghost && inRect(room.layout.rect, Math.floor(w.x / TILE), Math.floor(w.y / TILE)))?.id ?? null);
    if (!roomId || !sim.rooms.has(roomId)) return;
    e.preventDefault();
    roomMenuCbs.forEach((cb) => cb(roomId, { x: e.clientX, y: e.clientY }));
  };
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  raf = requestAnimationFrame(loop);

  // ------------------------------------------------------------------ depuração

  const markMoved = () => (userMoved = true);
  let debug = createDebug(sim, renderer, camera, markMoved);

  // ------------------------------------------------------------------ timelapse

  /**
   * Recomeça simulação e desenho do zero (o próximo snapshot é a carga inicial: todos já no lugar).
   * No timelapse as carteiras ficam só em memória, sem tocar nas moedinhas guardadas no navegador.
   */
  const rebuild = () => {
    // As carteiras ao vivo gravam a cada 5 s: não perde o que mudou desde a última vez (no replay, não grava nada).
    sim.social.wallets.save(Date.now());
    buildLayers();
    useLayer(activeFloor);
    // o timelapse é replay do passado: sem o meu boneco; ao voltar ao vivo ele nasce de novo no elevador do andar mostrado
    pendingPlayerFloor = null;
    if (playerMe) placePlayer(playback ? null : activeFloor);
    debug = createDebug(sim, renderer, camera, markMoved);
    lastCols = -1;
    setHover(null);
  };

  // ------------------------------------------------------------------ teclado do jogador

  const playerKeys = new Set<string>();
  let playerShift = false;
  const pushPlayerIntent = () => {
    // Só anda com o andar do boneco na tela (o seletor de andar da UI pode mostrar outro: o boneco invisível não se move).
    playerIntent = playerMe && !playback && !suspended && playerFloor === activeFloor ? intentFrom(playerKeys, playerShift) : { ...NO_INTENT };
    const s = playerSim();
    if (s) s.visitorIntent = { ...playerIntent };
  };
  const clearPlayerKeys = () => {
    playerKeys.clear();
    playerShift = false;
    pushPlayerIntent();
  };
  /** O foco está num campo de texto, rádio ou menu: as setas e o WASD são dele, não do boneco. */
  const focusTakesKeys = (t: HTMLElement | null) =>
    !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? '') || !!t.closest?.('[role="radio"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"]'));
  const onPlayerKey = (e: KeyboardEvent, down: boolean) => {
    if (!playerMe) return;
    if (e.key === 'Shift') playerShift = down;
    else if (typeof e.getModifierState === 'function') playerShift = e.getModifierState('Shift');
    const k = moveKeyOf(e);
    if (!down) {
      if (k) playerKeys.delete(k);
      pushPlayerIntent();
      return;
    }
    const t = e.target as HTMLElement | null;
    if (!k || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || suspended || playback || focusTakesKeys(t) || modalOpen(t)) return;
    e.preventDefault();
    playerKeys.add(k);
    pushPlayerIntent();
  };
  if (!visitMode) {
    window.addEventListener('keydown', (e) => onPlayerKey(e, true), { signal: abort.signal });
    window.addEventListener('keyup', (e) => onPlayerKey(e, false), { signal: abort.signal });
    window.addEventListener('blur', clearPlayerKeys, { signal: abort.signal });
  }

  /** Posição na tela (CSS px) de um ponto do mundo, ou null fora da tela. */
  const onScreen = (x: number, y: number) => {
    const p = camera.worldToScreen(x, y);
    return p.x < 0 || p.y < 0 || p.x > camera.viewW || p.y > camera.viewH ? null : p;
  };

  const player: PlayerWorld = {
    // O boneco nasce no elevador do andar que está na tela; não troca de andar nem sobrescreve `ev2.floor`.
    ligar: (me) => {
      playerMe = { name: me.name, look: me.look, ...(me.parts ? { parts: me.parts } : {}) };
      playerKeys.clear();
      playerShift = false;
      pendingPlayerFloor = null;
      playerIntent = { ...NO_INTENT };
      placePlayer(playback ? null : activeFloor);
      if (!playback && !suspended && !userMoved) followVisitor();
    },
    desligar: () => {
      playerMe = null;
      pendingPlayerFloor = null;
      playerKeys.clear();
      playerShift = false;
      playerIntent = { ...NO_INTENT };
      placePlayer(null);
      if (camera.follow === VISITOR_ID) camera.follow = null;
    },
    setIntent: (i) => {
      playerIntent = playerMe && !playback ? { ...i } : { ...NO_INTENT };
      const s = playerSim();
      if (s) s.visitorIntent = { ...playerIntent };
    },
    alvo: () => {
      const s = playerSim();
      return s && !playback ? alvoDoJogador(s) : null;
    },
    alvoNaTela: () => {
      const s = playerSim();
      if (!s || s !== sim || playback) return null;
      const a = alvoDoJogador(s);
      const pos = a && posicaoDoAlvo(s, a);
      if (!a || !pos) return null;
      // agente: logo acima da cabeça; elevador: acima da porta
      return a.tipo === 'agente' ? onScreen(pos.x, pos.y - 2) : onScreen(pos.x, pos.y - TILE * 1.6);
    },
    irParaAndar: (andar) => {
      const s = playerSim();
      if (!playerMe || playback || !s || !Number.isInteger(andar) || andar === playerFloor || !layers.has(andar)) return false;
      // só do elevador: perto de um e livre (o passo do boneco até a porta e a porta fechando são da simulação)
      if (!s.visitorElevator()) return false;
      if (!s.visitorExit(() => (pendingPlayerFloor = andar))) return false;
      clearPlayerKeys();
      return true;
    },
  };

  return {
    ...(visitMode ? {} : { player }),
    select: (sel, opts) => setSelection(sel, !!opts?.focus),
    getSelection: () => selection,
    onSelect: (cb) => {
      selectCbs.add(cb);
      return () => void selectCbs.delete(cb);
    },
    onHover: (cb) => {
      hoverCbs.add(cb);
      return () => void hoverCbs.delete(cb);
    },
    focusAgent,
    focusRoom,
    overview: () => {
      userMoved = false;
      overview(true);
    },
    zoomBy: (factor) => {
      if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
      const target = camera.snapZoom(camera.zoom * factor, factor > 1 ? 'up' : 'down');
      if (Math.abs(target - camera.zoom) < 1e-3) zoomStep(factor > 1 ? 1 : -1);
      else {
        userMoved = true;
        camera.zoomAt(target, camera.viewW / 2, camera.viewH / 2, Date.now(), true);
      }
    },
    getOptions: () => ({ ...options }),
    setOptions: (o) => {
      options = { ...options, ...o };
      if (o.followSelected !== undefined) camera.follow = o.followSelected && selection?.type === 'agent' ? selection.id : null;
    },
    setViewInsets: (ins) => {
      const v = (n: number | undefined, cur: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : cur);
      const cur = camera.insets;
      camera.insets = { top: v(ins.top, cur.top), right: v(ins.right, cur.right), bottom: v(ins.bottom, cur.bottom), left: v(ins.left, cur.left) };
      updateBounds();
      if (!userMoved && framed) overview(true);
    },
    screenPositionOf: (id) => {
      const h = renderer.heads.get(id);
      if (!h || !h.visible) return null;
      const p = camera.worldToScreen(h.x, h.y - 2);
      if (p.x < 0 || p.y < 0 || p.x > camera.viewW || p.y > camera.viewH) return null;
      return p;
    },
    social: (id) => sim.social.info(id),
    onRoomContextMenu: (cb) => {
      roomMenuCbs.add(cb);
      return () => void roomMenuCbs.delete(cb);
    },
    onSocialEvent: (cb) => {
      socialCbs.add(cb);
      return () => void socialCbs.delete(cb);
    },
    setPlayback: (p) => {
      playback = p;
      worldNow = p ? p.clock() : 0;
      rebuild();
      clearPlayerKeys();
    },
    onSound: (cb) => {
      soundCbs.add(cb);
      return () => void soundCbs.delete(cb);
    },
    setSuspended: (on) => {
      if (on === suspended) return;
      suspended = on;
      clearPlayerKeys();
      if (on) {
        cancelAnimationFrame(raf);
        suspendedAt = Date.now();
        setHover(null);
        mouse = null;
        return;
      }
      lastTs = 0;
      if (suspendedAt && Date.now() - suspendedAt > 5000) for (const l of layers.values()) l.sim.fastForward(playback ? worldNow : Date.now());
      suspendedAt = 0;
      hiddenAt = 0;
      raf = requestAnimationFrame(loop);
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      abort.abort();
      offSnapshot();
      offFloor();
      offBuilding();
      building?.destroy();
      detachInput();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('visibilitychange', onVisibility);
      selectCbs.clear();
      hoverCbs.clear();
      socialCbs.clear();
      soundCbs.clear();
    },
    get debug() {
      return debug;
    },
    visit: {
      setVisitor: (me) => {
        if (!visitMode) return;
        sim.setVisitor(me ? visitorInfo(me, Date.now()) : null, Date.now());
      },
      setIntent: (intent) => {
        sim.visitorIntent = visitMode ? { ...intent } : { ...NO_INTENT };
      },
      setLight: (mode) => {
        if (!visitMode || sim.visitLight === mode) return;
        sim.visitLight = mode;
        sim.applyVisitLight(Date.now());
      },
      atExit: () => visitMode && !!sim.visitorElevator(),
      exit: (done) => {
        if (!visitMode || !sim.visitorExit(done)) return false;
        followVisitor();
        return true;
      },
      visitorScreen: () => {
        const h = renderer.heads.get(VISITOR_ID);
        if (!h || !h.visible) return null;
        const p = camera.worldToScreen(h.x, h.y - 2);
        if (p.x < 0 || p.y < 0 || p.x > camera.viewW || p.y > camera.viewH) return null;
        return p;
      },
      boardScreen: () => {
        const r = visitMode ? renderer.paintingRect(RECEPTION_ID) : null;
        if (!r) return null;
        const a = camera.worldToScreen(r.x, r.y);
        const b = camera.worldToScreen(r.x + r.w, r.y + r.h);
        if (b.x < 0 || b.y < 0 || a.x > camera.viewW || a.y > camera.viewH) return null;
        return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
      },
    },
  };
}
