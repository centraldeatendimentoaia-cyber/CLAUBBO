import { describe, expect, it } from 'vitest';
import type { DeliveryInfo } from '../../../shared/types';
import { filterDeliveries, filterOptions, unseenCount } from './deliveries';

const d = (id: string, over: Partial<DeliveryInfo> = {}): DeliveryInfo => ({ id, account: 'a', sessionId: 's', request: '', headline: 'h', text: 't', startedAt: 0, finishedAt: 1, tools: 0, edited: 0, attachments: [], ...over });

const list = [
  d('1', { project: 'Marketing', agentName: 'Ana', seen: true }),
  d('2', { project: 'Marketing', agentName: 'Bia' }),
  d('3', { project: 'Sai aê', agentName: 'Ana' }),
  d('4', {}),
];

describe('entregas: filtros e não vistas', () => {
  it('conta só as que ainda não foram vistas', () => {
    expect(unseenCount(list)).toBe(3);
    expect(unseenCount([])).toBe(0);
  });

  it('filtra por projeto, por agente e pelos dois juntos; vazio = todas', () => {
    expect(filterDeliveries(list, { project: '', agent: '' })).toHaveLength(4);
    expect(filterDeliveries(list, { project: 'Marketing', agent: '' }).map((x) => x.id)).toEqual(['1', '2']);
    expect(filterDeliveries(list, { project: '', agent: 'Ana' }).map((x) => x.id)).toEqual(['1', '3']);
    expect(filterDeliveries(list, { project: 'Marketing', agent: 'Ana' }).map((x) => x.id)).toEqual(['1']);
    expect(filterDeliveries(list, { project: 'Nenhum', agent: '' })).toEqual([]);
  });

  it('opções dos filtros: únicas, sem vazio, em ordem alfabética', () => {
    expect(filterOptions(list)).toEqual({ projects: ['Marketing', 'Sai aê'], agents: ['Ana', 'Bia'] });
  });
});
