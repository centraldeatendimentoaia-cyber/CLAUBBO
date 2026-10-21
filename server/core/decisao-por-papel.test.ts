import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { lotesSeguros, podeDecidir } from './holding.mjs';

describe('podeDecidir', () => {
  it('equipe não decide item só do dono', () => expect(podeDecidir({ papel: 'equipe' }, { ownerOnly: true })).toBe(false));
  it('equipe decide item que não é só do dono', () => expect(podeDecidir({ papel: 'equipe' }, { ownerOnly: false })).toBe(true));
  it('dono decide qualquer item', () => {
    expect(podeDecidir({ papel: 'dono' }, { ownerOnly: true })).toBe(true);
    expect(podeDecidir({ papel: 'dono' }, { ownerOnly: false })).toBe(true);
  });
  it('papel desconhecido, agente ou ausente é negado sempre', () => {
    for (const p of [{ papel: 'agente' }, { papel: 'Dono' }, { papel: '' }, {}, undefined, null]) expect(podeDecidir(p, { ownerOnly: false })).toBe(false);
  });
  it('equipe sem a marca ownerOnly no item é negada (não presume seguro)', () => expect(podeDecidir({ papel: 'equipe' }, {})).toBe(false));
});

describe('lotesSeguros', () => {
  it('devolve só os itens com safe:true', () => {
    const lista = [{ id: 'a', safe: true }, { id: 'b', safe: false }, { id: 'c' }, { id: 'd', safe: 'true' }];
    expect(lotesSeguros(lista).map((p: { id: string }) => p.id)).toEqual(['a']);
  });
});
