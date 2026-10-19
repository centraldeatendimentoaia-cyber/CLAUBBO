// Construtor de salas (Escritório v2): escolha a sala, monte o estilo (cores, paredes, piso) e posicione os móveis do
// catálogo do Claubbo. A prévia usa a própria arte do Claubbo (art/): o que aparece aqui é o que aparece no mapa.
// Salva em PUT /api/build/rooms/:id; o mapa se refaz sozinho quando o servidor publica o novo snapshot.
import { FURNITURE, type FloorKind, type FurnitureKind, type WallPattern } from '../art/api';
import { drawFloor, drawRug, drawSouthWall, drawWallFace, drawWallTop, furnitureSprites, roomTheme } from '../art';
import { THEME_COUNT } from '../art/theme';
import { themeWithStyle } from '../world/layout/custom-room';
import type { BuildDir, BuildItem, RoomStyle } from '../../../shared/build';
import { hash32 } from '../../../shared/hash';
import { h } from './dom';
import { ALLOWED, CATALOG, footprint, isWall, NAMES, nextDir, nextVariant, occupied, placementError, reachability, TEMPLATES } from './builder-model';

const TILE = 16;
const W = 16 * TILE;
const H = 12 * TILE;

interface BuildRoom {
  id: string;
  name: string;
  kind?: 'work' | 'meeting';
  project?: string;
  build?: { style?: RoomStyle; items: BuildItem[] };
}
interface BuildAgent {
  id: string;
  name: string;
  room: string;
}
interface Tool {
  kind: string;
  variant?: string;
  dir?: BuildDir;
}

const FLOORS: Array<[FloorKind, string]> = [['marble', 'Porcelanato'], ['wood', 'Madeira'], ['carpet', 'Carpete'], ['tile_check', 'Xadrez'], ['tile_white', 'Azulejo'], ['concrete', 'Cimento']];
const PATTERNS: Array<[WallPattern, string]> = [['plain', 'Lisa'], ['stripes', 'Listras'], ['wood_panel', 'Painel de madeira'], ['brick', 'Tijolo'], ['tiles', 'Azulejo'], ['marble', 'Mármore'], ['glass', 'Vidro']];
const DESKS = ['wood', 'white', 'dark'];
const CHAIRS = ['black', 'blue', 'red', 'green', 'gray'];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => h(tag, { class: cls, ...(text !== undefined ? { text } : {}) });
const uid = () => Math.random().toString(36).slice(2, 8);

export class Builder {
  private root: HTMLElement | null = null;
  private rooms: BuildRoom[] = [];
  private agents: BuildAgent[] = [];
  private curId = '';
  private items: BuildItem[] = [];
  private style: RoomStyle = {};
  private name = '';
  private project = '';
  private kind: 'work' | 'meeting' = 'work';
  private tool: Tool | null = null;
  private selected = '';
  private hover: { x: number; y: number } | null = null;
  private dirty = false;
  private history: string[] = [];
  private tab: 'moveis' | 'estilo' | 'sala' = 'moveis';

  private canvas!: HTMLCanvasElement;
  private panel!: HTMLElement;
  private roomList!: HTMLElement;
  private status!: HTMLElement;
  private saveBtn!: HTMLButtonElement;
  private onKey = (ev: KeyboardEvent) => this.key(ev);

  toggle(): void {
    if (this.root) this.close();
    else void this.open();
  }

  async open(): Promise<void> {
    if (this.root) return;
    this.root = el('div', 'bd');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Construtor de salas');
    this.canvas = h('canvas', { class: 'bd-canvas' });
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.addEventListener('mousemove', (e) => this.mouse(e, false));
    this.canvas.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });
    this.canvas.addEventListener('click', (e) => this.mouse(e, true));
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.removeAt(e); });
    this.roomList = el('div', 'bd-rooms');
    this.panel = el('div', 'bd-panel');
    this.status = el('p', 'bd-status');
    this.saveBtn = h('button', { class: 'bd-btn bd-btn--primary', type: 'button', text: 'Salvar sala', on: { click: () => void this.save() } });
    const foot = el('div', 'bd-foot');
    foot.append(
      this.status,
      h('button', { class: 'bd-btn', type: 'button', text: 'Desfazer (Ctrl+Z)', on: { click: () => this.undo() } }),
      h('button', { class: 'bd-btn', type: 'button', text: 'Voltar ao padrão do Claubbo', on: { click: () => void this.resetDefault() } }),
      this.saveBtn,
    );
    const left = el('aside', 'bd-left');
    left.append(el('h2', 'bd-title', 'Salas'), this.roomList, h('button', { class: 'bd-btn', type: 'button', text: '+ Nova sala', on: { click: () => void this.newRoom() } }));
    const mid = el('div', 'bd-mid');
    mid.append(this.canvas, el('p', 'bd-hint', 'Escolha um móvel e clique na sala. R gira, V troca a cor ou o modelo, Delete remove, clique direito apaga. Clique num móvel para selecioná-lo e em outro lugar para movê-lo.'));
    foot.append(h('button', { class: 'bd-btn', type: 'button', text: 'Fechar (Esc)', on: { click: () => this.close() } }));
    this.root.append(left, mid, this.panel, foot);
    (document.querySelector('.ui-root') ?? document.body).append(this.root);
    window.addEventListener('keydown', this.onKey, true);
    await this.load();
  }

  close(): void {
    if (!this.root) return;
    if (this.dirty && !window.confirm('Há alterações não salvas nesta sala. Fechar mesmo assim?')) return;
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
    this.root = null;
  }

  // ------------------------------------------------------------ dados
  private async load(keep = ''): Promise<void> {
    try {
      const data = (await (await fetch('/api/build/rooms')).json()) as { rooms: BuildRoom[]; agents: BuildAgent[] };
      this.rooms = data.rooms;
      this.agents = data.agents;
    } catch {
      this.setStatus('Não consegui falar com o servidor do escritório.', true);
      return;
    }
    this.pick(keep && this.rooms.some((r) => r.id === keep) ? keep : this.rooms[0]?.id ?? '');
  }

  private pick(id: string): void {
    if (this.dirty && id !== this.curId && !window.confirm('Descartar as alterações não salvas desta sala?')) return;
    const r = this.rooms.find((x) => x.id === id);
    this.curId = id;
    this.items = JSON.parse(JSON.stringify(r?.build?.items ?? []));
    this.style = JSON.parse(JSON.stringify(r?.build?.style ?? {}));
    this.name = r?.name ?? '';
    this.project = r?.project ?? '';
    this.kind = r?.kind === 'meeting' ? 'meeting' : 'work';
    this.selected = '';
    this.tool = null;
    this.history = [];
    this.dirty = false;
    this.renderAll();
  }

  private async api(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  private async save(): Promise<void> {
    const reach = reachability(this.items);
    if (reach.unreachable > 0) return this.setStatus(`${reach.unreachable} lugar(es) de trabalho ficaram sem caminho. Abra espaço antes de salvar.`, true);
    const hasStyle = Object.keys(this.style).length > 0;
    const r = await this.api(`/api/build/rooms/${encodeURIComponent(this.curId)}`, 'PUT', { name: this.name, project: this.project, kind: this.kind, build: { ...(hasStyle ? { style: this.style } : {}), items: this.items } });
    if (!r.ok) return this.setStatus(String(r.data.error ?? 'Não consegui salvar.'), true);
    this.dirty = false;
    this.setStatus('Sala salva. O mapa já está se refazendo.');
    await this.load(this.curId);
  }

  private async resetDefault(): Promise<void> {
    if (!window.confirm('Voltar esta sala ao desenho padrão do Claubbo? Seus móveis e cores serão apagados.')) return;
    const r = await this.api(`/api/build/rooms/${encodeURIComponent(this.curId)}`, 'PUT', { build: null });
    if (!r.ok) return this.setStatus(String(r.data.error ?? 'Não consegui.'), true);
    this.dirty = false;
    await this.load(this.curId);
    this.setStatus('Sala no padrão do Claubbo.');
  }

  private async newRoom(): Promise<void> {
    const name = window.prompt('Nome da nova sala (ex.: Tráfego, Social, Copy):');
    if (!name) return;
    const r = await this.api('/api/build/rooms', 'POST', { name });
    if (!r.ok) return this.setStatus(String(r.data.error ?? 'Não consegui criar.'), true);
    this.dirty = false;
    await this.load(String(r.data.id));
  }

  private applyTemplate(tp: (typeof TEMPLATES)[number]): void {
    if (this.items.length && !window.confirm(`Trocar os móveis desta sala pelo modelo "${tp.name}"?`)) return;
    this.snapshot();
    this.items = tp.items.map((i) => ({ ...i, id: uid() }));
    this.selected = '';
    this.renderAll();
  }

  private async deleteRoom(): Promise<void> {
    if (!window.confirm(`Excluir a sala "${this.name}"?`)) return;
    const r = await this.api(`/api/build/rooms/${encodeURIComponent(this.curId)}`, 'DELETE');
    if (!r.ok) return this.setStatus(String(r.data.error ?? 'Não consegui excluir.'), true);
    this.dirty = false;
    await this.load();
  }

  private async moveAgent(agentId: string, room: string): Promise<void> {
    const r = await this.api(`/api/build/agents/${encodeURIComponent(agentId)}/room`, 'PUT', { room });
    if (!r.ok) return this.setStatus(String(r.data.error ?? 'Não consegui mudar o agente de sala.'), true);
    const a = this.agents.find((x) => x.id === agentId);
    if (a) a.room = room;
    this.setStatus('Agente mudou de sala.');
  }

  // ------------------------------------------------------------ edição
  private snapshot(): void {
    this.history.push(JSON.stringify({ items: this.items, style: this.style }));
    if (this.history.length > 60) this.history.shift();
    this.dirty = true;
  }

  private undo(): void {
    const last = this.history.pop();
    if (!last) return;
    const s = JSON.parse(last) as { items: BuildItem[]; style: RoomStyle };
    this.items = s.items;
    this.style = s.style;
    this.selected = '';
    this.renderAll();
  }

  private tileAt(e: MouseEvent): { x: number; y: number; px: number; py: number } {
    const r = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    return { x: Math.floor(px / TILE), y: Math.floor(py / TILE), px, py };
  }

  /** Posição do móvel para o mouse: parede (x = centro) ou chão (x,y = canto do footprint). */
  private spotFor(kind: string, t: { x: number; y: number; px: number }): { x: number; y: number } {
    const { w } = footprint(kind);
    if (isWall(kind)) return { x: Math.round(t.px / TILE - w / 2) + w / 2, y: 0 };
    return { x: t.x, y: t.y };
  }

  private mouse(e: MouseEvent, click: boolean): void {
    const t = this.tileAt(e);
    const kind = this.tool?.kind ?? this.items.find((i) => i.id === this.selected)?.kind;
    if (click) this.setStatus(''); // erro antigo não pode travar a contagem de móveis
    if (!click) {
      this.hover = kind ? this.spotFor(kind, t) : { x: t.x, y: t.y };
      this.draw();
      return;
    }
    // Clicar num móvel já colocado o seleciona (e larga a ferramenta), mesmo logo depois de colocar outro.
    const over = this.tool ? this.hitTest(t) : undefined;
    if (over) {
      this.tool = null;
      this.selected = over.id;
      return this.renderAll();
    }
    if (this.tool) {
      const spot = this.spotFor(this.tool.kind, t);
      const err = placementError(this.items, { kind: this.tool.kind, ...spot });
      if (err) return this.setStatus(err, true);
      this.snapshot();
      const id = uid();
      const def = FURNITURE[this.tool.kind as FurnitureKind];
      this.items.push({ id, kind: this.tool.kind, ...(this.tool.variant ?? def?.variants?.[0] ? { variant: this.tool.variant ?? def?.variants?.[0] } : {}), ...spot, ...(this.tool.dir ? { dir: this.tool.dir } : {}) });
      this.selected = id;
      return this.renderAll();
    }
    const hit = this.hitTest(t);
    if (hit && hit.id !== this.selected) {
      this.selected = hit.id;
      return this.renderAll();
    }
    const sel = this.items.find((i) => i.id === this.selected);
    if (sel && !hit) {
      const spot = this.spotFor(sel.kind, t);
      const err = placementError(this.items, { kind: sel.kind, ...spot }, sel.id);
      if (err) return this.setStatus(err, true);
      this.snapshot();
      Object.assign(sel, spot);
      this.renderAll();
    }
  }

  private hitTest(t: { x: number; y: number; px: number; py: number }): BuildItem | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (isWall(it.kind)) {
        const w = footprint(it.kind).w;
        if (t.y < 2 && Math.abs(t.px / TILE - it.x) <= w / 2) return it;
      } else if (occupied({ kind: it.kind, x: it.x, y: it.y }).slice(0, footprint(it.kind).w * footprint(it.kind).h).some(([x, y]) => x === t.x && y === t.y)) return it;
    }
    return undefined;
  }

  private removeAt(e: MouseEvent): void {
    this.setStatus('');
    const hit = this.hitTest(this.tileAt(e));
    if (hit) this.remove(hit.id);
    else if (this.tool) {
      this.tool = null;
      this.renderAll();
    }
  }

  private remove(id: string): void {
    this.snapshot();
    this.items = this.items.filter((i) => i.id !== id);
    if (this.selected === id) this.selected = '';
    this.renderAll();
  }

  private key(ev: KeyboardEvent): void {
    const t = ev.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      if (this.tool) {
        this.tool = null;
        this.renderAll();
      } else this.close();
      return;
    }
    if (typing) return;
    ev.stopPropagation();
    this.setStatus('');
    const sel = this.items.find((i) => i.id === this.selected);
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      this.undo();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (sel) this.remove(sel.id);
    } else if (ev.key.toLowerCase() === 'r') {
      if (this.tool) this.tool.dir = nextDir({ kind: this.tool.kind, dir: this.tool.dir });
      else if (sel) {
        this.snapshot();
        sel.dir = nextDir(sel);
        if (['armchair', 'cafe_chair'].includes(sel.kind)) sel.variant = sel.dir;
        if (sel.kind === 'sofa') sel.variant = sel.dir;
      }
      this.draw();
    } else if (ev.key.toLowerCase() === 'v') {
      const target = this.tool ?? sel;
      if (target) {
        const nv = nextVariant({ kind: target.kind, variant: target.variant });
        if (nv) {
          if (!this.tool) this.snapshot();
          target.variant = nv;
          this.renderAll();
        }
      }
    }
  }

  // ------------------------------------------------------------ desenho
  private theme() {
    return themeWithStyle(roomTheme(this.style.base ?? hash32(this.curId) % THEME_COUNT), this.style);
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    const t = this.theme();
    const seed = hash32(this.curId);
    drawFloor(ctx, this.style.floor ?? 'marble', 0, 0, W, H, { seed });
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = t.carpet;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    drawRug(ctx, 1.5 * TILE, 3.25 * TILE, 7 * TILE, 5.5 * TILE, t.carpet, seed);
    drawWallFace(ctx, 8, 0, 240, t.wall, { doorways: [{ x: 7 * TILE, w: 2 * TILE }] });
    drawSouthWall(ctx, 8, 11 * TILE, 240, { ...t.wall, exterior: true });
    drawWallTop(ctx, 0, 0, 8, H, t.wall);
    drawWallTop(ctx, 248, 0, 8, H, t.wall);
    // grade leve do interior
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x <= 15; x++) { ctx.moveTo(x * TILE + 0.5, 2 * TILE); ctx.lineTo(x * TILE + 0.5, 11 * TILE); }
    for (let y = 2; y <= 11; y++) { ctx.moveTo(TILE, y * TILE + 0.5); ctx.lineTo(15 * TILE, y * TILE + 0.5); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(80,200,120,0.10)';
    ctx.fillRect(7 * TILE, 2 * TILE, 2 * TILE, 9 * TILE); // faixa da porta
    const order = [...this.items].sort((a, b) => (isWall(a.kind) ? -1 : 0) - (isWall(b.kind) ? -1 : 0) || a.y + footprint(a.kind).h - (b.y + footprint(b.kind).h));
    for (const it of order) this.drawItem(ctx, it, t, 1);
    if (this.hover && (this.tool || this.items.some((i) => i.id === this.selected))) {
      const tool = this.tool ?? this.items.find((i) => i.id === this.selected)!;
      const err = placementError(this.items, { kind: tool.kind, ...this.hover }, this.tool ? undefined : this.selected);
      this.drawItem(ctx, { id: 'ghost', kind: tool.kind, variant: tool.variant, dir: tool.dir, x: this.hover.x, y: this.hover.y }, t, 0.6);
      this.outline(ctx, { kind: tool.kind, ...this.hover }, err ? '#ff6b6b' : '#4fd18b');
    }
    const sel = this.items.find((i) => i.id === this.selected);
    if (sel && !this.tool) this.outline(ctx, sel, '#7cc8ff');
  }

  private outline(ctx: CanvasRenderingContext2D, it: { kind: string; x: number; y: number }, color: string): void {
    const { w, h: hh } = footprint(it.kind);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (isWall(it.kind)) ctx.strokeRect((it.x - w / 2) * TILE + 0.5, 0.5, w * TILE - 1, 2 * TILE - 1);
    else ctx.strokeRect(it.x * TILE + 0.5, it.y * TILE + 0.5, w * TILE - 1, hh * TILE - 1);
  }

  private drawItem(ctx: CanvasRenderingContext2D, it: BuildItem, t: ReturnType<Builder['theme']>, alpha: number): void {
    if (!ALLOWED.has(it.kind)) return;
    ctx.globalAlpha = alpha;
    const kind = it.kind as FurnitureKind;
    const def = FURNITURE[kind];
    const put = (k: FurnitureKind, variant: string | undefined, ax: number, ay: number) => {
      const s = furnitureSprites(k, variant);
      ctx.drawImage(s.base.canvas, Math.round(ax - s.base.ax), Math.round(ay - s.base.ay));
      if (s.front) ctx.drawImage(s.front.canvas, Math.round(ax - s.front.ax), Math.round(ay - s.front.ay));
    };
    const dirVariant = ['armchair', 'cafe_chair'].includes(it.kind) ? it.dir ?? 'down' : it.kind === 'sofa' ? (it.variant === 'down' ? 'down' : 'up') : it.variant ?? (def.variants ? undefined : undefined);
    if (def.mount === 'wall') put(kind, it.variant, it.x * TILE, 2 * TILE);
    else {
      const { w, h: hh } = footprint(it.kind);
      put(kind, dirVariant ?? (it.kind === 'desk' || it.kind === 'desk_back' ? it.variant ?? t.deskVariant : it.variant), (it.x + w / 2) * TILE, (it.y + hh) * TILE);
      if (it.kind === 'desk') put('office_chair', t.chairVariant, (it.x + 0.5) * TILE + TILE / 2, (it.y + 2) * TILE);
      if (it.kind === 'desk_back') put('office_chair_front', t.chairVariant, (it.x + 0.5) * TILE + TILE / 2, it.y * TILE);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ interface
  private setStatus(text: string, bad = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('is-bad', bad);
  }

  private renderAll(): void {
    this.renderRooms();
    this.renderPanel();
    this.draw();
    const reach = reachability(this.items);
    if (!this.status.classList.contains('is-bad') || this.status.textContent === '') {
      this.setStatus(`${this.items.length} móveis · ${reach.seats} lugares de trabalho${reach.unreachable ? ` · ${reach.unreachable} sem caminho` : ''}${this.dirty ? ' · não salvo' : ''}`, reach.unreachable > 0);
    } else if (reach.unreachable === 0 && this.status.textContent?.includes('sem caminho')) this.setStatus('');
    this.saveBtn.disabled = !this.dirty;
  }

  private renderRooms(): void {
    this.roomList.replaceChildren(
      ...this.rooms.map((r) => {
        const count = this.agents.filter((a) => a.room === r.id).length;
        return h('button', { class: `bd-room${r.id === this.curId ? ' is-on' : ''}`, type: 'button', on: { click: () => this.pick(r.id) } }, h('strong', { text: r.name }), h('span', { text: `${count} agente${count === 1 ? '' : 's'}${r.build ? ' · montada' : ''}` }));
      }),
    );
  }

  private renderPanel(): void {
    const tabs = el('div', 'bd-tabs');
    for (const [id, label] of [['moveis', 'Móveis'], ['estilo', 'Estilo'], ['sala', 'Sala e agentes']] as const) {
      tabs.append(h('button', { class: `bd-tab${this.tab === id ? ' is-on' : ''}`, type: 'button', text: label, on: { click: () => { this.tab = id; this.renderPanel(); } } }));
    }
    const body = el('div', 'bd-body');
    if (this.tab === 'moveis') this.catalog(body);
    else if (this.tab === 'estilo') this.styleTab(body);
    else this.roomTab(body);
    this.panel.replaceChildren(tabs, body);
  }

  private catalog(body: HTMLElement): void {
    const sel = this.items.find((i) => i.id === this.selected);
    if (sel && !this.tool) {
      const box = el('div', 'bd-sel');
      box.append(
        el('strong', 'bd-sel__name', `Selecionado: ${NAMES[sel.kind] ?? sel.kind}`),
        h('button', { class: 'bd-btn', type: 'button', text: 'Girar (R)', on: { click: () => this.key(new KeyboardEvent('keydown', { key: 'r' })) } }),
        h('button', { class: 'bd-btn', type: 'button', text: 'Trocar (V)', on: { click: () => this.key(new KeyboardEvent('keydown', { key: 'v' })) } }),
        h('button', { class: 'bd-btn bd-btn--danger', type: 'button', text: 'Remover', on: { click: () => this.remove(sel.id) } }),
      );
      body.append(box);
    }
    if (this.tool) body.append(el('p', 'bd-tool', `Pondo: ${NAMES[this.tool.kind] ?? this.tool.kind}. Clique na sala. Esc cancela.`));
    for (const g of CATALOG) {
      body.append(el('h3', 'bd-group', g.group));
      const grid = el('div', 'bd-grid');
      for (const kind of g.kinds) {
        const thumb = h('canvas', { class: 'bd-thumb' });
        this.thumb(thumb, kind);
        grid.append(h('button', { class: `bd-item${this.tool?.kind === kind ? ' is-on' : ''}`, type: 'button', title: NAMES[kind] ?? kind, on: { click: () => { this.tool = { kind, variant: FURNITURE[kind].variants?.[0] }; this.selected = ''; this.renderAll(); } } }, thumb, h('span', { text: NAMES[kind] ?? kind })));
      }
      body.append(grid);
    }
  }

  private thumb(c: HTMLCanvasElement, kind: FurnitureKind): void {
    const s = furnitureSprites(kind, FURNITURE[kind].variants?.[0]);
    const sc = Math.max(1, Math.min(3, Math.floor(44 / Math.max(s.base.canvas.width, s.base.canvas.height))));
    c.width = 48;
    c.height = 48;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const w = s.base.canvas.width * sc;
    const hh = s.base.canvas.height * sc;
    ctx.drawImage(s.base.canvas, Math.round((48 - w) / 2), Math.round((48 - hh) / 2), w, hh);
    if (s.front) ctx.drawImage(s.front.canvas, Math.round((48 - w) / 2), Math.round((48 - hh) / 2), s.front.canvas.width * sc, s.front.canvas.height * sc);
  }

  private styleTab(body: HTMLElement): void {
    const t = this.theme();
    const set = (patch: Partial<RoomStyle>) => { this.snapshot(); this.style = { ...this.style, ...patch }; this.renderAll(); };
    body.append(el('h3', 'bd-group', 'Temas prontos'));
    const sw = el('div', 'bd-themes');
    for (let i = 0; i < THEME_COUNT; i++) {
      const th = roomTheme(i);
      const b = h('button', { class: `bd-theme${this.style.base === i ? ' is-on' : ''}`, type: 'button', title: `Tema ${i + 1}`, on: { click: () => { this.snapshot(); this.style = { ...(this.style.floor ? { floor: this.style.floor } : {}), base: i }; this.renderAll(); } } });
      b.style.background = `linear-gradient(135deg, ${th.wall.base} 0 40%, ${th.carpet} 40% 70%, ${th.accent} 70%)`;
      sw.append(b);
    }
    body.append(sw, el('h3', 'bd-group', 'Cores'));
    const color = (label: string, key: 'carpet' | 'carpet2' | 'wallBase' | 'wallTrim' | 'accent', cur: string) => {
      const input = h('input', { type: 'color' });
      input.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#cccccc';
      input.addEventListener('change', () => set({ [key]: input.value }));
      body.append(h('label', { class: 'bd-field' }, h('span', { text: label }), input));
    };
    color('Tapete', 'carpet', t.carpet);
    color('Tapete (detalhe)', 'carpet2', t.carpet2);
    color('Parede', 'wallBase', t.wall.base);
    color('Friso da parede', 'wallTrim', t.wall.trim ?? '#999999');
    color('Destaque', 'accent', t.accent);
    const select = (label: string, key: 'floor' | 'wallPattern' | 'deskVariant' | 'chairVariant', options: Array<[string, string]>, cur: string) => {
      const s = h('select', {});
      for (const [v, l] of options) { const o = h('option', { text: l }); o.value = v; if (v === cur) o.selected = true; s.append(o); }
      s.addEventListener('change', () => set({ [key]: s.value } as Partial<RoomStyle>));
      body.append(h('label', { class: 'bd-field' }, h('span', { text: label }), s));
    };
    body.append(el('h3', 'bd-group', 'Piso e parede'));
    select('Piso', 'floor', FLOORS, this.style.floor ?? 'marble');
    select('Parede', 'wallPattern', PATTERNS, t.wall.pattern ?? 'plain');
    body.append(el('h3', 'bd-group', 'Mesas e cadeiras'));
    select('Cor das mesas', 'deskVariant', DESKS.map((d) => [d, d] as [string, string]), t.deskVariant);
    select('Cor das cadeiras', 'chairVariant', CHAIRS.map((d) => [d, d] as [string, string]), t.chairVariant);
    body.append(h('button', { class: 'bd-btn', type: 'button', text: 'Limpar estilo', on: { click: () => { this.snapshot(); this.style = {}; this.renderAll(); } } }));
  }

  private kindField(): HTMLElement {
    const s = h('select', {});
    for (const [v, l] of [['work', 'Sala de trabalho'], ['meeting', 'Sala de reunião (todos vêm para cá nas reuniões)']] as const) { const o = h('option', { text: l }); o.value = v; if (v === this.kind) o.selected = true; s.append(o); }
    s.addEventListener('change', () => { this.kind = s.value === 'meeting' ? 'meeting' : 'work'; this.dirty = true; this.saveBtn.disabled = false; });
    return h('label', { class: 'bd-field bd-field--col' }, h('span', { text: 'Tipo da sala' }), s);
  }

  private roomTab(body: HTMLElement): void {
    const nameIn = h('input', { type: 'text' });
    nameIn.value = this.name;
    nameIn.maxLength = 32;
    nameIn.addEventListener('input', () => { this.name = nameIn.value; this.dirty = true; this.saveBtn.disabled = false; });
    const projIn = h('input', { type: 'text' });
    projIn.value = this.project;
    projIn.placeholder = 'Pasta do projeto (opcional), ex.: D:\\projetos\\crm';
    projIn.addEventListener('input', () => { this.project = projIn.value; this.dirty = true; this.saveBtn.disabled = false; });
    body.append(
      h('label', { class: 'bd-field bd-field--col' }, h('span', { text: 'Nome da sala' }), nameIn),
      h('label', { class: 'bd-field bd-field--col' }, h('span', { text: 'Pasta do projeto' }), projIn),
      this.kindField(),
      el('p', 'bd-hint', 'Uma tarefa que cita o nome da sala ou o nome da pasta leva o agente até aqui. Sem citação, ele trabalha na sala de casa.'),
      el('h3', 'bd-group', 'Agentes (sala de casa)'),
    );
    for (const a of this.agents) {
      const s = h('select', {});
      for (const r of this.rooms) { const o = h('option', { text: r.name }); o.value = r.id; if (a.room === r.id) o.selected = true; s.append(o); }
      s.addEventListener('change', () => void this.moveAgent(a.id, s.value));
      body.append(h('label', { class: 'bd-field' }, h('span', { text: a.name }), s));
    }
    body.append(el('h3', 'bd-group', 'Começar de um modelo'));
    for (const tp of TEMPLATES) {
      body.append(h('button', { class: 'bd-btn', type: 'button', text: tp.name, on: { click: () => this.applyTemplate(tp) } }));
    }
    body.append(h('button', { class: 'bd-btn bd-btn--danger', type: 'button', text: 'Excluir esta sala', on: { click: () => void this.deleteRoom() } }));
  }
}
