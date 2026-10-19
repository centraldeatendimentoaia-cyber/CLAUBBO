import { describe, expect, it } from 'vitest';
import { canCancel, requestStage, waitingPrefix } from './cli-status';

describe('etapas de um pedido aos terminais', () => {
  it('pedido -> aprovação -> enviado -> terminal trabalhando -> concluído', () => {
    expect(requestStage({ state: 'pending' })).toEqual({ label: 'Esperando você aprovar', tone: 'wait' });
    expect(requestStage({ state: 'sent' })).toMatchObject({ label: 'enviado', tone: 'ok' });
    expect(requestStage({ state: 'sent', retorno: 'aguardando', auto: true })).toMatchObject({ tone: 'run', label: expect.stringContaining('enviado sem clique') });
    expect(requestStage({ state: 'sent', retorno: 'entregue' })).toMatchObject({ tone: 'ok', label: expect.stringContaining('Concluído') });
    expect(requestStage({ state: 'sent', retorno: 'entregue_sem_acordar' }).tone).toBe('ok');
  });

  it('falhas e encerramentos', () => {
    expect(requestStage({ state: 'failed' }).tone).toBe('bad');
    expect(requestStage({ state: 'sent', retorno: 'sem_retorno' }).tone).toBe('bad');
    expect(requestStage({ state: 'sent', retorno: 'falhou' }).tone).toBe('bad');
    expect(requestStage({ state: 'rejected' }).label).toBe('Recusado');
    expect(requestStage({ state: 'cancelled' }).label).toBe('Cancelado');
    expect(requestStage({ state: 'sent', retorno: 'cancelado' }).tone).toBe('off');
  });

  it('só dá para cancelar o que espera aprovação ou retorno', () => {
    expect(canCancel({ state: 'pending' })).toBe(true);
    expect(canCancel({ state: 'sent', retorno: 'aguardando' })).toBe(true);
    expect(canCancel({ state: 'sent', retorno: 'entregue' })).toBe(false);
    expect(canCancel({ state: 'cancelled' })).toBe(false);
  });

  it('prefixo do título', () => {
    expect(waitingPrefix(3)).toBe('(3) ');
    expect(waitingPrefix(0)).toBe('');
  });
});
