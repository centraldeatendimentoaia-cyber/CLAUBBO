/// <reference types="node" />
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barBottom } from './bar-place';

const css = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

/** z-index da regra que começa exatamente em `selector {` (ignora regras compostas como ".has-feed .cr-mode"). */
const zOf = (selector: string): number => {
  const start = css.indexOf('\n' + selector + ' {');
  if (start < 0) return NaN;
  const block = css.slice(start, css.indexOf('}', start));
  return Number(/z-index:\s*(\d+)/.exec(block)?.[1] ?? NaN);
};

describe('barra Terminais/automático acima do feed', () => {
  it('a barra tem z-index maior que o feed (senão o feed cobre o selo e o botão)', () => {
    expect(zOf('.cr-mode')).toBeGreaterThan(zOf('.ui-feed'));
  });
  it('fica gap px acima do topo medido do feed, seja qual for a altura dele', () => {
    expect(barBottom(900, 690)).toBe(218); // feed aberto (200 px + margem)
    expect(barBottom(900, 862)).toBe(46); // feed fechado (só o cabeçalho)
    expect(barBottom(1050, 840)).toBe(218);
  });
  it('nunca fica abaixo do próprio gap', () => {
    expect(barBottom(900, 2000)).toBe(8);
  });
});
