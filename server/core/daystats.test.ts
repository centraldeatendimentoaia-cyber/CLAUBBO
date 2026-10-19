// "Meu dia" no servidor: dia sem dados, soma dos agentes, "esperando você", persistência e dia inválido.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-stats-'));
process.env.V2_DATA = path.join(tmp, 'data');
const stats = await import('./daystats.mjs');
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const TZ = 'America/Sao_Paulo';
const agent = (id: string, status: string, since: number) => ({
  id, kind: 'main', sessionId: id, roomId: 'sala', account: 'principal', name: id, status, statusSince: since, startedAt: 0,
  stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0 }, tasks: [], recent: [],
});
const view = (agents: unknown[]) => ({ agents, rooms: [{ id: 'sala', name: 'Sala' }], accounts: [{ id: 'principal', name: 'Principal', short: 'P', color: '#fff' }] });

/** 1 amostra por segundo: `a` espera e `b` trabalha durante `secs`. */
function simulate(t0: number, secs: number) {
  for (let s = 0; s <= secs; s++) stats.observeStats(view([agent('a', 'waiting', t0), agent('b', 'working', t0)]), t0 + s * 1000);
}

beforeEach(() => {
  fs.rmSync(path.join(process.env.V2_DATA!, 'stats'), { recursive: true, force: true });
  stats.resetStats(0);
});

describe('GET /api/stats/days e /api/stats sem dados', () => {
  it('lista só hoje e devolve zeros, sem erro', () => {
    const now = Date.now();
    const days = stats.statsDays(TZ, now);
    expect(days.days).toEqual([days.today]);
    const r = stats.statsDay(days.today, TZ, now);
    expect(r.ok).toBe(true);
    const t = r.body!.stats.totals;
    expect(t.ms.working + t.ms.waiting + t.ms.idle + t.ms.shell).toBe(0);
    expect(t.waitWallMs).toBe(0);
    expect(r.body).toMatchObject({ source: 'real', today: days.today });
  });

  it('sem o parâmetro day usa hoje; tz inválido cai no fuso do sistema', () => {
    const r = stats.statsDay(null, 'Nao/Existe');
    expect(r.ok).toBe(true);
    expect(r.body!.stats.day).toBe(r.body!.today);
  });

  it('dia inválido devolve 400', () => {
    expect(stats.statsDay('ontem', TZ)).toMatchObject({ ok: false, status: 400 });
    expect(stats.statsDay('2026-13-45', TZ)).toMatchObject({ ok: false, status: 400 });
  });
});

describe('com agentes', () => {
  it('soma o tempo de todos os agentes e separa o "esperando você"', () => {
    const t0 = Date.now() - 200_000;
    simulate(t0, 100);
    const r = stats.statsDay(undefined, TZ, t0 + 101_000);
    const t = r.body!.stats.totals;
    expect(t.ms.waiting).toBeGreaterThan(95_000); // a: mão levantada
    expect(t.ms.working).toBeGreaterThan(95_000); // b: trabalhando
    expect(t.waitWallMs).toBeGreaterThan(95_000);
    expect(stats.statsDays(TZ, t0 + 101_000).days).toContain(r.body!.today);
  });
});

describe('persistência', () => {
  it('grava em data/stats e volta igual depois de reiniciar (memória zerada)', () => {
    const t0 = Date.now() - 200_000;
    simulate(t0, 60);
    expect(stats.flushStats()).toBeGreaterThan(0);
    expect(stats.flushStats()).toBe(0); // nada mudou desde a gravação
    const files = fs.readdirSync(path.join(process.env.V2_DATA!, 'stats'));
    expect(files.every((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))).toBe(true);
    const before = stats.statsDay(undefined, TZ, t0 + 61_000).body!.stats.totals.ms;
    stats.resetStats(t0 + 61_000);
    const after = stats.statsDay(undefined, TZ, t0 + 61_000).body!.stats.totals.ms;
    expect(after).toEqual(before);
    expect(after.waiting).toBeGreaterThan(50_000);
  });
});
