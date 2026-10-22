import { describe, expect, it } from 'vitest';
import { intencaoDe, telaDeToque, type Direcao } from './controles-toque-model';

const set = (...d: Direcao[]) => new Set<Direcao>(d);

describe('intencaoDe', () => {
  it('nada apertado: parado, mesmo com corrida ligada', () => {
    expect(intencaoDe(set(), true)).toEqual({ dx: 0, dy: 0, run: false });
  });
  it('um botão por eixo', () => {
    expect(intencaoDe(set('up'), false)).toEqual({ dx: 0, dy: -1, run: false });
    expect(intencaoDe(set('left'), false)).toEqual({ dx: -1, dy: 0, run: false });
    expect(intencaoDe(set('down', 'right'), false)).toEqual({ dx: 1, dy: 1, run: false });
  });
  it('opostos juntos se anulam', () => {
    expect(intencaoDe(set('left', 'right'), false)).toEqual({ dx: 0, dy: 0, run: false });
    expect(intencaoDe(set('left', 'right', 'up'), true)).toEqual({ dx: 0, dy: -1, run: true });
  });
  it('correr só vale se está andando', () => {
    expect(intencaoDe(set('right'), true).run).toBe(true);
  });
});

describe('telaDeToque', () => {
  it('lê (pointer: coarse); sem matchMedia ou com erro: não é toque', () => {
    expect(telaDeToque((q) => ({ matches: q === '(pointer: coarse)' }))).toBe(true);
    expect(telaDeToque(() => ({ matches: false }))).toBe(false);
    expect(telaDeToque(undefined)).toBe(false);
    expect(telaDeToque(() => { throw new Error('x'); })).toBe(false);
  });
});
