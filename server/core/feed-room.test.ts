import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { feedRoomOf } from './feed-room.mjs';

const rooms = [{ id: 'sala2', name: 'FREELAS' }, { id: 'sala3', name: 'sala3' }, { id: 'reuniao', name: 'Reunião', kind: 'meeting' }];
const agents = [{ id: 'maestro-dev', room: '' }, { id: 'reativador', room: 'sala3' }];
const nameOf = (id: string, name: string) => (id === 'sala3' ? 'SAI AÊ' : name);

describe('sala do feed', () => {
  it('mostra o nome da sala, não o código', () => {
    expect(feedRoomOf(rooms, agents, { agent: 'reativador', room: 'sala3' }, nameOf)).toEqual({ roomId: 'sala3', roomName: 'SAI AÊ' });
  });
  it('fala sem sala usa a sala de casa do agente', () => {
    expect(feedRoomOf(rooms, agents, { agent: 'reativador', room: '' }, nameOf)).toEqual({ roomId: 'sala3', roomName: 'SAI AÊ' });
  });
  it('agente sem sala escolhida cai na primeira sala de trabalho (Maestro Dev)', () => {
    expect(feedRoomOf(rooms, agents, { agent: 'maestro-dev', room: '' }, nameOf)).toEqual({ roomId: 'sala2', roomName: 'FREELAS' });
  });
  it('sem agente e sem sala: rótulo claro, nunca vazio nem código', () => {
    expect(feedRoomOf(rooms, agents, { agent: '', room: '' }, nameOf)).toEqual({ roomId: '', roomName: 'Escritório' });
    expect(feedRoomOf(rooms, agents, { agent: '', room: 'salaQueSumiu' }, nameOf)).toEqual({ roomId: '', roomName: 'Escritório' });
  });
});
