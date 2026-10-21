import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { criarBtw } from './btw.mjs';

const pessoa = { nome: 'João', papel: 'dono' };
const agente = { id: 'ana', name: 'Ana', account: 'a1', model: 'sonnet', tools: ['web'], skills: ['x'], dev: { cwd: 'C:/p' }, sessionId: 's1', status: 'working', task: 't1' };

function montar(opts: { texto?: string; falha?: boolean; pendente?: boolean } = {}) {
  let t = 1_000_000;
  let liberar: (v: unknown) => void = () => {};
  const runTurn = vi.fn(() => {
    if (opts.falha) return Promise.reject(new Error('caiu'));
    if (opts.pendente) return new Promise((r) => { liberar = r; });
    return Promise.resolve({ text: opts.texto ?? 'resposta' });
  });
  const btw = criarBtw({ runTurn, getAgent: (id: string) => (id === 'ana' ? agente : null), agora: () => t, systemFor: () => 'sistema' });
  return { btw, runTurn, avancar: (ms: number) => { t += ms; }, liberar: (v: unknown) => liberar(v) };
}

describe('btw', () => {
  it('agente Codex (por id ou pela conta real): 409 sem chamar runTurn e sem gastar o intervalo', async () => {
    const runTurn = vi.fn(() => Promise.resolve({ text: 'x' }));
    const cx = { ...agente, id: 'cx', account: 'codex-2', model: 'gpt-5.2-codex' };
    const viaConta = { ...agente, id: 'vc', account: 'minha' };
    const btw = criarBtw({ runTurn, getAgent: (id: string) => (id === 'cx' ? cx : id === 'vc' ? viaConta : null), providerReal: (a: { id: string }) => (a.id === 'vc' ? 'codex' : undefined) });
    expect(await btw({ pessoa, agentId: 'cx', pergunta: 'oi' })).toMatchObject({ ok: false, status: 409 });
    expect(await btw({ pessoa, agentId: 'vc', pergunta: 'oi' })).toMatchObject({ ok: false, status: 409 });
    expect(runTurn).not.toHaveBeenCalled();
  });
  it('falha do runner: 502 com mensagem genérica, sem vazar o texto do erro', async () => {
    const { btw } = montar({ falha: true });
    expect(await btw({ pessoa, agentId: 'ana', pergunta: 'oi' })).toEqual({ ok: false, status: 502, error: 'o agente não respondeu' });
  });
  it('pergunta válida: 200 e runTurn sem ferramentas, sem dev, sem sessão', async () => {
    const { btw, runTurn } = montar();
    const r = await btw({ pessoa, agentId: 'ana', pergunta: 'Quanto falta?' });
    expect(r).toEqual({ ok: true, status: 200, resposta: 'resposta' });
    const arg = runTurn.mock.calls[0][0];
    expect(arg.agent.tools).toEqual([]);
    expect(arg.agent.skills).toEqual([]);
    expect(arg.agent.dev).toBeUndefined();
    expect(arg.agent.sessionId).toBeUndefined();
    expect(agente.tools).toEqual(['web']); // o agente original não é alterado
  });
  it('sem pessoa válida: 403; agente inexistente: 404', async () => {
    const { btw, runTurn } = montar();
    expect((await btw({ pessoa: null, agentId: 'ana', pergunta: 'oi' })).status).toBe(403);
    expect((await btw({ pessoa: { nome: 'X', papel: 'visitante' }, agentId: 'ana', pergunta: 'oi' })).status).toBe(403);
    expect((await btw({ pessoa, agentId: 'zzz', pergunta: 'oi' })).status).toBe(404);
    expect(runTurn).not.toHaveBeenCalled();
  });
  it('vazia e com 501 caracteres: 400 sem chamar runTurn; 500 passa', async () => {
    const { btw, runTurn } = montar();
    expect((await btw({ pessoa, agentId: 'ana', pergunta: '   ' })).status).toBe(400);
    expect((await btw({ pessoa, agentId: 'ana', pergunta: 'a'.repeat(501) })).status).toBe(400);
    expect(runTurn).not.toHaveBeenCalled();
    expect((await btw({ pessoa, agentId: 'ana', pergunta: 'a'.repeat(500) })).status).toBe(200);
  });
  it('segunda chamada antes de 20 s: 429; depois de 20 s: 200', async () => {
    const { btw, avancar } = montar();
    await btw({ pessoa, agentId: 'ana', pergunta: 'um' });
    avancar(19_000);
    expect((await btw({ pessoa, agentId: 'ana', pergunta: 'dois' })).status).toBe(429);
    avancar(1_000);
    expect((await btw({ pessoa, agentId: 'ana', pergunta: 'três' })).status).toBe(200);
  });
  it('chamada com a primeira ainda pendente: 409', async () => {
    const { btw, liberar, avancar } = montar({ pendente: true });
    const primeira = btw({ pessoa, agentId: 'ana', pergunta: 'um' });
    avancar(30_000);
    expect((await btw({ pessoa, agentId: 'ana', pergunta: 'dois' })).status).toBe(409);
    liberar({ text: 'ok' });
    expect((await primeira).status).toBe(200);
  });
  it('resposta de 3000 caracteres volta com 1500', async () => {
    const { btw } = montar({ texto: 'x'.repeat(3000) });
    const r = await btw({ pessoa, agentId: 'ana', pergunta: 'oi' });
    expect(r.resposta).toHaveLength(1500);
  });
  it('runTurn rejeitando: 502 e o estado não trava', async () => {
    const { btw, runTurn, avancar } = montar({ falha: true });
    const r = await btw({ pessoa, agentId: 'ana', pergunta: 'oi' });
    expect(r).toMatchObject({ ok: false, status: 502 });
    runTurn.mockResolvedValueOnce({ text: 'voltou' });
    avancar(20_000);
    expect(await btw({ pessoa, agentId: 'ana', pergunta: 'oi' })).toMatchObject({ ok: true, resposta: 'voltou' });
  });
});
