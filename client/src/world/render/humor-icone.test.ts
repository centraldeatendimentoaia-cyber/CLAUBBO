import { describe, expect, it } from 'vitest';
import { iconeDeHumor } from './humor-icone';

describe('iconeDeHumor', () => {
  it('aparece só para animado e chateado', () => {
    expect(iconeDeHumor('animado')).toBe('😄');
    expect(iconeDeHumor('chateado')).toBe('😞');
  });
  it('neutro, ausente e valores estranhos não desenham nada', () => {
    for (const h of ['neutro', undefined, '', '__proto__', 'toString', 'raiva']) expect(iconeDeHumor(h)).toBeNull();
  });
});
