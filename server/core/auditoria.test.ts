import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { FILE, record, shouldAudit } from './auditoria.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { humanGated } from './acesso.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { createTelegramBot } from './telegram-bot.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-audit-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('quais rotas são auditadas', () => {
  it.each([
    ['DELETE', '/api/agents/marina'], ['PUT', '/api/company'], ['DELETE', '/api/conversation/x'], ['PUT', '/api/offices/a'],
    ['POST', '/api/backups/2026-10-19/restore'], ['POST', '/api/agent-proposals/p1/approve'], ['POST', '/api/ops/tasks/t1/approve'], ['POST', '/api/rooms/rename'], ['POST', '/api/deliveries/upload/a/b.png'],
    ['POST', '/api/cli/requests/r1/approve'], ['POST', '/api/agent-calls/c1/approve'], ['POST', '/api/pendencias/aprovar-seguros'], ['POST', '/api/agentes/a1/modelo'], ['POST', '/api/agentes/a1/obrigado'], ['POST', '/api/agentes/a1/btw'], ['POST', '/api/xp/ficou-bom'],
    ['POST', '/api/jogos/desafio'], ['POST', '/api/jogos/3f2a-bc/jogada'], ['POST', '/api/equipe/Ana/personagem'],
  ])('audita %s %s', (m, p) => expect(shouldAudit(m, p)).toBe(true));
  it.each([['GET', '/api/agents/marina'], ['POST', '/api/messages'], ['POST', '/api/build/rooms'], ['GET', '/api/holding'], ['GET', '/api/permissions/x1'], ['POST', '/api/pendencias/aprovar-seguros/x'], ['GET', '/api/jogos/abc'], ['GET', '/api/carteira'], ['POST', '/api/jogos/desafio/x'], ['POST', '/api/jogos/a/b/jogada'], ['POST', '/api/jogos/a%2Fb/jogada'], ['GET', '/api/equipe'], ['POST', '/api/equipe/a/b/personagem']])('não audita %s %s', (m, p) => expect(shouldAudit(m, p)).toBe(false));
});

describe('gravação', () => {
  it('acrescenta uma linha JSON por registro e corta caminho comprido', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    record(dir, { who: 'pagina', method: 'DELETE', path: '/api/agents/a', status: 200 }, Date.parse('2026-10-19T10:00:00Z'));
    record(dir, { who: 'pagina', method: 'PUT', path: '/' + 'x'.repeat(500), status: 400 });
    log.mockRestore();
    const lines = fs.readFileSync(path.join(dir, FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ at: '2026-10-19T10:00:00.000Z', who: 'pagina', method: 'DELETE', path: '/api/agents/a', status: 200 });
    expect(lines[1].path).toHaveLength(200);
  });
  it('falha de gravação não lança', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {}); const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => record(path.join(dir, 'nao', 'existe'), { who: 'x', method: 'PUT', path: '/a', status: 200 })).not.toThrow();
    expect(err).toHaveBeenCalled(); err.mockRestore(); log.mockRestore();
  });
});

describe('aprovação pelo Telegram exige a janela do Windows', () => {
  const task = { id: 't1', state: 'waiting', dev: { awaiting: true }, title: 'Mexer na loja', agent: 'dev1' };
  const run = async (confirm: () => Promise<any>) => {
    const approve = vi.fn(async () => ({ ok: true }));
    const audit = vi.fn();
    const sent: any[] = [];
    let served = false;
    const fetchFn = async (url: string, init: any) => {
      const method = String(url).split('/').pop(); const body = JSON.parse(init.body);
      if (method === 'getUpdates') {
        const result = served ? [] : [{ update_id: 1, callback_query: { id: 'q', data: 'ap:t:t1', message: { chat: { id: 4242 }, message_id: 9 } } }];
        served = true; return { ok: true, json: async () => ({ result }) };
      }
      sent.push([method, body]); return { ok: true, json: async () => ({}) };
    };
    const cfg = path.join(dir, 'telegram.json');
    fs.writeFileSync(cfg, JSON.stringify({ token: '123456:AAAAAAAAAAAAAAAAAAAAAAAA', chatId: '4242', poll: true }));
    const bot = createTelegramBot({ configFile: cfg, fetchFn, log: () => {}, tasks: { get: () => task, approve: humanGated(approve, () => 'texto', { confirm, audit }), reject: vi.fn() }, meetings: { decide: vi.fn() } });
    await bot.pollOnce();
    return { approve, audit, answer: sent.find(([m]) => m === 'answerCallbackQuery')?.[1].text };
  };
  it('janela recusada: a tarefa não é aprovada e a decisão fica registrada', async () => {
    const r = await run(async () => ({ ok: false, status: 403, error: 'recusado' }));
    expect(r.approve).not.toHaveBeenCalled(); expect(r.answer).toBe('Não foi possível decidir agora.');
    expect(r.audit).toHaveBeenCalledWith('t1', expect.objectContaining({ ok: false, status: 403 }));
  });
  it('sem janela possível (fora do Windows, 501) também não aprova', async () => {
    const r = await run(async () => ({ ok: false, status: 501, error: 'sem janela' }));
    expect(r.approve).not.toHaveBeenCalled();
  });
  it('"sim" na janela: aprova', async () => {
    const r = await run(async () => ({ ok: true }));
    expect(r.approve).toHaveBeenCalledWith('t1'); expect(r.answer).toBe('Tarefa aprovada.');
  });
});
