import { describe, expect, it, vi } from 'vitest';
import { Builder } from './builder';

type Item = { id: string; kind: string; x: number; y: number; dir?: string; variant?: string };
type Internals = { items: Item[]; tool: { kind: string; dir?: string; variant?: string } | null; selected: string; dirty: boolean; [k: string]: unknown };

/** Builder sem DOM: troca o que desenha/lê da tela e deixa a lógica de teclado e mouse real. */
function make(items: Item[] = []) {
  const b = new Builder();
  const i = b as unknown as Internals;
  const status: string[] = [];
  Object.assign(i, {
    items,
    history: [],
    renderAll: vi.fn(),
    draw: vi.fn(),
    setStatus: (t: string) => status.push(t),
    tileAt: (e: { tx: number; ty: number }) => ({ x: e.tx, y: e.ty, px: e.tx * 32, py: e.ty * 32 }),
    close: vi.fn(),
  });
  const key = (k: string, target = 'DIV', extra: object = {}) => (b as unknown as { key(e: object): void }).key({ key: k, target: { tagName: target }, stopPropagation() {}, preventDefault() {}, ...extra });
  const click = (tx: number, ty: number) => (b as unknown as { mouse(e: object, c: boolean): void }).mouse({ tx, ty }, true);
  const rightClick = (tx: number, ty: number) => (b as unknown as { removeAt(e: object): void }).removeAt({ tx, ty });
  return { i, key, click, rightClick, status };
}

const desk: Item = { id: 'd1', kind: 'desk', x: 4, y: 6 };
const puff: Item = { id: 'p1', kind: 'beanbag', x: 11, y: 8 };

describe('atalhos do modo mobiliar', () => {
  it('1. escolher móvel e clicar na sala coloca e seleciona', () => {
    const { i, click } = make([]);
    i.tool = { kind: 'beanbag' };
    click(11, 8);
    expect(i.items).toHaveLength(1);
    expect(i.items[0]).toMatchObject({ kind: 'beanbag', x: 11, y: 8 });
    expect(i.selected).toBe(i.items[0].id);
  });

  it('2. R gira o selecionado', () => {
    const { i, key } = make([{ ...desk }]);
    i.selected = 'd1';
    key('r');
    expect(i.items[0].dir).toBeDefined();
    expect(i.items[0].dir).not.toBe(undefined);
  });

  it('2. R gira o móvel que está sendo colocado (ferramenta)', () => {
    const { i, key } = make([]);
    i.tool = { kind: 'desk' };
    key('R');
    expect(i.tool.dir).toBeDefined();
  });

  it('3. V troca a cor/modelo do selecionado', () => {
    const { i, key } = make([{ ...desk }]);
    i.selected = 'd1';
    key('v');
    expect(i.items[0].variant).toBeDefined();
  });

  it('3. V troca a cor/modelo da ferramenta', () => {
    const { i, key } = make([]);
    i.tool = { kind: 'desk' };
    key('v');
    expect(i.tool.variant).toBeDefined();
  });

  it('4. Delete remove o selecionado', () => {
    const { i, key } = make([{ ...desk }, { ...puff }]);
    i.selected = 'd1';
    key('Delete');
    expect(i.items.map((x) => x.id)).toEqual(['p1']);
    expect(i.selected).toBe('');
  });

  it('5. clique direito num móvel apaga, mesmo com ferramenta ativa', () => {
    const { i, rightClick } = make([{ ...puff }]);
    i.tool = { kind: 'desk' };
    rightClick(11, 8);
    expect(i.items).toHaveLength(0);
  });

  it('5. clique direito no vazio só larga a ferramenta', () => {
    const { i, rightClick } = make([{ ...puff }]);
    i.tool = { kind: 'desk' };
    rightClick(1, 1);
    expect(i.items).toHaveLength(1);
    expect(i.tool).toBeNull();
  });

  it('6. clicar num móvel seleciona; clicar em outro lugar move', () => {
    const { i, click } = make([{ ...puff }]);
    click(11, 8);
    expect(i.selected).toBe('p1');
    click(13, 9);
    expect(i.items[0]).toMatchObject({ x: 13, y: 9 });
  });

  it('6. clicar num móvel com ferramenta ativa seleciona e larga a ferramenta', () => {
    const { i, click } = make([{ ...puff }]);
    i.tool = { kind: 'beanbag' };
    click(11, 8);
    expect(i.selected).toBe('p1');
    expect(i.tool).toBeNull();
    expect(i.items).toHaveLength(1);
  });

  it('digitar em campo de texto não dispara R, V nem Delete', () => {
    for (const target of ['INPUT', 'TEXTAREA', 'SELECT']) {
      const { i, key } = make([{ ...desk }]);
      i.selected = 'd1';
      key('r', target);
      key('v', target);
      key('Delete', target);
      expect(i.items).toHaveLength(1);
      expect(i.items[0].dir).toBeUndefined();
      expect(i.items[0].variant).toBeUndefined();
    }
  });

  it('erro antigo não trava a contagem: cada ação limpa o aviso', () => {
    const { i, key, status } = make([{ ...desk }]);
    i.selected = 'd1';
    key('Delete');
    expect(status).toContain('');
  });
});
