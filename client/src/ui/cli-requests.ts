// Pedidos aos terminais e propostas de agentes (Escritório v2): quando um agente do Escritório pede para acionar um agente
// de terminal (andar 2) ou propõe um agente novo, o pedido espera aqui. Nada é enviado/criado antes do clique em Aprovar.
// O texto vem do servidor e só entra como textContent. GET /api/cli/requests e /api/agent-proposals;
// POST .../:id/approve|reject em cada um.
import { h } from './dom';
import { barBottom } from './bar-place';
import { approveError, collectFailures, type Failure } from './cli-failures';
import { OfficeList } from './offices';
import { BackupList } from './backup';
import { canCancel, requestStage, waitingPrefix } from './cli-status';

interface Pending {
  kind: 'cli' | 'agent' | 'call';
  id: string;
  head: string;
  text: string;
}

interface CliRequest {
  id: string;
  at?: number;
  auto?: boolean;
  retorno?: string;
  from: string;
  agentName: string;
  text: string;
  state: string;
  manualReason?: string;
  manualTrecho?: string;
  error?: string;
}

interface AgentProposal {
  id: string;
  from: string;
  agent?: { name: string; role: string; does: string; brief: string; model: string; tools: string[]; skills: string[]; type: string };
  delete?: string;
  error?: string;
  name?: string;
  role?: string;
  state: string;
}

interface AgentCall {
  id: string;
  fromName: string;
  toName: string;
  text: string;
  state: string;
  error?: string;
}

const PATH = { cli: '/api/cli/requests', agent: '/api/agent-proposals', call: '/api/agent-calls' } as const;

export class CliRequests {
  readonly el: HTMLElement;
  private readonly panel: HTMLElement;
  /** Barra do modo de aprovação: fixa embaixo, no meio da tela, ao lado do feed de atividades. */
  readonly bar: HTMLElement;
  private sig: string | null = null;
  private auto = false;
  private confirming = false;
  private note = '';
  private readonly offices = new OfficeList();
  private readonly backups = new BackupList();
  /** Pedidos vistos esperando nesta página (chave → título): se ficarem `failed`, o erro aparece até o João dispensar. */
  private readonly watched = new Map<string, string>();
  private readonly localFailures = new Map<string, Failure>();
  private readonly dismissed = new Set<string>();
  /** Card "Pedidos": cada pedido com a etapa em que está (esperando, enviado, terminal trabalhando, concluído). */
  private readonly log: HTMLElement;
  private logOpen = false;
  private requests: CliRequest[] = [];
  /** Quantos itens esperam o clique do João (contador da barra e prefixo do título da aba). */
  private waiting = 0;
  private readonly baseTitle = document.title;
  private readonly notified = new Set<string>();
  private firstLoad = true;

  constructor() {
    this.panel = h('div', { class: 'cr', hidden: true });
    this.bar = h('div', { class: 'cr-mode' });
    this.log = h('div', { class: 'cr-off cr-log', hidden: true });
    this.el = h('div', { class: 'cr-wrap' }, this.panel, this.offices.el, this.log, this.backups.el, this.bar);
    window.setInterval(() => void this.refresh(), 2500);
    window.addEventListener('resize', () => this.placeBar());
    window.addEventListener('transitionend', () => this.placeBar());
    window.setInterval(() => this.placeBar(), 1000);
    void this.refresh();
  }

  /** Mantém a barra logo acima do feed (aberto ou fechado): mede o feed na tela em vez de confiar só no CSS. */
  private placeBar(): void {
    const feed = document.querySelector('.ui-feed');
    if (!feed) return;
    const top = feed.getBoundingClientRect().top;
    if (top > 0) this.bar.style.bottom = `${barBottom(window.innerHeight, top)}px`;
    // O painel do terminal para acima da barra (e do feed aberto): ele lê --bar-room, em px, do rodapé da tela até o topo da barra.
    const barTop = this.bar.getBoundingClientRect().top;
    if (barTop > 0) document.documentElement.style.setProperty('--bar-room', `${Math.ceil(window.innerHeight - barTop + 8)}px`);
  }

  /** Selo sempre visível do modo de aprovação dos pedidos aos terminais. Só o clique do João troca o modo. */
  private renderMode(auto: boolean): void {
    this.auto = auto;
    this.bar.className = `cr-mode${auto ? ' cr-mode--auto' : ''}`;
    this.placeBar();
    const label = this.note || (auto ? '⚠ AUTOMÁTICO LIGADO: pedidos aos terminais são enviados sem esperar você (continua ligado se reiniciar)' : 'Pedidos aos terminais: manual');
    const btn = this.confirming
      ? 'Confirmar: ligar automático'
      : auto ? 'Voltar ao manual' : 'Ligar automático';
    this.bar.replaceChildren(
      h('span', { class: 'cr-mode__label', text: this.confirming ? 'Ligar o AUTOMÁTICO?' : this.note ? this.note : auto ? '⚠ AUTOMÁTICO LIGADO' : 'Terminais: manual', title: this.confirming ? 'Os pedidos do Maestro passam a sair sem o seu clique. Continuam esperando você: propor/excluir agente, chamadas entre agentes e pedidos que citam deploy, publicar, pagamento ou apagar.' : label }),
      h('button', { class: 'cr-mode__btn', type: 'button', text: btn, on: { click: () => void this.toggleMode() } }),
      ...(this.waiting > 0 ? [h('button', { class: 'cr-mode__btn cr-mode__wait', type: 'button', text: `${this.waiting} esperando você`, title: 'Pedidos que só andam com o seu clique. Clique para ligar os avisos do navegador.', on: { click: () => void this.askNotify() } })] : []),
      h('button', { class: 'cr-mode__btn', type: 'button', text: 'Pedidos', title: 'Cada pedido aos terminais e em que etapa está', on: { click: () => this.toggleLog() } }),
      h('button', { class: 'cr-mode__btn', type: 'button', text: 'Escritórios', on: { click: () => this.offices.toggle() } }),
      h('button', { class: 'cr-mode__btn', type: 'button', text: 'Backup', title: 'Copiar e restaurar os dados do escritório', on: { click: () => this.backups.toggle() } }),
    );
  }

  private toggleLog(): void {
    this.logOpen = !this.logOpen;
    this.renderLog();
  }

  /** Pede licença para avisar no navegador (só num clique do João). Sem licença, o contador da barra e o título da aba continuam avisando. */
  private async askNotify(): Promise<void> {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    try { await Notification.requestPermission(); } catch { /* sem aviso do navegador */ }
  }

  /** Avisa uma vez de cada item novo esperando você (nada sai da máquina: é a notificação local do navegador). */
  private notifyNew(pending: Pending[]): void {
    for (const r of pending) {
      const key = r.kind + r.id;
      if (this.notified.has(key)) continue;
      this.notified.add(key);
      if (this.firstLoad || typeof Notification === 'undefined' || Notification.permission !== 'granted') continue;
      try { new Notification('Esperando você', { body: r.head, tag: key }); } catch { /* sem aviso */ }
    }
    this.firstLoad = false;
  }

  private async post(url: string, body: unknown = {}): Promise<void> {
    try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch { /* o próximo ciclo mostra o estado real */ }
    this.sig = null;
    await this.refresh();
  }

  /** Lista dos últimos pedidos com a etapa de cada um e o botão de cancelar. */
  private renderLog(): void {
    this.log.hidden = !this.logOpen;
    if (!this.logOpen) return;
    const list = [...this.requests].reverse().slice(0, 12);
    this.log.replaceChildren(
      h('strong', { class: 'cr__title', text: 'Pedidos aos terminais' }),
      ...(list.length ? [] : [h('p', { class: 'cr__text', text: 'Nenhum pedido ainda.' })]),
      ...list.map((r) => {
        const st = requestStage(r);
        return h('div', { class: `cr__item cr-log__item cr-log__item--${st.tone}` },
          h('p', { class: 'cr__head', text: `${r.from} → ${r.agentName}` }),
          h('p', { class: 'cr__text', text: r.text }),
          h('p', { class: 'cr-log__stage', text: r.error ? `${st.label}: ${r.error}` : st.label }),
          ...(canCancel(r) ? [h('div', { class: 'cr__btns' }, h('button', { class: 'cr__no', type: 'button', text: r.state === 'pending' ? 'Cancelar pedido' : 'Parar de esperar o retorno', on: { click: () => void this.post(`${PATH.cli}/${encodeURIComponent(r.id)}/cancel`) } }))] : []),
        );
      }),
    );
  }

  /** Liga/desliga o automático. A confirmação é na própria barra (o confirm do navegador pode ser bloqueado) e erros aparecem na tela. */
  private async toggleMode(): Promise<void> {
    if (!this.auto && !this.confirming) {
      this.confirming = true;
      this.note = '';
      this.renderMode(this.auto);
      window.setTimeout(() => { if (this.confirming) { this.confirming = false; this.renderMode(this.auto); } }, 10_000);
      return;
    }
    this.confirming = false;
    try {
      const res = await fetch('/api/cli/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: this.auto ? 'manual' : 'auto' }) });
      const data = (await res.json().catch(() => ({}))) as { mode?: string; error?: string };
      if (!res.ok) { this.note = `Não consegui trocar o modo: ${data.error ?? `erro ${res.status}`}`; this.renderMode(this.auto); return; }
      this.note = '';
      this.renderMode(data.mode === 'auto');
    } catch {
      this.note = 'Não consegui falar com o servidor para trocar o modo.';
      this.renderMode(this.auto);
    }
  }

  private async refresh(): Promise<void> {
    try {
      const [cli, props, callsRes, modeRes] = await Promise.all([fetch(PATH.cli), fetch(PATH.agent), fetch(PATH.call), fetch('/api/cli/mode')]);
      if (!cli.ok || !props.ok || !callsRes.ok) return;
      if (modeRes.ok) {
        const auto = ((await modeRes.json()) as { mode: string }).mode === 'auto';
        if (auto !== this.auto || !this.bar.firstChild) this.renderMode(auto);
      }
      const requests = ((await cli.json()) as { requests: CliRequest[] }).requests;
      this.requests = requests;
      const proposals = ((await props.json()) as { proposals: AgentProposal[] }).proposals;
      const calls = ((await callsRes.json()) as { calls: AgentCall[] }).calls;
      const pending: Pending[] = [
        ...calls.filter((r) => r.state === 'pending').map((r): Pending => ({ kind: 'call', id: r.id, head: `${r.fromName} quer conversar com ${r.toName}`, text: `[sempre exige seu clique: o modo automático só vale para pedidos aos terminais]\n${r.text}` })),
        ...requests.filter((r) => r.state === 'pending').map((r): Pending => ({ kind: 'cli', id: r.id, head: `${r.from} quer acionar ${r.agentName}`, text: r.manualReason ? `[exige seu clique mesmo no automático: ${r.manualReason}${r.manualTrecho ? ` — trecho: "${r.manualTrecho}"` : ''}]
${r.text}` : r.text })),
        ...proposals.filter((r) => r.state === 'pending').map((r): Pending => {
          const a = r.agent;
          if (!a) return { kind: 'agent', id: r.id, head: `${r.from} quer EXCLUIR o agente ${r.name}`, text: `[sempre exige seu clique: o modo automático não vale aqui]\n${r.role || ''}\nExclusão permanente.` };
          const text = ['[sempre exige seu clique: o modo automático não vale aqui]', a.role, a.does, `modelo: ${a.model || 'padrão'} · tipo: ${a.type} · ferramentas: ${a.tools.join(', ') || 'nenhuma'} · skills: ${a.skills.join(', ') || 'nenhuma'}`, a.brief].filter(Boolean).join('\n');
          return { kind: 'agent', id: r.id, head: `${r.from} propõe o agente ${a.name}`, text };
        }),
      ];
      for (const r of pending) this.watched.set(r.kind + r.id, r.head);
      this.notifyNew(pending);
      const listed = [
        ...requests.map((r) => ({ key: 'cli' + r.id, state: r.state, error: r.error })),
        ...proposals.map((r) => ({ key: 'agent' + r.id, state: r.state, error: r.error })),
        ...calls.map((r) => ({ key: 'call' + r.id, state: r.state, error: r.error })),
      ];
      const failures = collectFailures(this.watched, listed, this.localFailures, this.dismissed);
      const sig = pending.map((r) => r.kind + r.id).join(',') + '|' + failures.map((f) => f.key + f.error).join(',') + '|' + requests.map((r) => r.id + r.state + (r.retorno ?? '')).join(',');
      if (sig === this.sig) return;
      this.sig = sig;
      document.title = `${waitingPrefix(pending.length)}${this.baseTitle}`;
      if (pending.length !== this.waiting) { this.waiting = pending.length; this.renderMode(this.auto); }
      this.renderLog();
      this.panel.hidden = pending.length === 0 && failures.length === 0;
      this.panel.replaceChildren(
        ...failures.map((f) =>
          h(
            'div',
            { class: 'cr__item cr__item--erro', role: 'alert' },
            h('p', { class: 'cr__head', text: `Falhou: ${f.head}` }),
            h('p', { class: 'cr__text cr__erro', text: f.error }),
            h('div', { class: 'cr__btns' }, h('button', { class: 'cr__no', type: 'button', text: 'Dispensar', on: { click: () => this.dismiss(f.key) } })),
          ),
        ),
        ...(pending.length ? [h('strong', { class: 'cr__title', text: `Pedidos pendentes (${pending.length})` })] : []),
        ...pending.map((r) =>
          h(
            'div',
            { class: 'cr__item' },
            h('p', { class: 'cr__head', text: r.head }),
            h('p', { class: 'cr__text', text: r.text }),
            h(
              'div',
              { class: 'cr__btns' },
              ...(r.kind === 'cli' ? [h('button', { class: 'cr__move', type: 'button', text: '↑', title: 'Subir na fila', on: { click: () => void this.post(`${PATH.cli}/${encodeURIComponent(r.id)}/move`, { dir: 'up' }) } }), h('button', { class: 'cr__move', type: 'button', text: '↓', title: 'Descer na fila', on: { click: () => void this.post(`${PATH.cli}/${encodeURIComponent(r.id)}/move`, { dir: 'down' }) } })] : []),
              h('button', { class: 'cr__ok', type: 'button', text: r.kind === 'cli' ? 'Aprovar e enviar' : r.kind === 'agent' ? (r.head.includes('EXCLUIR') ? 'Aprovar e excluir' : 'Aprovar e criar') : 'Aprovar esta vez', on: { click: () => void this.decide(r, 'approve') } }),
              ...(r.kind === 'call' ? [h('button', { class: 'cr__ok', type: 'button', text: 'Liberar sempre', on: { click: () => void this.decide(r, 'approve', true) } })] : []),
              h('button', { class: 'cr__no', type: 'button', text: 'Recusar', on: { click: () => void this.decide(r, 'reject') } }),
            ),
          ),
        ),
      );
    } catch {
      // Sem conexão: tenta no próximo ciclo.
    }
  }

  private dismiss(key: string): void {
    this.dismissed.add(key);
    this.localFailures.delete(key);
    this.sig = null;
    void this.refresh();
  }

  private async decide(r: Pending, what: 'approve' | 'reject', always = false): Promise<void> {
    const key = r.kind + r.id;
    this.watched.set(key, r.head);
    try {
      const res = await fetch(`${PATH[r.kind]}/${encodeURIComponent(r.id)}/${what}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ always }) });
      const body = (await res.json().catch(() => ({}))) as { state?: string; error?: string };
      const error = approveError(res.ok, res.status, body);
      if (error && what === 'approve') this.localFailures.set(key, { key, head: r.head, error });
    } catch {
      this.localFailures.set(key, { key, head: r.head, error: 'Não consegui falar com o servidor do escritório.' });
    }
    this.sig = null;
    await this.refresh();
  }
}
