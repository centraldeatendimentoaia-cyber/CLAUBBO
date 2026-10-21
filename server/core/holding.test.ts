import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { buildHolding } from './holding.mjs';

const NOW = Date.parse('2026-10-22T02:30:00Z'); // 21/10 23:30 em São Paulo
const H = 3600e3;
const xp = (over = {}) => ({ elenco: () => [], xpHoje: () => 0, avaliada: () => false, ...over });
const rotina = (id: string, over = {}) => ({ id, title: id, agent: 'ana', when: { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], at: '23:55' }, whenLabel: 'todo dia às 23:55', paused: false, history: [], ...over });
const view = (deps = {}) => buildHolding({ tasks: [], cliRequests: [], proposals: [], calls: [], routines: [], activity: [], xp: xp(), ...deps }, NOW);

describe('buildHolding', () => {
  it('sem nada pendente devolve pendencias vazia', () => {
    const v = view();
    expect(v.pendencias).toEqual([]);
    expect(v.rotinas).toEqual({ rodaram: 0, falharam: 0, previstas: 0, lista: [] });
  });

  it('usa o dia de São Paulo: 02:30Z ainda é 21/10', () => {
    const ontemSP = Date.parse('2026-10-21T14:00:00Z'); // 21/10 11:00 em SP
    const foraDoDia = Date.parse('2026-10-22T04:00:00Z'); // 22/10 01:00 em SP: ainda não aconteceu
    const v = view({ routines: [rotina('a', { history: [{ ok: true, finishedAt: ontemSP }] }), rotina('b', { history: [{ ok: true, finishedAt: foraDoDia - 30 * H }] })] });
    expect(v.rotinas.rodaram).toBe(1);
  });

  it('falharam conta a rotina cuja última execução do dia foi ok:false', () => {
    const t = NOW - H;
    const v = view({
      routines: [
        rotina('a', { history: [{ ok: false, finishedAt: t }] }),
        rotina('b', { history: [{ ok: false, finishedAt: t - H }, { ok: true, finishedAt: t - 2 * H }] }),
        rotina('c', { history: [{ ok: true, finishedAt: t }, { ok: false, finishedAt: t - H }] }),
      ],
    });
    expect(v.rotinas.falharam).toBe(2);
    expect(v.rotinas.rodaram).toBe(1);
    expect(v.rotinas.lista.map((r: { estado: string }) => r.estado)).toEqual(['falhou', 'falhou', 'ok']);
  });

  it('rotina pausada não entra em previstas e aparece como pausada', () => {
    const v = view({ routines: [rotina('a', { paused: true }), rotina('b')] });
    expect(v.rotinas.previstas).toBe(1); // b: 23:55 ainda não passou
    expect(v.rotinas.lista.find((r: { id: string }) => r.id === 'a').estado).toBe('pausada');
    expect(v.rotinas.lista.find((r: { id: string }) => r.id === 'b').estado).toBe('aguarda');
  });

  it('avaliar ignora tarefa com erro, já avaliada e antiga', () => {
    const done = (id: string, over = {}) => ({ id, state: 'done', agent: 'ana', title: id, doneAt: NOW - H, ...over });
    const v = view({
      tasks: [done('ok'), done('erro', { error: 'x' }), done('velha', { doneAt: NOW - 25 * H }), done('feita'), { id: 'esp', state: 'waiting', doneAt: NOW - H }],
      xp: xp({ avaliada: (id: string) => id === 'feita' }),
    });
    expect(v.avaliar).toEqual([{ task: 'ok', agent: 'ana', title: 'ok', doneAt: NOW - H }]);
  });

  it('elenco, xpHoje e ticker vêm das dependências', () => {
    const v = view({ xp: xp({ elenco: () => [{ agent: 'ana', nome: 'Ana', xp: 5, nivel: 1, progresso: 0.5 }], xpHoje: () => 7 }), activity: [{ at: 1, text: 'a' }, { at: 2, text: 'b' }] });
    expect(v.elenco).toHaveLength(1);
    expect(v.xpHoje).toBe(7);
    expect(v.ticker).toEqual([{ at: 2, text: 'b' }, { at: 1, text: 'a' }]);
  });
});
