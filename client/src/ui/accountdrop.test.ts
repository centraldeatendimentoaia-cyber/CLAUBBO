import { describe, expect, it, vi } from 'vitest';
import { dropAgentOnAccount, judgeDrop, type Fetcher } from './accountdrop';

const agent = { id: 'escritorio:ana', account: 'principal' };
const accounts = [
  { id: 'principal', name: 'Principal', state: 'connected' },
  { id: 'aia', name: 'AIA', state: 'connected' },
  { id: 'codex', name: 'Codex', state: 'logged-out' },
];

function reply(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body };
}

/** Servidor falso: GET /api/ops/state devolve as contas; o PUT usa `put`. */
function server(put: () => ReturnType<typeof reply> | Promise<never>) {
  return vi.fn<Fetcher>(async (url, init) => (init?.method === 'PUT' ? put() : reply(true, 200, { accounts })));
}

describe('judgeDrop', () => {
  it('troca para conta com login', () => expect(judgeDrop(agent, accounts[1], 'aia')).toEqual({ kind: 'move' }));
  it('mesma conta não faz nada', () => expect(judgeDrop(agent, accounts[0], 'principal')).toEqual({ kind: 'same' }));
  it('recusa conta inexistente', () => expect(judgeDrop(agent, undefined, 'fantasma')).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('não existe') }));
  it('recusa conta sem login e explica o motivo', () => expect(judgeDrop(agent, accounts[2], 'codex')).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('sem login') }));
  it('recusa agente de terminal', () => expect(judgeDrop({ id: 'abc', account: 'principal' }, accounts[1], 'aia').kind).toBe('blocked'));
});

describe('dropAgentOnAccount', () => {
  it('troca ok: grava só o account e avisa', async () => {
    const f = server(() => reply(true, 200, {}));
    const out = await dropAgentOnAccount(agent, 'aia', f);
    expect(out).toEqual({ level: 'success', text: 'Agente movido para AIA', moved: true });
    const put = f.mock.calls.find(([, i]) => i?.method === 'PUT')!;
    expect(put[0]).toBe('/api/ops/agents/ana');
    expect(put[1]?.body).toBe('{"account":"aia"}');
  });

  it('soltar na mesma conta não faz requisição', async () => {
    const f = server(() => reply(true, 200, {}));
    expect(await dropAgentOnAccount(agent, 'principal', f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('conta inexistente: recusa e não grava', async () => {
    const f = server(() => reply(true, 200, {}));
    const out = await dropAgentOnAccount(agent, 'fantasma', f);
    expect(out).toMatchObject({ level: 'warn', moved: false });
    expect(f.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false);
  });

  it('conta sem login: recusa com o motivo e não grava', async () => {
    const f = server(() => reply(true, 200, {}));
    const out = await dropAgentOnAccount(agent, 'codex', f);
    expect(out).toMatchObject({ level: 'warn', moved: false });
    expect(out!.text).toContain('sem login');
    expect(f.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false);
  });

  it('servidor recusa o PUT: nada muda e mostra o erro', async () => {
    const out = await dropAgentOnAccount(agent, 'aia', server(() => reply(false, 400, { error: 'conta "aia" não existe' })));
    expect(out).toEqual({ level: 'warn', text: 'Não consegui mover o agente: conta "aia" não existe', moved: false });
  });

  it('servidor fora do ar no PUT: nada muda e mostra o erro', async () => {
    const out = await dropAgentOnAccount(agent, 'aia', server(() => Promise.reject(new Error('offline'))));
    expect(out).toMatchObject({ level: 'warn', moved: false });
    expect(out!.text).toContain('servidor');
  });

  it('não consegue conferir as contas: nada é gravado', async () => {
    const f = vi.fn<Fetcher>(async () => reply(false, 500, {}));
    const out = await dropAgentOnAccount(agent, 'aia', f);
    expect(out).toMatchObject({ level: 'warn', moved: false });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
