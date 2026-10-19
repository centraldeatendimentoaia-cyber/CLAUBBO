// Reinício do servidor no meio de uma reunião: ela vira "interrupted" e nada mais a mexe (sem ata, nota ou mensagem).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-intr-'));
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
process.env.V2_DATA = path.join(tmp, 'data');
process.env.V2_HOME = tmp;
process.env.V2_BRAIN = path.join(tmp, 'brain');
process.env.V2_OLD_DATA = path.join(tmp, 'nada');
fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
fs.writeFileSync(path.join(tmp, '.claude', '.credentials.json'), '{}'); // conta "conectada" de mentira (conteúdo nunca é lido)
process.env.V2_CLAUDE_BIN = process.execPath;
process.env.V2_CLAUDE_PRE = JSON.stringify([path.join(here, '..', 'test', 'fake-claude.mjs')]);
process.env.FAKE_DELAY_MS = '300';
fs.mkdirSync(process.env.V2_DATA, { recursive: true });

const FILE = path.join(process.env.V2_DATA, 'meetings.json');
let meetings: typeof import('./meetings.mjs');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const read = () => JSON.parse(fs.readFileSync(FILE, 'utf8')) as Array<Record<string, unknown> & { id: string }>;
const mk = (id: string, state: string, extra: object = {}) => ({ id, objective: `reunião ${id}`, participants: ['ana', 'bia'], rounds: 2, state, turns: [], createdAt: 1, ...extra });

beforeAll(async () => {
  const agents = await import('./agents.mjs');
  meetings = await import('./meetings.mjs');
  for (const id of ['ana', 'bia']) agents.createAgent({ id, name: id, model: 'sonnet', effort: 'low', account: 'principal' });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('reunião interrompida pelo reinício', () => {
  it('em andamento, na fila e escrevendo a ata viram "interrupted" com a hora; done, cancelled e error não mudam', () => {
    const done = mk('d', 'done', { minutes: 'ata', note: 'x.md', doneAt: 5 });
    const cancelled = mk('c', 'cancelled', { doneAt: 6 });
    const failed = mk('e', 'error', { error: 'boom', doneAt: 7 });
    fs.writeFileSync(FILE, JSON.stringify([mk('r', 'running', { speaking: 'ana', turns: [{ round: 1, agent: 'ana', name: 'ana', text: 'oi' }] }), mk('q', 'queued'), mk('w', 'running', { speaking: 'ana' }), done, cancelled, failed]));
    const before = read();
    const ids = meetings.interruptRunning(1234);
    expect(ids.sort()).toEqual(['q', 'r', 'w']);
    const after = Object.fromEntries(read().map((m) => [m.id, m]));
    for (const id of ['r', 'q', 'w']) expect(after[id]).toMatchObject({ state: 'interrupted', interruptedAt: 1234, speaking: '' });
    expect(after.r.turns).toHaveLength(1); // o que já foi dito fica
    for (const id of ['d', 'c', 'e']) expect(after[id]).toEqual(before.find((m) => m.id === id));
    expect(meetings.inMeeting().size).toBe(0); // ninguém fica preso na sala de reunião
  });

  it('ligar de novo não muda nada (idempotente) e a reunião interrompida não pode ser cancelada', () => {
    expect(meetings.interruptRunning(9999)).toEqual([]);
    expect(read().find((m) => m.id === 'r')).toMatchObject({ state: 'interrupted', interruptedAt: 1234 });
    expect(meetings.cancelMeeting('r')).toMatchObject({ ok: false, status: 409 });
  });

  it('com a reunião viva e o arquivo marcado "interrupted": falas atrasadas e a ata não a reabrem, sem nota nem mensagem', async () => {
    const r = meetings.createMeeting({ objective: 'atrasada', participants: ['ana', 'bia'], rounds: 2 });
    if (!r.ok) throw new Error(r.error);
    const id = r.meeting.id as string;
    await sleep(150);
    const all = read();
    all.find((m) => m.id === id)!.state = 'interrupted'; // o que o servidor faz ao ligar
    fs.writeFileSync(FILE, JSON.stringify(all));
    const frozen = (read().find((m) => m.id === id)!.turns as unknown[]).length;
    await sleep(2000);
    const m = read().find((x) => x.id === id)!;
    expect(m.state).toBe('interrupted');
    expect(m.turns as unknown[]).toHaveLength(frozen);
    expect(m.minutes).toBeUndefined();
    expect(fs.existsSync(path.join(tmp, 'brain', 'Reunioes'))).toBe(false);
    expect(fs.existsSync(path.join(process.env.V2_DATA!, 'chat', 'ana.json'))).toBe(false);
  });
});
