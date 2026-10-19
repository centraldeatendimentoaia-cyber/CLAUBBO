import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { createTelegramBot } from './telegram-bot.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { buttonsFor, createNotifier } from './notify.mjs';

const TOKEN = '1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const cfg = (content: object | null) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'v2-tgbot-')), 'telegram.json');
  if (content) fs.writeFileSync(f, JSON.stringify(content));
  return f;
};
const press = (data: string, chat = 987654321, id = 1) => ({ update_id: id, callback_query: { id: `cb${id}`, data, message: { message_id: 7, chat: { id: chat } } } });

function setup(config: object | null, updates: unknown[]) {
  const calls: { method: string; body: any }[] = [];
  const logs: string[] = [];
  const fetchFn = async (url: string, o: any) => {
    const method = url.split('/').pop() as string;
    calls.push({ method, body: JSON.parse(o.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: method === 'getUpdates' ? updates : true }) };
  };
  const tasks: Record<string, any> = {
    waiting: { id: 'waiting', state: 'waiting', dev: { awaiting: true } },
    doing: { id: 'doing', state: 'doing', dev: { awaiting: false } },
  };
  const done: string[] = [];
  const bot = createTelegramBot({
    configFile: cfg(config), fetchFn, log: (m: string) => logs.push(m),
    tasks: { get: (id: string) => tasks[id], approve: async (id: string) => { done.push(`approve:${id}`); return { ok: true }; }, reject: (id: string, fb: string) => { done.push(`reject:${id}:${fb}`); return { ok: true }; } },
    meetings: { decide: (id: string, d: string) => (id === 'ata1' ? (done.push(`ata:${id}:${d}`), { ok: true }) : { ok: false, status: 409 }) },
  });
  return { bot, calls, logs, done };
}
const answers = (calls: { method: string; body: any }[]) => calls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.body.text);

describe('botões do aviso', () => {
  it('levam só o id da tarefa/ata, dentro do limite do Telegram', () => {
    const b = buttonsFor({ type: 'task_waiting', agent: 'Ana', taskId: 'abc123' });
    expect(b.inline_keyboard[0].map((x: any) => x.callback_data)).toEqual(['ap:t:abc123', 'rj:t:abc123']);
    expect(buttonsFor({ type: 'meeting_done', agent: 'Ana', meetingId: 'm9' }).inline_keyboard[0][0].callback_data).toBe('ap:m:m9');
    expect(buttonsFor({ type: 'task_waiting', agent: 'Ana', taskId: 'a/../b' })).toBeNull();
    expect(buttonsFor({ type: 'system_back', agent: 'Ana', taskId: 'abc' })).toBeNull();
  });
  it('o aviso sai com botões e sem conteúdo de conversa', async () => {
    const sent: any[] = [];
    const n = createNotifier({ configFile: cfg({ token: TOKEN, chatId: '987654321' }), fetchFn: async (_u: string, o: any) => { sent.push(JSON.parse(o.body)); return { ok: true, status: 200 }; }, log: () => {} });
    await n.notify({ type: 'task_waiting', agent: 'Ana', taskId: 'abc123', text: 'segredo da conversa' });
    expect(sent[0].text).toBe('⏳ Ana tem uma tarefa esperando o seu Aprovar.');
    expect(sent[0].reply_markup.inline_keyboard[0]).toHaveLength(2);
    expect(JSON.stringify(sent[0])).not.toMatch(/segredo/);
  });
});

describe('aprovar pelo Telegram', () => {
  const ok = { token: TOKEN, chatId: '987654321' };
  it('aprova e recusa tarefa que está esperando, responde ao toque e tira os botões', async () => {
    const t = setup(ok, [press('ap:t:waiting', 987654321, 1), press('rj:t:waiting', 987654321, 2)]);
    await t.bot.pollOnce();
    expect(t.done).toEqual(['approve:waiting', 'reject:waiting:Recusado pelo Telegram.']);
    expect(answers(t.calls)).toEqual(['Tarefa aprovada.', 'Tarefa recusada.']);
    expect(t.calls.filter((c) => c.method === 'editMessageReplyMarkup')).toHaveLength(2);
  });
  it('não decide tarefa que não está em waiting nem id desconhecido', async () => {
    const t = setup(ok, [press('ap:t:doing', 987654321, 1), press('ap:t:naoexiste', 987654321, 2)]);
    await t.bot.pollOnce();
    expect(t.done).toEqual([]);
    expect(answers(t.calls)).toEqual(['Essa tarefa não está esperando aprovação.', 'Essa tarefa não está esperando aprovação.']);
  });
  it('ignora chat diferente do configurado, sem nem responder', async () => {
    const t = setup(ok, [press('ap:t:waiting', 111111111, 1)]);
    await t.bot.pollOnce();
    expect(t.done).toEqual([]);
    expect(t.calls.map((c) => c.method)).toEqual(['getUpdates']);
  });
  it('aprova a ata uma vez; segunda decisão e dado malformado não fazem nada', async () => {
    const t = setup(ok, [press('ap:m:ata1', 987654321, 1), press('ap:m:ata2', 987654321, 2), press('xx:t:waiting', 987654321, 3)]);
    await t.bot.pollOnce();
    expect(t.done).toEqual(['ata:ata1:approved']);
    expect(answers(t.calls)).toEqual(['Ata aprovada.', 'Essa ata já foi decidida ou ainda não está pronta.', 'Comando desconhecido.']);
  });
  it('avança o offset para não repetir a atualização', async () => {
    const t = setup(ok, [press('ap:t:waiting', 987654321, 41)]);
    await t.bot.pollOnce();
    await t.bot.pollOnce();
    expect(t.calls.filter((c) => c.method === 'getUpdates').map((c) => c.body.offset)).toEqual([0, 42]);
  });
  it('desligado ("poll": false) ou sem configuração: não consulta o Telegram', async () => {
    for (const c of [{ ...ok, poll: false }, null, { token: 'x', chatId: '1' }]) {
      const t = setup(c, [press('ap:t:waiting')]);
      expect(await t.bot.pollOnce()).toEqual({ polled: false });
      expect(t.calls).toEqual([]);
    }
  });
  it('falha de rede vira uma linha de log sem o token e nunca lança', async () => {
    const logs: string[] = [];
    const bot = createTelegramBot({ configFile: cfg({ token: TOKEN, chatId: '987654321' }), fetchFn: async () => { throw new Error(`falhou ${TOKEN}`); }, log: (m: string) => logs.push(m), tasks: {}, meetings: {} });
    expect(await bot.pollOnce()).toEqual({ polled: false });
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toContain(TOKEN);
  });
  it('start/stop liga e desliga o ciclo', () => {
    const t = setup(ok, []);
    t.bot.start(); expect(t.bot.isRunning()).toBe(true);
    t.bot.stop(); expect(t.bot.isRunning()).toBe(false);
  });
});
