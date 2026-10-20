// A ata chega a todos os participantes do escritório, uma única vez; reunião cancelada não entrega nada.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-mctx-'));
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

let meetings: typeof import('./meetings.mjs');
let ctx: typeof import('./meeting-context.mjs');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const meeting = (id: string) => meetings.getMeeting(id);
const waitDone = async (id: string) => { for (let i = 0; i < 600 && meeting(id)?.state !== 'done'; i++) await sleep(20); expect(meeting(id)?.state).toBe('done'); };
const start = (who = ['ana', 'bia', 'caio']) => {
  const r = meetings.createMeeting({ objective: 'campanha de natal', participants: who, rounds: 1 });
  if (!r.ok) throw new Error(r.error);
  return r.meeting.id as string;
};

beforeAll(async () => {
  const agents = await import('./agents.mjs');
  meetings = await import('./meetings.mjs');
  ctx = await import('./meeting-context.mjs');
  for (const id of ['ana', 'bia', 'caio']) agents.createAgent({ id, name: id.toUpperCase(), model: 'sonnet', effort: 'low', account: 'principal' });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

describe('ata como contexto dos participantes', () => {
  it('cada participante recebe a ata uma única vez, na próxima mensagem/tarefa', async () => {
    const id = start();
    await waitDone(id);
    const minutes = meeting(id)!.minutes as string;
    for (const who of ['ana', 'bia', 'caio']) {
      const system = ctx.withMeetingContext(who, 'SISTEMA');
      expect(system.startsWith('SISTEMA')).toBe(true);
      expect(system).toContain('campanha de natal');
      expect(system).toContain(minutes.slice(0, 30));
      expect(system).toContain('ANA, BIA, CAIO'); // quem participou
      expect(ctx.withMeetingContext(who, 'SISTEMA')).toBe('SISTEMA'); // segunda vez: nada
    }
  });

  it('não duplica: enfileirar a mesma reunião de novo (antes ou depois de entregar) não entrega outra vez', async () => {
    const id = start(['ana', 'bia']);
    await waitDone(id);
    const m = meeting(id)!;
    const again = () => ctx.queueMinutes({ id, objective: m.objective, participants: m.participants, doneAt: Date.now(), minutes: m.minutes! });
    expect(again()).toBe(0); // já estava na fila
    expect(ctx.takeMeetingContext('ana')).toContain('campanha de natal');
    expect(again()).toBe(0); // ana já recebeu: só a bia ainda tem pendente
    expect(ctx.takeMeetingContext('ana')).toBe('');
    expect(ctx.takeMeetingContext('bia')).toContain('campanha de natal');
    expect(ctx.takeMeetingContext('bia')).toBe('');
  });

  it('reunião cancelada não entrega nada', async () => {
    const id = start(['ana', 'bia']);
    await sleep(100);
    meetings.cancelMeeting(id);
    await sleep(1200);
    expect(meeting(id)?.state).toBe('cancelled');
    expect(ctx.takeMeetingContext('ana')).toBe('');
    expect(ctx.takeMeetingContext('bia')).toBe('');
  });

  it('só agentes do escritório: quem não existe aqui (terminal [CLI]) não entra na fila', () => {
    const added = ctx.queueMinutes({ id: 'x1', objective: 'o', participants: ['x:1', 'ana'], doneAt: Date.now(), minutes: 'ata' });
    expect(added).toBe(1);
    expect(ctx.takeMeetingContext('x:1')).toBe('');
    expect(ctx.takeMeetingContext('ana')).toContain('ata');
  });
});
