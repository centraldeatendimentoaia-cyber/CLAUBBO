import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type ChatApi = { pushMessage: (id: string, who: string, text: string) => void; history: (id: string) => { text: string }[]; fullHistory: (id: string) => { text: string; at: number }[] };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-chatarq-'));
beforeAll(() => { process.env.V2_DATA = tmp; });
afterAll(() => { delete process.env.V2_DATA; fs.rmSync(tmp, { recursive: true, force: true }); });

async function loadChat(): Promise<ChatApi> {
  vi.resetModules(); // simula o servidor reiniciando
  // @ts-expect-error módulo .mjs sem tipos
  return (await import('./chat.mjs')) as ChatApi;
}

describe('histórico do chat: nada se perde no teto de 200', () => {
  it('as mais antigas vão para o arquivo morto; o histórico completo tem todas, sem repetir, em ordem; sobrevive a reinício', async () => {
    let chat = await loadChat();
    let clock = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock++);
    for (let i = 0; i < 205; i++) chat.pushMessage('ana', i % 2 ? 'agent' : 'user', `mensagem ${i} — ação`);
    vi.restoreAllMocks();
    expect(chat.history('ana')).toHaveLength(200);
    expect(chat.history('ana')[0]!.text).toBe('mensagem 5 — ação');
    expect(fs.existsSync(path.join(tmp, 'chat', 'arquivo', 'ana.jsonl'))).toBe(true);
    const expected = Array.from({ length: 205 }, (_, i) => `mensagem ${i} — ação`);
    expect(chat.fullHistory('ana').map((m) => m.text)).toEqual(expected);
    chat = await loadChat(); // reinício
    expect(chat.fullHistory('ana').map((m) => m.text)).toEqual(expected);
  });
});
