// Cancelar reunião: durante a rodada, durante a ata e depois de "recarregar" (o estado vem do arquivo). Usa o Claude falso e uma pasta temporária.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-meet-'));
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
process.env.V2_DATA = path.join(tmp, 'data');
process.env.V2_HOME = tmp;
process.env.V2_BRAIN = path.join(tmp, 'brain');
process.env.V2_OLD_DATA = path.join(tmp, 'nada');
fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
fs.writeFileSync(path.join(tmp, '.claude', '.credentials.json'), '{}'); // conta principal "conectada" de mentira (conteúdo nunca é lido)
process.env.V2_CLAUDE_BIN = process.execPath;
process.env.V2_CLAUDE_PRE = JSON.stringify([path.join(here, '..', 'test', 'fake-claude.mjs')]);
process.env.FAKE_DELAY_MS = '400';
fs.mkdirSync(process.env.V2_DATA, { recursive: true });

let meetings: typeof import('./meetings.mjs');
let agents: typeof import('./agents.mjs');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stateOf = (id: string) => JSON.parse(fs.readFileSync(path.join(process.env.V2_DATA!, 'meetings.json'), 'utf8')).find((m: { id: string }) => m.id === id);
const start = (rounds = 3) => {
  const r = meetings.createMeeting({ objective: 'teste de cancelamento', participants: ['ana', 'bia'], rounds });
  if (!r.ok) throw new Error(r.error);
  return r.meeting.id as string;
};
const minutesFiles = () => { try { return fs.readdirSync(path.join(tmp, 'brain', 'Reunioes')); } catch { return []; } };
const chat = () => { try { return fs.readFileSync(path.join(process.env.V2_DATA!, 'chat', 'ana.json'), 'utf8'); } catch { return ''; } };

beforeAll(async () => {
  agents = await import('./agents.mjs');
  meetings = await import('./meetings.mjs');
  for (const id of ['ana', 'bia']) agents.createAgent({ id, name: id, model: 'sonnet', effort: 'low', account: 'principal' });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('cancelar reunião', () => {
  it('durante a rodada: para de falar, fica "cancelled" no arquivo e a fala em curso é descartada', async () => {
    const id = start(3);
    await sleep(600); // 1ª fala pronta, a 2ª em curso
    expect(meetings.cancelMeeting(id)).toEqual({ ok: true });
    const frozen = stateOf(id).turns.length;
    await sleep(1500); // tempo de sobra para qualquer fala atrasada
    const m = stateOf(id);
    expect(m.state).toBe('cancelled');
    expect(m.turns.length).toBe(frozen);
    expect(m.turns.length).toBeLessThan(6);
    expect(m.speaking).toBe('');
    expect(m.minutes).toBeUndefined();
  });

  it('durante a ata: continua cancelada, sem ata e sem mensagem', async () => {
    const before = minutesFiles().length;
    const chatBefore = chat();
    const id = start(1);
    for (let i = 0; i < 400 && stateOf(id).turns.length < 2; i++) await sleep(10); // espera as 2 falas; a ata começa em seguida (400 ms)
    expect(stateOf(id).turns).toHaveLength(2);
    expect(meetings.cancelMeeting(id)).toEqual({ ok: true });
    await sleep(1500);
    const m = stateOf(id);
    expect(m.state).toBe('cancelled');
    expect(m.minutes).toBeUndefined();
    expect(m.note).toBeUndefined();
    expect(minutesFiles().length).toBe(before);
    expect(chat()).toBe(chatBefore);
  });

  it('depois de recarregar a página: o servidor devolve a reunião cancelada e ela não volta a andar', async () => {
    const id = start(2);
    await sleep(300);
    meetings.cancelMeeting(id);
    await sleep(800);
    expect(meetings.getMeeting(id)?.state).toBe('cancelled'); // o que GET /api/ops/state devolve
    expect(meetings.inMeeting().has('ana')).toBe(false);
    expect(meetings.cancelMeeting(id)).toMatchObject({ ok: false, status: 409 });
    expect(stateOf(id).state).toBe('cancelled');
  });

  it('reunião inexistente dá 404', () => {
    expect(meetings.cancelMeeting('nao-existe')).toMatchObject({ ok: false, status: 404 });
  });
});
