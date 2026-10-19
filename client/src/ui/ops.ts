// Operações do Escritório v2: agentes, tarefas, rotinas, reuniões e contas (Claude e Codex), tudo por esta janela.
// Fala com /api/ops/* da própria porta. Os textos que vêm do servidor entram só como textContent.
import { buildMeetingPrompt, copyText } from './meeting-prompt';
import { h } from './dom';
import { renderCompanyTab, renderHireTab } from './hire';

interface Agent { id: string; name: string; role: string; does: string; brief: string; room: string; model: string; effort: string; account: string; tools: string[]; skills: string[]; type: string; hours?: { start: string; end: string; days: number[] }; system?: { type: 'local' | 'url' | 'visual'; name: string; folder?: string; command?: string; port?: number; url?: string; autoRestart?: boolean } }
interface DevStage { stage: 'plan' | 'implement' | 'test'; text: string; approved: boolean }
interface Task {
  id: string; agent: string; title: string; text: string; state: 'next' | 'doing' | 'waiting' | 'done'; addedAt: number; result?: string; error?: string; note?: string; denied?: string[];
  routine?: string; commit?: string; project?: string; diff?: { stat: string; patch: string }; dev?: { stage: DevStage['stage']; awaiting: boolean; stages: DevStage[] };
}
interface RoutineRun { task: string; startedAt: number; finishedAt: number; ok: boolean; result: string }
interface Routine { id: string; title: string; agent: string; text: string; whenText: string; whenLabel: string; paused: boolean; lastRun: number; history?: RoutineRun[] }
interface Meeting { id: string; objective: string; participants: string[]; rounds: number; state: string; turns: Array<{ round: number; name: string; text: string }>; minutes?: string; note?: string; error?: string; createdAt?: number; doneAt?: number; summary?: { decisions: string[]; steps: Array<{ id: string; text: string; owner: string; task?: string; agent?: string }> } }
interface Window { utilization: number; resetsAt?: number }
interface Account { id: string; name: string; provider: 'claude' | 'codex'; letter: string; color: string; state: 'connected' | 'disconnected'; cli?: { installed: boolean; loggedIn: boolean }; principal?: boolean; dir?: string; usage?: { fiveHour?: Window; sevenDay?: Window } }
interface OpsState {
  agents: Agent[]; rooms: Array<{ id: string; name: string; kind: string }>; tasks: Task[]; routines: Routine[]; meetings: Meeting[]; accounts: Account[]; skills: Array<{ name: string; description: string }>;
  mcp: Array<{ name: string; key: string; status: string }>; limits: { meetingParticipants: number };
}

type Tab = 'agentes' | 'contratar' | 'empresa' | 'tarefas' | 'rotinas' | 'reunioes' | 'contas';
const TABS: Array<[Tab, string]> = [['agentes', 'Agentes'], ['contratar', 'Contratar'], ['empresa', 'Empresa'], ['tarefas', 'Tarefas'], ['rotinas', 'Rotinas'], ['reunioes', 'Reuniões'], ['contas', 'Contas']];
const MODELS: Array<[string, string]> = [['', 'Padrão (Sonnet)'], ['sonnet', 'Sonnet'], ['opus', 'Opus'], ['fable', 'Fable'], ['haiku', 'Haiku']];
const EFFORTS: Array<[string, string]> = [['', 'Baixo (padrão)'], ['low', 'Baixo'], ['medium', 'Médio'], ['high', 'Alto'], ['xhigh', 'Muito alto'], ['max', 'Máximo']];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
const STATE_LABEL: Record<string, string> = { next: 'Na fila', doing: 'Trabalhando', waiting: 'Esperando seu OK', done: 'Feita', queued: 'Na fila', running: 'Em andamento', cancelled: 'Cancelada', error: 'Erro', interrupted: 'Interrompida (servidor reiniciado)' };
const STAGE_LABEL: Record<string, string> = { plan: 'Plano', implement: 'Implementação', test: 'Testes' };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => h(tag, { class: cls, ...(text !== undefined ? { text } : {}) });
const btn = (text: string, onClick: () => void, cls = 'bd-btn') => h('button', { class: cls, type: 'button', text, on: { click: onClick } });
const when = (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export class Ops {
  private root: HTMLElement | null = null;
  private body!: HTMLElement;
  private msg!: HTMLElement;
  private banner!: HTMLElement;
  private tabsEl!: HTMLElement;
  private tab: Tab = 'agentes';
  private st: OpsState | null = null;
  private timer: number | null = null;
  /** Houve dado novo que não foi desenhado (formulário ou campo em uso): desenha assim que der. */
  private skipped = false;
  /** Botão do mouse apertado dentro da janela: não redesenha por cima até soltar (o clique não se perde). */
  private pressing = false;
  private release = () => { this.pressing = false; if (this.skipped && this.root && this.editing === null) { this.skipped = false; this.render(); } };
  /** Formulário aberto (agente em edição, ou novo): enquanto existe, a lista não é redesenhada por cima. */
  private editing: Agent | 'new' | null = null;
  private drafts: Record<string, string> = {};
  /** Contas cujo login foi aberto e ainda não terminou: a janela confere de 1,5 em 1,5 s e avisa quando conectar. */
  private waiting = new Set<string>();
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } };

  toggle(): void {
    if (this.root) this.close();
    else void this.open();
  }

  async open(tab?: Tab): Promise<void> {
    if (this.root) return;
    if (tab) this.tab = tab;
    this.root = el('div', 'op');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Operações do escritório');
    this.tabsEl = el('div', 'bd-tabs op-tabs');
    this.renderTabs();
    this.msg = el('p', 'bd-status');
    this.banner = el('div', 'op-banner');
    this.body = el('div', 'op-body');
    const head = el('div', 'op-head');
    head.append(el('h2', 'bd-title', 'Operações'), this.tabsEl, btn('Fechar (Esc)', () => this.close()));
    this.root.append(head, this.banner, this.msg, this.body);
    (document.querySelector('.ui-root') ?? document.body).append(this.root);
    window.addEventListener('keydown', this.onKey, true);
    this.root.addEventListener('pointerdown', () => { this.pressing = true; });
    window.addEventListener('pointerup', this.release);
    window.addEventListener('pointercancel', this.release);
    await this.load();
    this.schedule();
  }

  close(): void {
    if (!this.root) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('pointerup', this.release);
    window.removeEventListener('pointercancel', this.release);
    this.pressing = false;
    this.root.remove();
    this.root = null;
    this.editing = null;
  }

  private schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(async () => { await this.load(); if (this.root) this.schedule(); }, this.waiting.size ? 1500 : 3000);
  }

  private renderTabs(): void {
    this.tabsEl.replaceChildren(...TABS.map(([id, label]) => h('button', { class: `bd-tab${this.tab === id ? ' is-on' : ''}`, type: 'button', text: label, on: { click: () => { this.tab = id; this.editing = null; this.renderTabs(); this.render(); } } })));
  }

  private say(text: string, bad = false): void {
    this.msg.textContent = text;
    this.msg.classList.toggle('is-bad', bad);
  }

  private async load(): Promise<void> {
    let next: OpsState;
    try {
      next = (await (await fetch('/api/ops/state')).json()) as OpsState;
    } catch {
      return this.say('Não consegui falar com o servidor do escritório.', true);
    }
    const before = this.st;
    const unchanged = !!before && JSON.stringify(before) === JSON.stringify(next);
    this.st = next;
    this.watchLogins(before);
    this.renderBanner();
    // não redesenha por cima de um formulário aberto ou de um campo em uso
    // sem mudança nos dados não redesenha: refazer a lista a cada 3 s podia engolir um clique em andamento
    if ((!unchanged || this.skipped) && !this.pressing && this.editing === null && !this.root?.querySelector('textarea:focus, input:focus, select:focus')) { this.skipped = false; this.render(); }
    else if (!unchanged) this.skipped = true;
  }

  private async call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) this.say(String(data.error ?? `erro ${res.status}`), true);
    return { ok: res.ok, data };
  }

  private renderSeq = 0;
  /** Marca este desenho da tela: devolve uma função que fica falsa quando a tela for redesenhada ou a aba mudar. */
  private liveRender(): () => boolean {
    const seq = this.renderSeq;
    return () => seq === this.renderSeq;
  }

  private render(): void {
    if (!this.st) return;
    this.renderSeq++;
    this.body.replaceChildren();
    if (this.tab === 'agentes') this.agentsTab();
    else if (this.tab === 'contratar') void renderHireTab(this.body, this.st.rooms, (t, bad) => this.say(t, bad), () => this.load(), this.liveRender());
    else if (this.tab === 'empresa') void renderCompanyTab(this.body, (t, bad) => this.say(t, bad), this.liveRender());
    else if (this.tab === 'tarefas') this.tasksTab();
    else if (this.tab === 'rotinas') this.routinesTab();
    else if (this.tab === 'reunioes') this.meetingsTab();
    else this.accountsTab();
  }

  private accountLabel(id: string): string {
    const a = this.st?.accounts.find((x) => x.id === id);
    return a ? `${a.name} (${a.provider === 'codex' ? 'Codex' : 'Claude'})` : id;
  }

  private field(label: string, input: HTMLElement, col = true): HTMLElement {
    return h('label', { class: `bd-field${col ? ' bd-field--col' : ''}` }, h('span', { text: label }), input);
  }

  private select(options: Array<[string, string]>, value: string): HTMLSelectElement {
    const s = h('select', {});
    for (const [v, l] of options) { const o = h('option', { text: l }); o.value = v; if (v === value) o.selected = true; s.append(o); }
    return s;
  }

  // ------------------------------------------------------------ conexão de contas
  /** Aviso no topo de qualquer aba: um agente usa uma conta sem login. Um clique abre o login. */
  private renderBanner(): void {
    const st = this.st;
    if (!st) return;
    const stuck = st.accounts.filter((a) => a.state !== 'connected' && st.agents.some((g) => g.account === a.id));
    this.banner.replaceChildren();
    this.banner.hidden = stuck.length === 0;
    for (const a of stuck) {
      const users = st.agents.filter((g) => g.account === a.id).map((g) => g.name).join(', ');
      this.banner.append(h('div', { class: 'op-banner__row' },
        h('span', { text: `A conta ${a.name} (${a.provider === 'codex' ? 'Codex' : 'Claude'}) não está conectada e ${users} usa${users.includes(',') ? 'm' : ''} ela.` }),
        btn(this.waiting.has(a.id) ? 'Aguardando login…' : 'Conectar agora', () => void this.connect(a), 'bd-btn bd-btn--primary')));
    }
  }

  /** Abre o login da conta e passa a esperar: quando o arquivo de login aparecer, a janela avisa e já puxa o uso. */
  private async connect(a: Account): Promise<void> {
    const r = await this.call(`/api/ops/accounts/${encodeURIComponent(a.id)}/login`, 'POST');
    if (!r.ok) return;
    this.waiting.add(a.id);
    this.say(`Abri uma janela de terminal para a conta ${a.name} (pasta ${String(r.data.dir ?? a.dir ?? '')}). Entre no navegador que vai abrir; se ele não abrir, use o link que a janela preta mostra.`);
    this.schedule();
    this.renderBanner();
    if (this.tab === 'contas') this.render();
  }

  private watchLogins(before: OpsState | null): void {
    if (!this.st) return;
    for (const id of [...this.waiting]) {
      const now = this.st.accounts.find((a) => a.id === id);
      if (!now) { this.waiting.delete(id); continue; }
      if (now.state === 'connected') {
        this.waiting.delete(id);
        this.say(`Conta ${now.name} conectada. Já posso usá-la nos agentes.`);
        if (now.provider === 'claude') void this.call(`/api/ops/accounts/${encodeURIComponent(id)}/probe`, 'POST').then(() => this.load());
      }
    }
    void before;
  }

  // ------------------------------------------------------------ agentes
  private agentsTab(): void {
    const st = this.st!;
    if (this.editing) return this.agentForm(this.editing === 'new' ? null : this.editing);
    this.body.append(btn('+ Novo agente', () => { this.editing = 'new'; this.render(); }, 'bd-btn bd-btn--primary'));
    for (const a of st.agents) {
      const row = el('div', 'op-card');
      row.append(
        h('div', { class: 'op-card__main' }, h('strong', { text: a.name }), h('span', { class: 'op-muted', text: ` · ${a.role || 'sem cargo'} · ${this.accountLabel(a.account)}${a.type === 'dev' ? ' · mexe em código' : ''}` }), h('p', { class: 'op-muted', text: a.does || '' }),
          h('p', { class: 'op-muted', text: `Ferramentas: ${a.tools.join(', ') || 'nenhuma'}${a.skills.length ? ` · Skills: ${a.skills.join(', ')}` : ''}` })),
        btn('Editar', () => { this.editing = a; this.render(); }),
        btn('Excluir', () => void this.deleteAgent(a), 'bd-btn bd-btn--danger'),
      );
      this.body.append(row);
    }
  }

  private async deleteAgent(a: Agent): Promise<void> {
    if (!window.confirm(`Excluir o agente ${a.name}? O histórico de conversa continua guardado.`)) return;
    const r = await this.call(`/api/ops/agents/${encodeURIComponent(a.id)}`, 'DELETE');
    if (r.ok) { this.say('Agente excluído.'); await this.load(); }
  }

  private agentForm(a: Agent | null): void {
    const st = this.st!;
    const name = h('input', { type: 'text' }); name.value = a?.name ?? ''; name.maxLength = 32;
    const role = h('input', { type: 'text' }); role.value = a?.role ?? ''; role.maxLength = 80;
    const does = h('input', { type: 'text' }); does.value = a?.does ?? ''; does.maxLength = 400;
    const brief = h('textarea', {}); brief.value = a?.brief ?? ''; brief.rows = 5; brief.maxLength = 2000;
    const room = this.select(st.rooms.filter((r) => r.kind !== 'meeting').map((r) => [r.id, r.name] as [string, string]), a?.room ?? '');
    const account = this.select(st.accounts.map((c) => [c.id, `${c.name} (${c.provider === 'codex' ? 'Codex' : 'Claude'})${c.state === 'connected' ? '' : ' — sem login'}`] as [string, string]), a?.account ?? 'principal');
    const model = this.select(MODELS, a?.model ?? '');
    const effort = this.select(EFFORTS, a?.effort ?? '');
    const type = this.select([['pensador', 'Pensador: pesquisa, escreve, analisa (sem mexer em arquivos)'], ['dev', 'Dev: mexe no código da pasta do projeto da sala, com aprovação em cada etapa']], a?.type ?? 'pensador');
    // ferramentas: web, Chrome e os servidores MCP detectados; o que o agente já tem e não é conhecido é preservado
    const toolOptions: Array<{ key: string; label: string }> = [{ key: 'web', label: 'Pesquisa na web' }, { key: 'chrome', label: 'Chrome (seu navegador logado)' }, ...st.mcp.map((s) => ({ key: s.key, label: `${s.name}${s.status === 'connected' ? '' : ' (indisponível)'}` }))];
    const has = (key: string) => (a?.tools ?? []).some((t) => norm(t) === key || (key.length > 3 && key.includes(norm(t)) && norm(t).length > 2));
    const toolBoxes = toolOptions.map((o) => { const c = h('input', { type: 'checkbox' }); c.checked = has(o.key); return { o, c }; });
    const known = new Set(toolOptions.map((o) => o.key));
    const extra = (a?.tools ?? []).filter((t) => !toolOptions.some((o) => norm(t) === o.key || (o.key.includes(norm(t)) && norm(t).length > 2)) && !known.has(norm(t)));
    const skillBoxes = st.skills.map((s) => { const c = h('input', { type: 'checkbox' }); c.checked = (a?.skills ?? []).includes(s.name); return { s, c }; });
    const checks = (items: Array<{ label: string; c: HTMLInputElement }>) => { const box = el('div', 'op-checks'); for (const i of items) box.append(h('label', { class: 'op-check' }, i.c, h('span', { text: i.label }))); return box; };
    // sistema do agente: pasta + comando + porta (local), endereço (url) ou nada (visual)
    const sys = a?.system;
    const sysType = this.select([['visual', 'Nenhum (o agente só representa uma função)'], ['local', 'Local: um sistema no meu computador'], ['url', 'Endereço: um sistema que já está na internet']], sys?.type ?? 'visual');
    const sysName = h('input', { type: 'text' }); sysName.value = sys?.name ?? ''; sysName.maxLength = 60; sysName.placeholder = 'Ex.: Loja, CRM, Painel';
    const sysFolder = h('input', { type: 'text' }); sysFolder.value = sys?.folder ?? ''; sysFolder.placeholder = 'Ex.: D:/projetos/loja (caminho completo)';
    const sysCommand = h('input', { type: 'text' }); sysCommand.value = sys?.command ?? ''; sysCommand.maxLength = 300; sysCommand.placeholder = 'Ex.: npm start';
    const sysPort = h('input', { type: 'number' }); sysPort.value = sys?.port ? String(sys.port) : ''; sysPort.min = '1'; sysPort.max = '65535'; sysPort.placeholder = 'Ex.: 3000';
    const sysUrl = h('input', { type: 'text' }); sysUrl.value = sys?.url ?? ''; sysUrl.placeholder = 'https://meusistema.com.br';
    const sysAuto = h('input', { type: 'checkbox' }); sysAuto.checked = sys?.autoRestart !== false;
    const sysLocal = h('div', { class: 'op-sys-local' }, this.field('Pasta do projeto', sysFolder), this.field('Comando para ligar', sysCommand), this.field('Porta', sysPort),
      h('label', { class: 'op-check' }, sysAuto, h('span', { text: 'Se cair, ligar de novo sozinho (até 3 tentativas; você recebe um aviso no Telegram)' })));
    const sysRemote = h('div', { class: 'op-sys-url' }, this.field('Endereço', sysUrl), h('p', { class: 'op-muted', text: 'Endereço na internet: o escritório só vigia e avisa se sair do ar. Não liga nem reinicia.' }));
    const sysBox = h('div', {}, this.field('Nome do sistema', sysName), sysLocal, sysRemote);
    const syncSys = () => { sysBox.hidden = sysType.value === 'visual'; sysLocal.hidden = sysType.value !== 'local'; sysRemote.hidden = sysType.value !== 'url'; };
    sysType.addEventListener('change', syncSys);
    syncSys();
    // horário de trabalho: fora dele o agente vai para o lounge sozinho
    const hs = a?.hours;
    const useHours = h('input', { type: 'checkbox' }); useHours.checked = !!hs;
    const hStart = h('input', { type: 'time' }); hStart.value = hs?.start ?? '09:00';
    const hEnd = h('input', { type: 'time' }); hEnd.value = hs?.end ?? '18:00';
    const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const dayBoxes = DAYS.map((l, i) => { const c = h('input', { type: 'checkbox' }); c.checked = hs ? hs.days.includes(i) : i >= 1 && i <= 5; c.setAttribute('aria-label', DAY_NAMES[i]); return { l, i, c }; });
    const daysRow = el('div', 'op-checks'); for (const d of dayBoxes) daysRow.append(h('label', { class: 'op-check', title: DAY_NAMES[d.i] }, d.c, h('span', { text: d.l })));
    const hoursBox = h('div', {}, this.field('Início', hStart), this.field('Fim', hEnd), this.field('Dias', daysRow));
    const syncHours = () => { hoursBox.hidden = !useHours.checked; };
    useHours.addEventListener('change', syncHours);
    syncHours();
    this.body.append(
      el('h3', 'bd-group', a ? `Editar ${a.name}` : 'Novo agente'),
      this.field('Nome', name), this.field('Cargo', role), this.field('O que faz (uma frase)', does), this.field('Instruções fixas (brief)', brief),
      this.field('Sala de casa', room), this.field('Tipo', type), this.field('Conta (Claude ou Codex)', account), this.field('Modelo', model), this.field('Esforço', effort),
      el('h3', 'bd-group', 'Ferramentas'), checks(toolBoxes.map(({ o, c }) => ({ label: o.label, c }))),
      ...(skillBoxes.length ? [el('h3', 'bd-group', 'Skills'), checks(skillBoxes.map(({ s, c }) => ({ label: s.name, c })))] : []),
      el('h3', 'bd-group', 'Sistema do agente'), this.field('Tipo', sysType), sysBox,
      el('h3', 'bd-group', 'Horário de trabalho'),
      h('label', { class: 'op-check' }, useHours, h('span', { text: 'Este agente tem horário de trabalho' })),
      h('p', { class: 'op-muted', text: 'Sem horário, o agente fica sempre em serviço. Fora do horário ele vai para o lounge sozinho; dentro, volta para a estação.' }),
      hoursBox,
      h('div', { class: 'op-row' },
        btn(a ? 'Salvar' : 'Criar agente', () => void save(), 'bd-btn bd-btn--primary'),
        btn('Cancelar', () => { this.editing = null; this.render(); })),
    );
    const save = async () => {
      const tools = [...toolBoxes.filter((x) => x.c.checked).map((x) => x.o.key), ...extra];
      const payload = { name: name.value, role: role.value, does: does.value, brief: brief.value, room: room.value, type: type.value, account: account.value, model: model.value, effort: effort.value, tools, skills: skillBoxes.filter((x) => x.c.checked).map((x) => x.s.name),
        hours: useHours.checked ? { start: hStart.value, end: hEnd.value, days: dayBoxes.filter((d) => d.c.checked).map((d) => d.i) } : null,
        system: sysType.value === 'local' ? { type: 'local', name: sysName.value, folder: sysFolder.value, command: sysCommand.value, port: Number(sysPort.value), autoRestart: sysAuto.checked } : sysType.value === 'url' ? { type: 'url', name: sysName.value, url: sysUrl.value } : null };
      const r = a ? await this.call(`/api/ops/agents/${encodeURIComponent(a.id)}`, 'PUT', payload) : await this.call('/api/ops/agents', 'POST', { id: slug(name.value), ...payload });
      if (r.ok) { this.say(a ? 'Agente salvo.' : 'Agente criado.'); this.editing = null; await this.load(); }
    };
  }

  // ------------------------------------------------------------ tarefas
  private tasksTab(): void {
    const st = this.st!;
    const agent = this.select(st.agents.map((a) => [a.id, `${a.name}${a.type === 'dev' ? ' (dev)' : ''}`] as [string, string]), this.drafts.taskAgent || st.agents[0]?.id || '');
    const room = this.select([['', 'Automática (a que a tarefa citar, ou a casa do agente)'], ...st.rooms.filter((r) => r.kind !== 'meeting').map((r) => [r.id, r.name] as [string, string])], '');
    const text = h('textarea', {}); text.rows = 4; text.value = this.drafts.taskText || ''; text.placeholder = 'Descreva a tarefa em português. Ex.: pesquise 3 concorrentes do salão e proponha 3 anúncios.';
    text.addEventListener('input', () => { this.drafts.taskText = text.value; });
    agent.addEventListener('change', () => { this.drafts.taskAgent = agent.value; });
    this.body.append(
      this.field('Agente', agent), this.field('Sala', room), this.field('Tarefa', text),
      btn('Enviar tarefa', async () => {
        const r = await this.call('/api/ops/tasks', 'POST', { agent: agent.value, room: room.value, text: text.value });
        if (r.ok) { this.drafts.taskText = ''; this.say('Tarefa na fila. O agente vai até a sala e trabalha.'); await this.load(); }
      }, 'bd-btn bd-btn--primary'),
    );
    const waiting = st.tasks.filter((t) => t.state === 'waiting');
    if (waiting.length) this.body.append(el('h3', 'bd-group', `Esperando seu OK (${waiting.length})`), ...waiting.map((t) => this.devCard(t)));
    this.body.append(el('h3', 'bd-group', 'Tarefas recentes'));
    const rest = st.tasks.filter((t) => t.state !== 'waiting');
    if (!rest.length) this.body.append(el('p', 'op-muted', 'Nenhuma tarefa ainda.'));
    for (const t of rest) this.body.append(this.taskCard(t));
  }

  /** Etapa de agente dev esperando aprovação: o que o agente disse, o diff e os botões. */
  private devCard(t: Task): HTMLElement {
    const st = this.st!;
    const who = st.agents.find((a) => a.id === t.agent)?.name ?? t.agent;
    const stage = t.dev?.stage ?? 'plan';
    const text = t.dev?.stages.find((s) => s.stage === stage)?.text ?? '';
    const card = el('div', 'op-card op-card--col');
    const feedback = h('input', { type: 'text' }); feedback.placeholder = 'Se recusar: o que o agente deve mudar';
    card.append(
      h('div', {}, h('strong', { text: `${t.title} · ${STAGE_LABEL[stage]}` }), h('span', { class: 'op-badge op-badge--waiting', text: 'Esperando seu OK' }), h('span', { class: 'op-muted', text: ` ${who} · ${t.project ?? ''}` })),
      h('pre', { class: 'op-pre', text }),
    );
    if (t.diff) card.append(h('details', {}, h('summary', { text: `Alterações no projeto: ${t.diff.stat.split('\n').pop() ?? ''}` }), h('pre', { class: 'op-pre', text: `${t.diff.stat}\n\n${t.diff.patch}` })));
    card.append(
      stage === 'test' ? el('p', 'op-muted', 'Aprovar aqui faz o commit no repositório (nunca push nem deploy). Dá para desfazer com git revert.') : el('p', 'op-muted', stage === 'plan' ? 'Aprovar libera o agente a mexer nos arquivos do projeto.' : 'Aprovar passa para a etapa de testes.'),
      feedback,
      h('div', { class: 'op-row' },
        btn(stage === 'test' ? 'Aprovar e commitar' : 'Aprovar', async () => { const r = await this.call(`/api/ops/tasks/${t.id}/approve`, 'POST', {}); if (r.ok) { this.say(r.data.commit ? `Commit ${String(r.data.commit)} feito no projeto.` : 'Aprovado.'); await this.load(); } }, 'bd-btn bd-btn--primary'),
        btn('Recusar e refazer', async () => { const r = await this.call(`/api/ops/tasks/${t.id}/reject`, 'POST', { feedback: feedback.value }); if (r.ok) { this.say('O agente vai refazer esta etapa.'); await this.load(); } }, 'bd-btn bd-btn--danger')),
    );
    return card;
  }

  private taskCard(t: Task): HTMLElement {
    const st = this.st!;
    const who = st.agents.find((a) => a.id === t.agent)?.name ?? t.agent;
    const det = h('details', { class: 'op-card' });
    const label = t.error ? 'Falhou' : STATE_LABEL[t.state];
    det.append(h('summary', {}, h('strong', { text: t.title }), h('span', { class: `op-badge op-badge--${t.error ? 'bad' : t.state}`, text: label }), h('span', { class: 'op-muted', text: ` ${who} · ${when(t.addedAt)}${t.routine ? ' · rotina' : ''}` })));
    det.append(h('pre', { class: 'op-pre', text: t.error ? `Erro: ${t.error}` : t.result || (t.state === 'done' ? '(sem resultado)' : 'Ainda não terminou.') }));
    if (t.commit) det.append(h('p', { class: 'op-muted', text: `Commit ${t.commit} em ${t.project ?? ''}` }));
    if (t.note) det.append(h('p', { class: 'op-muted', text: `Nota no cérebro: Entregas/${t.note}` }));
    if (t.state === 'done' && !t.dev) det.append(this.retryBox(t));
    if (t.state !== 'doing') det.append(btn('Remover da lista', async () => { await this.call(`/api/ops/tasks/${t.id}`, 'DELETE'); await this.load(); }));
    return det;
  }

  /** O agente foi barrado por uma ferramenta? O dono escolhe se libera (só para esta tarefa) e a tarefa é refeita. */
  private retryBox(t: Task): HTMLElement {
    const box = el('div', 'op-retry');
    const denied = t.denied ?? [];
    const manual = h('input', { type: 'text' }); manual.placeholder = 'Liberar outra ferramenta (nome exato, ex.: mcp__meta-ads__pause_campaign)';
    const checks = denied.map((d) => { const c = h('input', { type: 'checkbox' }); c.checked = true; return { d, c }; });
    box.append(el('p', 'op-muted', denied.length ? 'O agente tentou usar ferramentas que estão bloqueadas. Se você libera, a tarefa é refeita com elas só desta vez.' : 'O agente disse que uma ferramenta estava bloqueada? Libere pelo nome exato e refaça só esta tarefa.'));
    for (const { d, c } of checks) box.append(h('label', { class: 'op-check' }, c, h('span', { text: d })));
    box.append(manual, btn('Liberar e refazer a tarefa', async () => {
      const allow = [...checks.filter((x) => x.c.checked).map((x) => x.d), ...(manual.value.trim() ? [manual.value.trim()] : [])];
      if (!allow.length) return this.say('Escolha ao menos uma ferramenta para liberar.', true);
      const r = await this.call(`/api/ops/tasks/${t.id}/retry`, 'POST', { allow });
      if (r.ok) { this.say('Tarefa refeita com as ferramentas liberadas.'); await this.load(); }
    }));
    return box;
  }

  // ------------------------------------------------------------ rotinas
  private routinesTab(): void {
    const st = this.st!;
    const agent = this.select(st.agents.map((a) => [a.id, a.name] as [string, string]), this.drafts.rAgent || st.agents[0]?.id || '');
    const title = h('input', { type: 'text' }); title.value = this.drafts.rTitle || ''; title.placeholder = 'Nome da rotina (opcional)';
    const text = h('textarea', {}); text.rows = 3; text.value = this.drafts.rText || ''; text.placeholder = 'O que o agente faz toda vez. Ex.: sugira o post de hoje para o Instagram do salão.';
    const whenIn = h('input', { type: 'text' }); whenIn.value = this.drafts.rWhen || ''; whenIn.placeholder = 'Quando, em português. Ex.: dias úteis às 8h · toda segunda e quinta às 9h30 · de hora em hora das 9 às 17';
    for (const [k, i] of [['rTitle', title], ['rText', text], ['rWhen', whenIn]] as const) i.addEventListener('input', () => { this.drafts[k] = (i as HTMLInputElement).value; });
    agent.addEventListener('change', () => { this.drafts.rAgent = agent.value; });
    this.body.append(
      el('p', 'op-muted', 'A rotina vira uma tarefa do agente na hora marcada, enquanto o escritório estiver aberto. Se a conta do agente já usou 80% da janela de 5 horas, a rotina espera.'),
      this.field('Agente', agent), this.field('Nome', title), this.field('O que fazer', text), this.field('Quando', whenIn),
      btn('Criar rotina', async () => {
        const r = await this.call('/api/ops/routines', 'POST', { agent: agent.value, title: title.value, text: text.value, when: whenIn.value });
        if (r.ok) { this.drafts.rText = ''; this.drafts.rWhen = ''; this.drafts.rTitle = ''; this.say(`Rotina criada: ${String(r.data.whenLabel)}.`); await this.load(); }
      }, 'bd-btn bd-btn--primary'),
      el('h3', 'bd-group', 'Rotinas'),
    );
    if (!st.routines.length) this.body.append(el('p', 'op-muted', 'Nenhuma rotina ainda.'));
    for (const r of st.routines) {
      const who = st.agents.find((a) => a.id === r.agent)?.name ?? r.agent;
      this.body.append(h('div', { class: 'op-card' },
        h('div', { class: 'op-card__main' }, h('strong', { text: r.title }), h('span', { class: `op-badge op-badge--${r.paused ? 'next' : 'doing'}`, text: r.paused ? 'Pausada' : 'Ativa' }),
          h('p', { class: 'op-muted', text: `${who} · ${r.whenLabel}${r.lastRun ? ` · última: ${when(r.lastRun)}` : ''}` }), h('p', { class: 'op-muted', text: r.text.slice(0, 160) }),
          ...(r.history?.length ? [h('details', { class: 'op-history' }, h('summary', { class: 'op-muted', text: `Últimas ${r.history.length} execuções` }),
            ...r.history.map((e) => h('p', { class: 'op-muted', title: e.result, text: `${e.ok ? '✓' : '✗'} ${when(e.startedAt)} → ${when(e.finishedAt)} · ${e.result.replace(/\s+/g, ' ').slice(0, 80)}` })))] : [])),
        btn('Rodar agora', async () => { const x = await this.call(`/api/ops/routines/${r.id}/run`, 'POST', {}); if (x.ok) { this.say('Tarefa da rotina na fila.'); await this.load(); } }),
        btn(r.paused ? 'Retomar' : 'Pausar', async () => { await this.call(`/api/ops/routines/${r.id}/${r.paused ? 'resume' : 'pause'}`, 'POST', {}); await this.load(); }),
        btn('Excluir', async () => { if (!window.confirm(`Excluir a rotina "${r.title}"?`)) return; await this.call(`/api/ops/routines/${r.id}`, 'DELETE'); await this.load(); }, 'bd-btn bd-btn--danger'),
      ));
    }
  }

  // ------------------------------------------------------------ reuniões
  /** "Copiar prompt": a ata pronta para colar num agente. O aviso "Copiado." sobrevive ao redesenho da lista (5 s). */
  private copiedAt = new Map<string, number>();
  private copyPromptRow(m: Meeting, names: string): HTMLElement {
    const note = h('span', { class: 'op-muted', text: Date.now() - (this.copiedAt.get(m.id) ?? 0) < 5000 ? 'Copiado.' : '' });
    const b = btn('Copiar prompt', async () => {
      const ok = await copyText(buildMeetingPrompt({ objective: m.objective, participants: names.split(', '), at: m.doneAt ?? m.createdAt ?? Date.now(), minutes: m.minutes ?? '' }));
      if (ok) this.copiedAt.set(m.id, Date.now());
      note.textContent = ok ? 'Copiado.' : 'Não consegui copiar: selecione a ata e copie à mão.';
      window.setTimeout(() => { if (note.isConnected) note.textContent = ''; }, 5000);
    });
    return h('div', { class: 'op-copy' }, b, note);
  }

  /** Resumo da reunião: decisões e próximos passos; cada passo vira tarefa de um agente com um botão (uma vez só). */
  private summaryBlock(m: Meeting): HTMLElement | null {
    const sum = m.summary;
    if (!sum || (!sum.decisions.length && !sum.steps.length)) return null;
    const st = this.st!;
    const box = el('div', 'op-summary');
    box.append(el('h3', 'bd-group', 'Resumo'));
    if (sum.decisions.length) box.append(h('ul', { class: 'op-list' }, ...sum.decisions.map((d) => h('li', { text: d }))));
    if (sum.steps.length) box.append(el('h3', 'bd-group', 'Próximos passos'));
    for (const step of sum.steps) {
      const row = el('div', 'op-row');
      row.append(h('span', { text: step.text }));
      if (step.task) { row.append(h('span', { class: 'op-badge op-badge--done', text: `Virou tarefa de ${st.agents.find((a) => a.id === step.agent)?.name ?? step.agent ?? 'agente'}` })); box.append(row); continue; }
      const who = this.select(st.agents.map((a) => [a.id, a.name] as [string, string]), step.owner || m.participants[0] || '');
      row.append(who, btn('Virar tarefa', async () => {
        const r = await this.call(`/api/ops/meetings/${m.id}/steps/${step.id}/task`, 'POST', { agent: who.value });
        if (r.ok) { this.say('Tarefa criada.'); await this.load(); }
      }));
      box.append(row);
    }
    return box;
  }

  private meetingsTab(): void {
    const st = this.st!;
    const goal = h('input', { type: 'text' }); goal.value = this.drafts.goal || ''; goal.placeholder = 'Objetivo em uma frase. Ex.: definir a campanha de Natal';
    goal.addEventListener('input', () => { this.drafts.goal = goal.value; });
    const rounds = h('input', { type: 'text' }); rounds.value = this.drafts.rounds || '3';
    rounds.addEventListener('input', () => { this.drafts.rounds = rounds.value; });
    const picks = st.agents.map((a) => { const c = h('input', { type: 'checkbox' }); c.checked = (this.drafts.who || '').split(',').includes(a.id); c.addEventListener('change', () => { this.drafts.who = picks.filter((p) => p.c.checked).map((p) => p.a.id).join(','); }); return { a, c }; });
    this.body.append(
      this.field('Objetivo', goal), this.field('Rodadas (1 a 10)', rounds),
      el('h3', 'bd-group', `Participantes (mínimo 2, até ${st.limits.meetingParticipants})`),
      (() => { const box = el('div', 'op-checks'); for (const p of picks) box.append(h('label', { class: 'op-check' }, p.c, h('span', { text: p.a.name }))); return box; })(),
      el('p', 'op-muted', 'Cada participante fala uma vez por rodada, em até 120 palavras. O primeiro da lista escreve a ata no cérebro. Todos andam até a sala de reunião.'),
      btn('Iniciar reunião', async () => {
        const r = await this.call('/api/ops/meetings', 'POST', { objective: goal.value, participants: picks.filter((p) => p.c.checked).map((p) => p.a.id), rounds: Number(rounds.value) });
        if (r.ok) { this.say('Reunião começou. Os participantes vão para a sala.'); this.drafts.goal = ''; await this.load(); }
      }, 'bd-btn bd-btn--primary'),
      el('h3', 'bd-group', 'Reuniões recentes'),
    );
    if (!st.meetings.length) this.body.append(el('p', 'op-muted', 'Nenhuma reunião ainda.'));
    for (const m of st.meetings) {
      const names = m.participants.map((id) => st.agents.find((a) => a.id === id)?.name ?? id).join(', ');
      const det = h('details', { class: 'op-card' });
      det.open = m.state === 'running';
      det.append(h('summary', {}, h('strong', { text: m.objective }), h('span', { class: `op-badge op-badge--${m.state === 'done' ? 'done' : m.state === 'running' ? 'doing' : m.state === 'interrupted' ? 'bad' : 'next'}`, text: STATE_LABEL[m.state] ?? m.state }), h('span', { class: 'op-muted', text: ` ${names} · ${m.turns.length}/${m.participants.length * m.rounds} falas` })));
      for (const t of m.turns) det.append(h('p', { class: 'op-turn' }, h('strong', { text: `${t.name} (rodada ${t.round}): ` }), h('span', { text: t.text })));
      if (m.minutes) det.append(el('h3', 'bd-group', `Ata${m.note ? ` (Reunioes/${m.note})` : ''}`), h('pre', { class: 'op-pre', text: m.minutes }));
      const summary = m.state === 'done' ? this.summaryBlock(m) : null;
      if (summary) det.append(summary);
      if (m.minutes && m.state === 'done') det.append(this.copyPromptRow(m, names));
      if (m.error) det.append(h('p', { class: 'op-muted', text: `Erro: ${m.error}` }));
      if (m.state === 'running' || m.state === 'queued') det.append(btn('Cancelar reunião', async () => {
        if (!window.confirm(`Cancelar a reunião "${m.objective}"? Ela para agora, sem ata e sem mensagem aos participantes.`)) return;
        const r = await this.call(`/api/ops/meetings/${m.id}/cancel`, 'POST');
        if (r.ok) this.say('Reunião cancelada.');
        await this.load(); // também atualiza quando ela já tinha terminado (a lista estava velha)
      }, 'bd-btn bd-btn--danger'));
      this.body.append(det);
    }
  }

  // ------------------------------------------------------------ contas
  private usageBar(label: string, w?: Window): HTMLElement {
    const pct = w ? Math.round(w.utilization) : null;
    const bar = h('div', { class: `op-meter__bar${pct !== null && pct >= 95 ? ' is-crit' : pct !== null && pct >= 80 ? ' is-warn' : ''}` });
    bar.style.setProperty('--w', `${pct ?? 0}%`);
    return h('div', { class: 'op-meter' }, h('span', { class: 'op-meter__label', text: label }), bar, h('span', { class: 'op-muted', text: pct === null ? 'sem dados' : `${pct}%${w?.resetsAt ? ` · renova ${when(w.resetsAt)}` : ''}` }));
  }

  private accountsTab(): void {
    const st = this.st!;
    const guide = el('div', 'op-guide');
    guide.append(
      el('h3', 'bd-group', 'Como conectar uma conta, em 3 passos'),
      h('ol', {}, h('li', { text: 'Clique em Conectar na conta (ou em "Adicionar e conectar" para uma nova).' }), h('li', { text: 'Uma janela de terminal abre e o navegador vai para a página de login. Entre com a conta que quer usar. Se aparecer um código, cole na janela preta.' }),
        h('li', { text: 'Pronto: esta tela percebe sozinha, mostra "Conectada" e já busca o seu uso de 5 horas e da semana. Não precisa fazer mais nada.' })),
      el('p', 'op-muted', 'O escritório nunca lê nem guarda senha ou token: só confere se o login existe na pasta da conta. Cada agente usa a conta escolhida nele (aba Agentes).'),
    );
    this.body.append(guide);
    for (const a of st.accounts) {
      const waiting = this.waiting.has(a.id) && a.state !== 'connected';
      const row = el('div', 'op-card op-card--col');
      const top = el('div', 'op-card__top');
      top.append(
        h('span', { class: 'op-chip', text: a.letter, style: `background:${a.color}` }),
        h('div', { class: 'op-card__main' }, h('strong', { text: a.name }), h('span', { class: 'op-muted', text: ` · ${a.provider === 'codex' ? 'Codex' : 'Claude'}${a.principal ? ' · login padrão da máquina' : ''}` }),
          h('p', { class: `op-badge op-badge--${a.state === 'connected' ? 'done' : waiting ? 'doing' : 'bad'}`, text: a.state === 'connected' ? 'Conectada' : waiting ? 'Aguardando você entrar no navegador…' : a.cli?.installed === false ? 'Codex não instalado' : 'Sem login' })),
        btn(a.state === 'connected' ? 'Reconectar' : 'Conectar', () => void this.connect(a), a.state === 'connected' ? 'bd-btn' : 'bd-btn bd-btn--primary'),
        ...(a.provider === 'claude' && a.state === 'connected' ? [btn('Atualizar uso', async () => { this.say('Consultando o uso (uma chamada mínima ao Claude)…'); const r = await this.call(`/api/ops/accounts/${encodeURIComponent(a.id)}/probe`, 'POST'); if (r.ok) { this.say('Uso atualizado.'); await this.load(); } })] : []),
        ...(a.principal ? [] : [btn('Remover', async () => { if (!window.confirm(`Tirar a conta ${a.name} da lista? O login dela não é apagado.`)) return; const r = await this.call(`/api/ops/accounts/${encodeURIComponent(a.id)}`, 'DELETE'); if (r.ok) await this.load(); }, 'bd-btn bd-btn--danger')]),
      );
      row.append(top);
      if (a.dir) row.append(el('p', 'op-muted', `Pasta do login: ${a.dir}`));
      if (a.provider === 'codex' && a.state !== 'connected' && !waiting) row.append(el('p', 'op-muted', a.cli?.installed === false
        ? 'O Codex não está instalado neste computador. Instale com "npm i -g @openai/codex" no terminal e depois conecte.'
        : 'Para conectar a sua conta do ChatGPT, clique em Conectar ou rode "codex login" num terminal e entre no navegador. O escritório só pergunta ao Codex se o login existe.'));
      if (waiting) row.append(el('p', 'op-muted', 'Conclua o login na janela do navegador que abriu. Se nada abriu, olhe a janela preta do terminal: ela mostra o endereço de login.'));
      if (a.provider === 'claude' && a.state === 'connected') row.append(this.usageBar('5 horas', a.usage?.fiveHour), this.usageBar('Semana', a.usage?.sevenDay));
      this.body.append(row);
    }
    const name = h('input', { type: 'text' }); name.placeholder = 'Nome da conta. Ex.: Empresa, Pessoal'; name.maxLength = 24;
    const prov = this.select([['claude', 'Claude Code'], ['codex', 'Codex']], 'claude');
    this.body.append(
      el('h3', 'bd-group', 'Adicionar conta'), this.field('Nome', name), this.field('Ferramenta', prov),
      btn('Adicionar e conectar', async () => {
        const r = await this.call('/api/ops/accounts', 'POST', { name: name.value, provider: prov.value });
        if (!r.ok) return;
        name.value = '';
        await this.load();
        const created = this.st?.accounts.find((a) => a.id === String(r.data.id));
        if (created) await this.connect(created);
      }, 'bd-btn bd-btn--primary'),
    );
  }
}
