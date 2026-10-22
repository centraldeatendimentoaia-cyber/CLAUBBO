import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { HoldingView, PendingItem } from '../../../shared/types';

// Sem jsdom no projeto: um DOM mínimo, só com o que h() e o renderer tocam.
class FakeEl {
  children: (FakeEl | string)[] = [];
  attrs: Record<string, string> = {};
  listeners: Record<string, (() => void)[]> = {};
  className = '';
  title = '';
  hidden = false;
  tabIndex = 0;
  width = 0;
  height = 0;
  getContext(): null { return null; }
  constructor(readonly tag: string) {}
  get textContent(): string { return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
  set textContent(v: string) { this.children = v ? [v] : []; }
  setAttribute(k: string, v: string): void { this.attrs[k] = v; }
  addEventListener(k: string, fn: () => void): void { (this.listeners[k] ??= []).push(fn); }
  append(...n: (FakeEl | string)[]): void { this.children.push(...n); }
  all(): FakeEl[] { return [this, ...this.children.flatMap((c) => (typeof c === 'string' ? [] : c.all()))]; }
}
beforeAll(() => { (globalThis as { document?: unknown }).document = { createElement: (t: string) => new FakeEl(t) }; });

const item = (o: Partial<PendingItem> = {}): PendingItem => ({
  id: 'tarefa:t1', kind: 'tarefa', ref: 't1', stage: 'plan', agent: 'ana', title: 'Plano da landing', text: 'cinco etapas', since: 0, urgent: false,
  cost: false, reversible: true, sendsMessage: false, ownerOnly: false, needsDialog: false, safe: true, ...o,
});
const view = (o: Partial<HoldingView> = {}): HoldingView => ({
  pendencias: [item()], avaliar: [], rotinas: { rodaram: 1, falharam: 0, previstas: 2, lista: [] }, elenco: [], xpHoje: 0, ticker: [], papel: 'dono', ...o,
});
const opts = async () => {
  const { renderHolding } = await import('./holding');
  const on = { acao: vi.fn(), abrir: vi.fn(), lote: vi.fn(), bom: vi.fn() };
  return { renderHolding, on, base: { now: 3_600_000, coins: 130, notes: new Map<string, string>(), avisos: [], abertos: new Set<string>(), ocupados: new Set<string>(), on } };
};
const render = async (v: HoldingView) => { const { renderHolding, base, on } = await opts(); return { el: renderHolding(v, base) as unknown as FakeEl, on }; };
const buttons = (el: FakeEl) => el.all().filter((e) => e.tag === 'button');

describe('painel da holding (renderer)', () => {
  it('o primeiro filho da página é "Esperando você"', async () => {
    const { el } = await render(view());
    const first = el.children[0] as FakeEl;
    expect(first.attrs['aria-label']).toBe('Esperando você');
    expect(first.textContent).toContain('Esperando você');
  });

  it('elenco mostra o distintivo da faixa e as medalhas ganhas, sempre com texto', async () => {
    const { el } = await render(view({ elenco: [{ agent: 'ana', xp: 800, nivel: 5, progresso: 0.5 }], rotinas: { rodaram: 2, falharam: 1, previstas: 0, lista: [] } }));
    const labels = el.all().filter((e) => e.attrs.role === 'img').map((e) => e.attrs['aria-label']);
    expect(labels).toContain('Cometa (nível 5)');
    expect(labels).toContain('Primeiro brilho: Ganhou o primeiro XP');
    expect(labels).toContain('Em ascensão: Chegou ao nível 3');
    expect(labels.some((l) => l.startsWith('Veterano'))).toBe(false);
    expect(labels.some((l) => l.startsWith('Dia limpo'))).toBe(false);
  });

  it('com rotinas rodando sem falha, o indicador de rotinas ganha a medalha "Dia limpo"', async () => {
    const { el } = await render(view({ rotinas: { rodaram: 2, falharam: 0, previstas: 1, lista: [] } }));
    expect(el.all().some((e) => e.attrs.role === 'img' && e.attrs['aria-label']?.startsWith('Dia limpo'))).toBe(true);
  });

  it('título de agente com HTML aparece como texto: nenhum img é criado', async () => {
    const { el } = await render(view({ pendencias: [item({ title: '<img src=x onerror=alert(1)>', agent: '<b>x</b>' })] }));
    expect(el.all().some((e) => e.tag === 'img')).toBe(false);
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('item ownerOnly visto como equipe mostra "aguarda o dono" e nenhum botão de ação', async () => {
    const { el } = await render(view({ papel: 'equipe', pendencias: [item({ ownerOnly: true, safe: false })] }));
    expect(el.textContent).toContain('aguarda o dono');
    expect(buttons(el)).toHaveLength(0);
  });

  it('sem pendências aparece "Nada espera você" e o botão do lote some', async () => {
    const { el } = await render(view({ pendencias: [] }));
    expect(el.textContent).toContain('Nada espera você');
    expect(buttons(el).some((b) => b.textContent.includes('Aprovar os seguros'))).toBe(false);
  });

  it('item seguro aprova por botão; item não seguro só mostra Aprovar depois de aberto', async () => {
    const naoSeguro = item({ id: 'terminal:r1', kind: 'terminal', ref: 'r1', safe: false, ownerOnly: true, sendsMessage: true, reversible: false });
    const { renderHolding, base, on } = await opts();
    const fechado = renderHolding(view({ pendencias: [naoSeguro] }), base) as unknown as FakeEl;
    expect(buttons(fechado).map((b) => b.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Revisar')]));
    expect(buttons(fechado).some((b) => b.textContent.includes('Aprovar'))).toBe(false);
    const aberto = renderHolding(view({ pendencias: [naoSeguro] }), { ...base, abertos: new Set(['terminal:r1']) }) as unknown as FakeEl;
    const aprovar = buttons(aberto).find((b) => b.textContent.includes('Aprovar'))!;
    aprovar.listeners.click[0]();
    expect(on.acao).toHaveBeenCalledWith(naoSeguro, 'aprovar');
    expect(aberto.textContent).toContain('envia mensagem');
  });

  it('"Ficou bom" só para o dono', async () => {
    const avaliar = [{ task: 't9', agent: 'ana', title: 'Feita', doneAt: 1 }];
    const dono = (await render(view({ avaliar }))).el;
    const equipe = (await render(view({ avaliar, papel: 'equipe' }))).el;
    expect(buttons(dono).some((b) => b.textContent === 'Ficou bom')).toBe(true);
    expect(buttons(equipe).some((b) => b.textContent === 'Ficou bom')).toBe(false);
    expect(equipe.textContent).toContain('Feita');
  });

  it('falha de rotina vira triângulo rosa com texto, na lista e no indicador', async () => {
    const lista = [{ id: 'r', title: 'Prospecção', agent: 'ana', whenLabel: '08:00', estado: 'falhou' as const }];
    const { el } = await render(view({ rotinas: { rodaram: 0, falharam: 1, previstas: 1, lista } }));
    const triangulos = el.all().filter((e) => e.className.includes('hold-forma--triangulo'));
    expect(triangulos.length).toBeGreaterThanOrEqual(2);
    expect(el.textContent).toContain('falhou');
  });

  it('sem saldo do servidor (coins null) o KPI mostra traço, nunca um número', async () => {
    const { renderHolding, base } = await opts();
    const el = renderHolding(view(), { ...base, coins: null }) as unknown as FakeEl;
    expect(el.textContent).toContain('—');
    expect(el.textContent).not.toContain('🪙');
  });

  it('indicador de rotinas é rodaram/(rodaram+falharam+previstas) e a carteira se chama moedas do escritório', async () => {
    const { el } = await render(view({ rotinas: { rodaram: 1, falharam: 1, previstas: 2, lista: [] } }));
    expect(el.textContent).toContain('1/4');
    expect(el.textContent).toContain('MOEDAS DO ESCRITÓRIO');
    expect(el.textContent).not.toContain('CARTEIRA');
  });

  it('sem rotinas mostra o estado vazio', async () => {
    const { el } = await render(view());
    expect(el.textContent).toContain('Nenhuma rotina');
  });
});

describe('painel da holding (foco e lote)', () => {
  it('o título "Esperando você" aceita foco programático (destino quando não sobra cartão)', async () => {
    const { el } = await render(view({ pendencias: [] }));
    const titulo = el.all().find((e) => e.attrs['data-k'] === 'titulo')!;
    expect(titulo.tag).toBe('h2');
    expect(titulo.tabIndex).toBe(-1);
  });

  it('lote em andamento mostra o botão desligado com "Enviando…"', async () => {
    const { renderHolding, base } = await opts();
    const el = renderHolding(view(), { ...base, ocupados: new Set(['lote']) }) as unknown as FakeEl;
    const lote = el.all().find((e) => e.attrs['data-k'] === 'lote')!;
    expect('disabled' in lote.attrs).toBe(true);
    expect(lote.textContent).toContain('Enviando…');
    const normal = renderHolding(view(), base) as unknown as FakeEl;
    expect('disabled' in normal.all().find((e) => e.attrs['data-k'] === 'lote')!.attrs).toBe(false);
  });
});
