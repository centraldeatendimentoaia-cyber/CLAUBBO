// Lista editável de escritórios (nome + endereço) para onde o João pode levar agentes e pedidos. Fica salva em
// data/offices.json no servidor (GET/POST/PUT/DELETE /api/offices). Textos do servidor entram só como textContent.
// `confirmDestination` é o seletor de destino: mostra o aviso quando o destino não tem o bloqueio de envio novo.
import { h } from './dom';

export interface Office {
  id: string;
  name: string;
  url: string;
  blockSend: boolean;
  self?: boolean;
  aviso?: string;
}

async function call(path: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

export const listOffices = async (): Promise<Office[]> => {
  const res = await fetch('/api/offices');
  return res.ok ? ((await res.json()) as { offices: Office[] }).offices : [];
};

/**
 * Seletor de destino: o João escolhe o escritório. Se o destino não tem o bloqueio de envio novo (o antigo, porta 4520),
 * mostra o aviso e só segue depois do segundo clique. Devolve o escritório escolhido ou null se desistiu.
 */
export function confirmDestination(offices: Office[], anchor: HTMLElement): Promise<Office | null> {
  return new Promise((resolve) => {
    const box = h('div', { class: 'cr-off cr-off--pick' });
    const done = (o: Office | null) => { box.remove(); resolve(o); };
    const show = (o: Office) => {
      box.replaceChildren(
        h('strong', { text: `Levar para: ${o.name}` }),
        h('p', { class: 'cr-off__warn', text: o.aviso ?? '' , hidden: !o.aviso }),
        h('div', { class: 'cr__btns' },
          h('button', { class: 'cr__ok', type: 'button', text: o.aviso ? 'Entendi, levar mesmo assim' : 'Levar', on: { click: () => done(o) } }),
          h('button', { class: 'cr__no', type: 'button', text: 'Voltar', on: { click: () => list() } })));
    };
    const list = () => {
      box.replaceChildren(
        h('strong', { text: 'Escolha o escritório de destino' }),
        ...offices.filter((o) => !o.self).map((o) => h('button', { class: 'cr-off__opt', type: 'button', text: `${o.name} · ${o.url}${o.aviso ? ' ⚠' : ''}`, on: { click: () => show(o) } })),
        h('button', { class: 'cr__no', type: 'button', text: 'Cancelar', on: { click: () => done(null) } }));
    };
    list();
    anchor.append(box);
  });
}

export class OfficeList {
  readonly el: HTMLElement;
  private offices: Office[] = [];
  private msg = '';
  private editing: string | null = null;

  constructor() {
    this.el = h('div', { class: 'cr-off', hidden: true });
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
    if (!this.el.hidden) void this.load();
  }

  private async load(): Promise<void> {
    this.offices = await listOffices().catch(() => []);
    this.render();
  }

  private say(text: string): void {
    this.msg = text;
    this.render();
  }

  private row(o: Office): HTMLElement {
    if (this.editing !== o.id) {
      return h('div', { class: 'cr-off__row' },
        h('span', { class: 'cr-off__name', text: `${o.name}${o.self ? ' (este)' : ''}` }),
        h('span', { class: 'cr-off__url', text: o.url }),
        h('span', { class: 'cr-off__flag', text: o.blockSend ? 'com bloqueio de envio' : '⚠ sem bloqueio de envio' }),
        h('button', { type: 'button', text: 'Editar', on: { click: () => { this.editing = o.id; this.render(); } } }),
        ...(o.self ? [] : [h('button', { type: 'button', text: 'Remover', on: { click: () => void this.remove(o) } })]));
    }
    const name = h('input'); name.value = o.name; name.maxLength = 40;
    const url = h('input'); url.value = o.url;
    const block = h('input', { type: 'checkbox' }); block.checked = o.blockSend;
    return h('div', { class: 'cr-off__row cr-off__row--edit' }, name, url,
      h('label', {}, block, ' tem o bloqueio de envio novo'),
      h('button', { type: 'button', text: 'Salvar', on: { click: () => void this.save(o.id, name.value, url.value, block.checked) } }),
      h('button', { type: 'button', text: 'Cancelar', on: { click: () => { this.editing = null; this.render(); } } }));
  }

  private render(): void {
    const name = h('input'); name.placeholder = 'Nome (ex.: Escritório antigo)'; name.maxLength = 40;
    const url = h('input'); url.placeholder = 'Porta ou endereço (ex.: 4520 ou http://127.0.0.1:4520)';
    this.el.replaceChildren(
      h('strong', { text: 'Escritórios' }),
      h('p', { class: 'cr-off__hint', text: 'Lista dos escritórios para onde você pode levar agentes e pedidos. Só endereços deste computador. Fica salva no projeto (data/offices.json).' }),
      ...this.offices.map((o) => this.row(o)),
      h('div', { class: 'cr-off__row cr-off__row--new' }, name, url,
        h('button', { type: 'button', text: 'Adicionar', on: { click: () => void this.add(name.value, url.value) } })),
      h('p', { class: 'cr-off__msg', text: this.msg, hidden: !this.msg }));
  }

  private async apply(r: { ok: boolean; data: Record<string, unknown> }, okText: string): Promise<void> {
    if (r.ok) { this.msg = okText; this.editing = null; await this.load(); return; }
    this.say(typeof r.data.error === 'string' ? r.data.error : 'não consegui salvar');
  }

  private async add(name: string, url: string): Promise<void> {
    await this.apply(await call('/api/offices', 'POST', { name, url }), 'Escritório adicionado.');
  }

  private async save(id: string, name: string, url: string, blockSend: boolean): Promise<void> {
    await this.apply(await call(`/api/offices/${encodeURIComponent(id)}`, 'PUT', { name, url, blockSend }), 'Escritório salvo.');
  }

  private async remove(o: Office): Promise<void> {
    if (!window.confirm(`Tirar "${o.name}" da lista?`)) return;
    await this.apply(await call(`/api/offices/${encodeURIComponent(o.id)}`, 'DELETE'), 'Escritório removido da lista.');
  }
}
