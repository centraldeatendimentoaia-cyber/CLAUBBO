// Abas "Contratar" (catálogo de agentes prontos) e "Empresa" (ficha que todo agente lê) de Operações.
// Falam com /api/catalog, /api/catalog/:id/hire e /api/company da própria porta. Texto do servidor entra só como textContent.
import { h } from './dom';

interface Entry { id: string; name: string; role: string; does: string; category: string; type: string; tools: string[]; needs: string[]; model: string; hired: boolean }
type Say = (text: string, bad?: boolean) => void;
/** Diz se esta tela ainda é a que está aberta (a resposta do servidor pode chegar depois de trocar de aba). */
type Live = () => boolean;

const CATEGORY: Record<string, string> = { direcao: 'Direção e operação', marketing: 'Marketing', produto: 'Produto e tecnologia', vendas: 'Vendas e atendimento', administrativo: 'Administrativo', inteligencia: 'Inteligência' };

const post = async (url: string, method: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};

/** Catálogo agrupado por área; "Contratar" cria o agente já preenchido e recarrega a lista. */
export async function renderHireTab(body: HTMLElement, rooms: Array<{ id: string; name: string; kind: string }>, say: Say, reload: () => Promise<void>, live: Live): Promise<void> {
  let agents: Entry[] = [];
  try { agents = ((await (await fetch('/api/catalog')).json()) as { agents?: Entry[] }).agents ?? []; } catch { say('Não consegui abrir o catálogo.', true); return; }
  if (!live()) return; // a aba mudou enquanto o catálogo carregava
  const wrap = h('div', {});
  if (!agents.length) wrap.append(h('p', { class: 'op-muted', text: 'O catálogo está vazio. Ele é lido de server/catalog/agentes.json.' }));
  const room = h('select', {});
  for (const r of rooms.filter((x) => x.kind !== 'meeting')) room.append(new Option(r.name, r.id));
  if (agents.length) wrap.append(h('label', { class: 'bd-field bd-field--col' }, h('span', { text: 'Sala de casa dos contratados' }), room));
  for (const [cat, label] of Object.entries(CATEGORY)) {
    const list = agents.filter((a) => a.category === cat);
    if (!list.length) continue;
    wrap.append(h('h3', { class: 'bd-group', text: label }));
    for (const a of list) {
      const hireBtn = h('button', { class: 'bd-btn bd-btn--primary', type: 'button', text: a.hired ? 'Já contratado' : 'Contratar' });
      hireBtn.disabled = a.hired;
      hireBtn.addEventListener('click', async () => {
        hireBtn.disabled = true;
        const r = await post(`/api/catalog/${encodeURIComponent(a.id)}/hire`, 'POST', { room: room.value });
        if (r.ok) { say(`${a.name} foi contratado(a).`); await reload(); } else { say(String(r.data.error ?? 'Não consegui contratar.'), true); hireBtn.disabled = false; }
      });
      const needs = a.needs.length ? ` · precisa de: ${a.needs.join(', ')}` : '';
      wrap.append(h('div', { class: 'op-card' },
        h('div', { class: 'op-card__main' }, h('strong', { text: a.name }), h('span', { class: 'op-muted', text: ` · ${a.role}${a.type === 'dev' ? ' · mexe em código' : ''}${needs}` }), h('p', { class: 'op-muted', text: a.does })),
        hireBtn));
    }
  }
  body.append(wrap);
}

/** Ficha da empresa: salva pela rota PUT /api/company; todo agente passa a ler isso no começo de cada resposta. */
export async function renderCompanyTab(body: HTMLElement, say: Say, live: Live): Promise<void> {
  let data: { company: Record<string, string>; labels: Record<string, string> };
  try { data = (await (await fetch('/api/company')).json()) as typeof data; } catch { say('Não consegui abrir a ficha.', true); return; }
  if (!live()) return;
  const inputs = Object.entries(data.labels).map(([key, label]) => {
    const field = key === 'name' ? h('input', { type: 'text' }) : h('textarea', {});
    field.value = data.company[key] ?? '';
    if (field instanceof HTMLTextAreaElement) field.rows = 3;
    return { key, label, field };
  });
  body.append(
    h('p', { class: 'op-muted', text: 'Todo agente lê esta ficha antes de responder. Não coloque senhas, chaves nem dados pessoais de clientes.' }),
    ...inputs.map((i) => h('label', { class: 'bd-field bd-field--col' }, h('span', { text: i.label }), i.field)),
    h('button', { class: 'bd-btn bd-btn--primary', type: 'button', text: 'Salvar ficha', on: { click: async () => {
      const r = await post('/api/company', 'PUT', Object.fromEntries(inputs.map((i) => [i.key, i.field.value])));
      say(r.ok ? 'Ficha salva.' : String(r.data.error ?? 'Não consegui salvar.'), !r.ok);
    } } }),
  );
  await renderCostsSection(body, say, live);
}

interface Costs { today: Record<string, { usd: number; turns: number }>; month: Record<string, { usd: number; turns: number }>; limits: { default: number; agents: Record<string, number> }; agents: Record<string, string> }
const usd = (n = 0): string => `US$ ${n.toFixed(2)}`;

/** Custo por agente (hoje e no mês) e limite diário. Só o Claude informa custo; o Codex não entra na conta. */
export async function renderCostsSection(body: HTMLElement, say: Say, live: Live): Promise<void> {
  let c: Costs;
  try { c = (await (await fetch('/api/costs')).json()) as Costs; } catch { return; }
  if (!live()) return;
  const ids = Object.keys(c.agents);
  const def = h('input', { type: 'number' });
  def.min = '0'; def.step = '0.5'; def.value = c.limits.default ? String(c.limits.default) : '';
  def.placeholder = 'sem limite';
  body.append(
    h('h3', { class: 'bd-group', text: 'Gasto dos agentes' }),
    h('p', { class: 'op-muted', text: 'Valores informados pelo Claude em cada resposta (o Codex não informa). Passou do limite do dia, o agente para até amanhã.' }),
    ...ids.map((id) => h('div', { class: 'op-row' }, h('strong', { text: c.agents[id] }), h('span', { class: 'op-muted', text: `hoje ${usd(c.today[id]?.usd)} · mês ${usd(c.month[id]?.usd)}${c.limits.agents[id] ? ` · limite ${usd(c.limits.agents[id])}` : ''}` }))),
    h('label', { class: 'bd-field bd-field--col' }, h('span', { text: 'Limite diário por agente (US$, vazio = sem limite)' }), def),
    h('button', { class: 'bd-btn', type: 'button', text: 'Salvar limite', on: { click: async () => {
      const r = await post('/api/costs/limits', 'PUT', { default: def.value === '' ? 0 : Number(def.value) });
      say(r.ok ? 'Limite salvo.' : String(r.data.error ?? 'Não consegui salvar.'), !r.ok);
    } } }),
  );
}
