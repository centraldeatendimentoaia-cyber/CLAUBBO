import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

type Costs = typeof import('./costs.mjs');
let c: Costs;
beforeAll(async () => {
  process.env.V2_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-costs-'));
  c = (await import('./costs.mjs')) as Costs;
});
const T = new Date(2026, 9, 18, 12).getTime();

describe('custo por agente', () => {
  it('soma por dia e por agente, ignora valor inválido e agente sem id', () => {
    c.recordCost('ana', 0.1, T);
    c.recordCost('ana', 0.25, T);
    c.recordCost('bia', 1, T);
    c.recordCost('', 5, T);
    c.recordCost('ana', undefined, T);
    c.recordCost('ana', -3, T);
    c.recordCost('ana', 2, T + 86_400_000); // outro dia
    const s = c.costSummary(T);
    expect(s.today.ana).toEqual({ usd: 0.35, turns: 2 });
    expect(s.today.bia).toEqual({ usd: 1, turns: 1 });
    expect(s.month.ana).toEqual({ usd: 2.35, turns: 3 }); // o mês junta os dias
    expect(Object.keys(s.today)).toEqual(['ana', 'bia']);
  });
  it('limite diário: padrão e por agente; 0 = sem limite; o restante vale só para o dia', () => {
    expect(c.budgetLeft('ana', T)).toBeNull();
    c.setLimits({ default: 1 });
    expect(c.budgetLeft('ana', T)).toBe(0.65);
    expect(c.budgetLeft('bia', T)).toBe(0);
    c.setLimits({ agents: { bia: 5 } });
    expect(c.budgetLeft('bia', T)).toBe(4);
    expect(c.budgetLeft('ana', T + 2 * 86_400_000)).toBe(1); // dia novo, gasto zerado
    c.setLimits({ default: 0, agents: { bia: 0 } });
    expect(c.budgetLeft('bia', T)).toBeNull();
  });
  it('recusa formato inválido', () => {
    expect(c.setLimits([]).ok).toBe(false);
    expect(c.setLimits({ default: 'abc' }).limits.default).toBe(0);
  });
});
