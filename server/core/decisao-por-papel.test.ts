import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { confirmarAntesDeAgir, lotesSeguros, podeDecidir } from './holding.mjs';

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

describe('confirmarAntesDeAgir', () => {
  const plan = { id: 'tarefa:t1', stage: 'plan', ownerOnly: false };
  const impl = { id: 'tarefa:t1', stage: 'implement', ownerOnly: true };
  const chama = (item: unknown, pessoa: unknown, estagio: unknown = 'plan') => confirmarAntesDeAgir({ pendingNow: () => (item ? [item] : []), pid: 'tarefa:t1', pessoa, estagio });
  it('estágio mudou desde o gate: bloqueia com 409', () => expect(chama(impl, { papel: 'dono' })).toMatchObject({ ok: false, status: 409 }));
  it('equipe diante de estágio só do dono: bloqueia', () => expect(chama(impl, { papel: 'equipe' }, 'implement')).toMatchObject({ ok: false, status: 403 }));
  it('dono com o mesmo estágio: passa', () => expect(chama(plan, { papel: 'dono' })).toMatchObject({ ok: true }));
  it('equipe com estágio seguro igual: passa', () => expect(chama(plan, { papel: 'equipe' })).toMatchObject({ ok: true }));
  it('item sumiu: bloqueia', () => expect(chama(null, { papel: 'dono' })).toMatchObject({ ok: false, status: 409 }));
  it('papel agente: bloqueia', () => expect(chama(plan, { papel: 'agente' })).toMatchObject({ ok: false, status: 403 }));
});
