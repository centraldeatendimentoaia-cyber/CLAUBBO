import { describe, expect, it } from 'vitest';
import type { AccountInfo, AgentInfo, RoomInfo } from '../../../shared/types';
import { groupRooms } from './model';

const room = (id: string, slot: number) => ({ id, name: id, path: id, slot, seed: slot, createdAt: 0 }) as RoomInfo;
const account = (id: string) => ({ id, short: id[0], name: id, color: '#fff' }) as AccountInfo;
const agent = (id: string, roomId: string, acc: string) => ({ id, roomId, kind: 'main', name: id, account: acc, sessionId: id, status: 'idle', recent: [], tasks: [], startedAt: 0 }) as unknown as AgentInfo;

const snap = {
  rooms: [room('a', 0), room('nova', 1)],
  agents: [agent('ana', 'a', 'principal')],
  accounts: [account('principal'), account('aia')],
};

describe('salas vazias na barra (escritório novo)', () => {
  it('sala nova sem agentes aparece sem filtro', () => {
    expect(groupRooms(snap).map((g) => g.room.id)).toEqual(['a', 'nova']);
  });

  it('sala nova continua aparecendo com uma conta desligada no filtro', () => {
    const g = groupRooms(snap, { query: '', hiddenAccounts: new Set(['aia']) });
    expect(g.map((r) => r.room.id)).toEqual(['a', 'nova']);
  });

  it('sala cujos agentes são todos de conta desligada continua sumindo', () => {
    const g = groupRooms(snap, { query: '', hiddenAccounts: new Set(['principal']) });
    expect(g.map((r) => r.room.id)).toEqual(['nova']);
  });

  it('busca por texto esconde salas vazias', () => {
    expect(groupRooms(snap, { query: 'ana', hiddenAccounts: new Set() }).map((r) => r.room.id)).toEqual(['a']);
  });
});
