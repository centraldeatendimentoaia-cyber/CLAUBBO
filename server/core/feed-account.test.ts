import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { feedAccountOf } from './feed-account.mjs';

const agents = [
  { id: 'maestro-dev', name: 'Maestro Dev', account: 'principal' },
  { id: 'reativador', name: 'Reativador', account: 'secundaria' },
  { id: 'sem-conta', name: 'Sem conta' },
];

describe('conta de cada item do feed', () => {
  it('agente na conta secundária aparece na secundária, não na Principal', () => {
    expect(feedAccountOf(agents, 'reativador')).toBe('secundaria');
    expect(feedAccountOf(agents, 'maestro-dev')).toBe('principal');
  });

  it('agente sem conta, removido ou evento sem agente: sem conta (a tela mostra "desconhecida")', () => {
    expect(feedAccountOf(agents, 'sem-conta')).toBeUndefined();
    expect(feedAccountOf(agents, 'sumiu')).toBeUndefined();
    expect(feedAccountOf(agents, '')).toBeUndefined();
    expect(feedAccountOf(agents, undefined)).toBeUndefined();
  });
});
