import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { confirmarAntesDeAgir, dispensaJanela, lotesSeguros, podeDecidir, reservarEntrega } from './holding.mjs';

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

describe('dispensaJanela', () => {
  const base = { rede: true, ehEscritaDoCelular: true, pessoa: { papel: 'dono' }, sempre: false, item: undefined };
  it('dono no celular, rota de aprovar/recusar: dispensa', () => expect(dispensaJanela(base)).toBe(true));
  it('equipe na rede nunca dispensa por ser rede (C1)', () => expect(dispensaJanela({ ...base, pessoa: { papel: 'equipe' } })).toBe(false));
  it('papel ausente ou agente na rede: abre a janela', () => {
    expect(dispensaJanela({ ...base, pessoa: undefined })).toBe(false);
    expect(dispensaJanela({ ...base, pessoa: { papel: 'agente' } })).toBe(false);
  });
  it('"para sempre" sempre abre a janela, até para o dono no celular (I1)', () => {
    expect(dispensaJanela({ ...base, sempre: true })).toBe(false);
    expect(dispensaJanela({ ...base, sempre: true, item: { needsDialog: false } })).toBe(false);
  });
  it('fora do celular: só item que não precisa de janela dispensa', () => {
    const local = { ...base, rede: false, ehEscritaDoCelular: false };
    expect(dispensaJanela({ ...local, item: { needsDialog: false } })).toBe(true);
    expect(dispensaJanela({ ...local, item: { needsDialog: true } })).toBe(false);
    expect(dispensaJanela({ ...local, item: undefined })).toBe(false);
    expect(dispensaJanela(local)).toBe(false);
  });
  it('escrita de rede fora das rotas de aprovar não dispensa', () => expect(dispensaJanela({ ...base, ehEscritaDoCelular: false })).toBe(false));
});

describe('reservarEntrega (I5)', () => {
  it('marca sending e lembra quem decidiu, de forma síncrona', () => {
    const item = { state: 'pending' }; const lembrou: unknown[] = [];
    expect(reservarEntrega(item, 'terminal:r1', 'Ana', (...a: unknown[]) => lembrou.push(a))).toEqual({ ok: true });
    expect(item.state).toBe('sending');
    expect(lembrou).toEqual([['terminal:r1', 'Ana']]);
  });
  it('a segunda decisão leva 409 com o nome de quem decidiu e não lembra de novo', () => {
    const item = { state: 'pending' }; const lembrou: unknown[] = [];
    const lembra = (...a: unknown[]) => lembrou.push(a);
    reservarEntrega(item, 'terminal:r1', 'Ana', lembra);
    const r2 = reservarEntrega(item, 'terminal:r1', 'Bia', lembra, () => ({ nome: 'Ana' }));
    expect(r2).toMatchObject({ ok: false, status: 409, error: 'já decidido por Ana' });
    expect(lembrou).toHaveLength(1);
  });
});

describe('confirmarAntesDeAgir com decisão lembrada', () => {
  it('item que sumiu depois de decidido: 409 já decidido por <nome>', () =>
    expect(confirmarAntesDeAgir({ pendingNow: () => [], pid: 'terminal:r1', pessoa: { papel: 'dono' }, estagio: undefined, decisionOf: () => ({ nome: 'Ana' }) })).toMatchObject({ ok: false, status: 409, error: 'já decidido por Ana' }));
});
