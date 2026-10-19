import { describe, expect, it } from 'vitest';
import type { BuildItem } from '../../../shared/build';
import { nextDir, nextVariant, placementError, reachability, TEMPLATES } from './builder-model';

const mk = (id: string, kind: string, x: number, y: number, extra: Partial<BuildItem> = {}): BuildItem => ({ id, kind, x, y, ...extra });

describe('placementError', () => {
  it('aceita um móvel dentro da sala', () => {
    expect(placementError([], { kind: 'bookshelf', x: 2, y: 3 })).toBeNull();
  });
  it('recusa fora da sala, na faixa da porta e por cima de outro móvel', () => {
    expect(placementError([], { kind: 'printer', x: 15, y: 4 })).toMatch(/Fora/);
    expect(placementError([], { kind: 'printer', x: 7, y: 5 })).toMatch(/porta/);
    expect(placementError([mk('a', 'bookshelf', 2, 3)], { kind: 'printer', x: 3, y: 3 })).toMatch(/Já tem/);
  });
  it('reserva o tile da cadeira junto da mesa de trabalho', () => {
    const desk =mk('d', 'desk', 2, 5);
    expect(placementError([desk], { kind: 'printer', x: 2, y: 6 })).toMatch(/Já tem/);
  });
  it('ignora o próprio item ao movê-lo', () => {
    const desk =mk('d', 'desk', 2, 5);
    expect(placementError([desk], { kind: 'desk', x: 2, y: 5 }, 'd')).toBeNull();
  });
  it('itens de parede não se sobrepõem', () => {
    const w = [mk('a', 'window', 3, 0)];
    expect(placementError(w, { kind: 'whiteboard', x: 4, y: 0 })).toMatch(/parede/);
    expect(placementError(w, { kind: 'clock', x: 10.5, y: 0 })).toBeNull();
  });
});

describe('reachability', () => {
  it('conta lugares alcançáveis e acusa cadeira cercada', () => {
    expect(reachability([mk('d', 'desk', 2, 5)])).toEqual({ seats: 1, unreachable: 0 });
    const walled = [mk('d', 'desk', 2, 4), ...[1, 2, 3].map((x, i) => mk(`s${i}`, 'bookshelf', x, 6)),mk('l', 'bookshelf', 1, 5),mk('r', 'filing_cabinet', 3, 5)];
    expect(reachability(walled).unreachable).toBe(1);
  });
});

describe('variantes e direção', () => {
  it('gira a direção e troca a variante', () => {
    expect(nextDir({ kind: 'armchair', dir: 'down' })).toBe('left');
    expect(nextDir({ kind: 'sofa', dir: 'up' })).toBe('down');
    expect(nextVariant({ kind: 'desk', variant: 'wood' })).toBe('white');
    expect(nextVariant({ kind: 'armchair' })).toBeUndefined();
  });
});

describe('modelos', () => {
  for (const tp of TEMPLATES) {
    it(`${tp.name}: móveis válidos e todos os lugares alcançáveis`, () => {
      const placed: BuildItem[] = [];
      for (const [i, item] of tp.items.entries()) {
        expect(placementError(placed, item), `${item.kind} #${i}`).toBeNull();
        placed.push({ ...item, id: String(i) });
      }
      expect(reachability(placed).unreachable).toBe(0);
    });
  }
});
