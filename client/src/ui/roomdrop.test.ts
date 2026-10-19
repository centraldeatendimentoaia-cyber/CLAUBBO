import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from './accountdrop';
import { dropAgentOnRoom, judgeRoomDrop } from './roomdrop';

const ana = { id: 'escritorio:ana', roomId: 'a', name: 'Ana' };
const nova = { id: 'nova', name: 'Nova' };
const reply = (ok: boolean, status: number, body: unknown) => ({ ok, status, json: async () => body });

describe('judgeRoomDrop', () => {
  it('move para outra sala', () => expect(judgeRoomDrop(ana, nova)).toEqual({ kind: 'move' }));
  it('mesma sala: nada', () => expect(judgeRoomDrop(ana, { id: 'a', name: 'A' })).toEqual({ kind: 'same' }));
  it('sala inexistente', () => expect(judgeRoomDrop(ana, undefined).kind).toBe('blocked'));
  it('agente CLI recusado', () => expect(judgeRoomDrop({ id: 'abc', roomId: 'a' }, nova).kind).toBe('blocked'));
  it('sala CLI como destino recusada', () => expect(judgeRoomDrop(ana, { id: 'x', name: '[CLI] x', floor: 2 }).kind).toBe('blocked'));
});

describe('dropAgentOnRoom', () => {
  it('troca ok: PUT só com room', async () => {
    const f = vi.fn<Fetcher>(async () => reply(true, 200, {}));
    expect(await dropAgentOnRoom(ana, nova, f)).toEqual({ level: 'success', text: 'Ana movido para Nova' });
    expect(f.mock.calls[0][0]).toBe('/api/build/agents/ana/room');
    expect(f.mock.calls[0][1]?.body).toBe('{"room":"nova"}');
  });
  it('mesma sala: sem requisição', async () => {
    const f = vi.fn<Fetcher>();
    expect(await dropAgentOnRoom(ana, { id: 'a', name: 'A' }, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('erro do servidor: aviso, agente continua', async () => {
    const out = await dropAgentOnRoom(ana, nova, async () => reply(false, 400, { error: 'sala inexistente' }));
    expect(out?.level).toBe('warn');
    expect(out?.text).toContain('sala inexistente');
  });
  it('servidor fora do ar: aviso', async () => {
    const out = await dropAgentOnRoom(ana, nova, async () => { throw new Error('off'); });
    expect(out?.level).toBe('warn');
  });
});
