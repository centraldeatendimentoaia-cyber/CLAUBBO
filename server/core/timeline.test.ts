import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseTimeline } from '../../shared/timeline';

type Snap = { rooms: object[]; agents: object[]; accounts: object[] };
type Api = {
  observeTimeline: (s: Snap, now: number, every?: number) => void;
  endTimeline: (now: number) => void;
  timelineDays: () => { recording: boolean; days: { day: string; bytes: number; from: number; to: number }[] };
  timelineDay: (d: string) => string | null;
  resetTimeline: () => void;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-timeline-'));
beforeAll(() => { process.env.V2_DATA = tmp; });
afterAll(() => { delete process.env.V2_DATA; fs.rmSync(tmp, { recursive: true, force: true }); });

const room = { id: 'r1', name: 'Sala', path: '/x', slot: 0, seed: 1, createdAt: 1 };
const agent = (status: string, account = 'secundaria') => ({ id: 'escritorio:ana', kind: 'main', roomId: 'r1', name: 'Ana', look: 'f', role: 'Agente principal', account, status, statusSince: 1, startedAt: 1, seed: 7 });
const snap = (status = 'idle'): Snap => ({ rooms: [room], agents: [agent(status)], accounts: [{ id: 'secundaria', short: 'S', name: 'SECUNDARIA', color: '#fff', sessions: 1, usageStatus: 'disabled' }] });

async function load(): Promise<Api> {
  vi.resetModules();
  // @ts-expect-error módulo .mjs sem tipos
  return (await import('./timeline.mjs')) as Api;
}
const T0 = Date.parse('2026-10-18T15:00:00');
const day = '2026-10-18';

describe('linha do tempo (timelapse)', () => {
  it('grava keyframe de subida, só deltas quando algo muda e outro keyframe depois do intervalo; a conta de cada agente vai junto', async () => {
    const t = await load();
    t.observeTimeline(snap('idle'), T0, 300_000);
    t.observeTimeline(snap('idle'), T0 + 5_000, 300_000); // nada mudou: não grava
    t.observeTimeline(snap('working'), T0 + 10_000, 300_000);
    t.observeTimeline(snap('working'), T0 + 310_000, 300_000); // passou o intervalo: novo keyframe
    const recs = parseTimeline(t.timelineDay(day)!);
    expect(recs.map((r) => r.t)).toEqual(['k', 'd', 'k']);
    expect(recs[0]).toMatchObject({ boot: true, every: 300_000 });
    expect((recs[0] as { agents: { account: string }[] }).agents[0]!.account).toBe('secundaria');
    expect((recs[1] as { agents: [string, { status: string }][] }).agents[0]![1].status).toBe('working');
  });

  it('lista os dias com bytes e primeiro/último horário; marca o fim ao parar; dia inválido ou sem gravação = null', async () => {
    const t = await load();
    t.resetTimeline();
    t.observeTimeline(snap('working'), T0 + 400_000); // processo novo: keyframe de subida
    t.endTimeline(T0 + 400_000);
    const info = t.timelineDays();
    expect(info.recording).toBe(true);
    expect(info.days).toHaveLength(1);
    expect(info.days[0]).toMatchObject({ day, from: T0, to: T0 + 400_000 });
    expect(info.days[0]!.bytes).toBeGreaterThan(0);
    expect(t.timelineDay('../../etc/passwd')).toBeNull();
    expect(t.timelineDay('2001-01-01')).toBeNull();
  });
});
