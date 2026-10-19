import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { cancelRequest, moveRequest } from './cli-queue.mjs';

type R = { id: string; state: string; retorno?: string; cancelledAt?: number };
const list = (): R[] => [{ id: 'a', state: 'pending' }, { id: 'b', state: 'sent', retorno: 'aguardando' }, { id: 'c', state: 'pending' }, { id: 'd', state: 'sent', retorno: 'entregue' }, { id: 'e', state: 'pending' }];

describe('cancelar pedidos', () => {
  it('pendente vira cancelado (nada é enviado); enviado aguardando retorno para de esperar; o resto recusa', () => {
    const l = list();
    expect(cancelRequest(l, 'a', 5)).toMatchObject({ ok: true });
    expect(l[0]).toMatchObject({ state: 'cancelled', cancelledAt: 5 });
    expect(cancelRequest(l, 'b')).toMatchObject({ ok: true });
    expect(l[1]).toMatchObject({ state: 'sent', retorno: 'cancelado' });
    expect(cancelRequest(l, 'd')).toMatchObject({ ok: false, status: 409 });
    expect(cancelRequest(l, 'a')).toMatchObject({ ok: false, status: 409 });
    expect(cancelRequest(l, 'zzz')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('reordenar pedidos pendentes', () => {
  it('troca só entre pendentes, sem mexer nos já enviados; nas pontas não muda nada', () => {
    const l = list();
    expect(moveRequest(l, 'c', 'up')).toEqual({ ok: true, moved: true });
    expect(l.map((r) => r.id)).toEqual(['c', 'b', 'a', 'd', 'e']);
    expect(moveRequest(l, 'c', 'up')).toEqual({ ok: true, moved: false });
    expect(moveRequest(l, 'e', 'down')).toEqual({ ok: true, moved: false });
    expect(moveRequest(l, 'a', 'down')).toEqual({ ok: true, moved: true });
    expect(l.map((r) => r.id)).toEqual(['c', 'b', 'e', 'd', 'a']);
  });
  it('pedido que não está pendente ou direção inválida: erro', () => {
    const l = list();
    expect(moveRequest(l, 'b', 'up')).toMatchObject({ ok: false, status: 404 });
    expect(moveRequest(l, 'a', 'lado')).toMatchObject({ ok: false, status: 400 });
  });
});
