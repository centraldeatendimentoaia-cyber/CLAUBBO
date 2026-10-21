import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';

const falhar = vi.hoisted(() => ({ ligado: true }));
vi.mock('./xp.mjs', async (orig) => {
  const real = await orig<Record<string, (...a: unknown[]) => unknown>>();
  return { ...real, award: (key: string, ...r: unknown[]) => { if (falhar.ligado && key === 'rotina:ruim') throw new Error('disco cheio'); return real.award(key, ...r); } };
});
// @ts-expect-error módulo .mjs sem tipos
import { recordHistory } from './routines.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { xpOf } from './xp.mjs';

let dir = '';
const old = config.data;
const t = (id: string) => ({ id, agent: 'ana', routine: 'r', state: 'done', addedAt: 1, doneAt: 3, result: 'ok' });
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rout-xp-')); config.data = dir; });
afterAll(() => { config.data = old; fs.rmSync(dir, { recursive: true, force: true }); });

describe('XP nunca quebra o histórico das rotinas', () => {
  it('award que lança não derruba recordHistory nem pula os outros; a execução com falha é refeita depois', () => {
    expect(() => recordHistory([t('ruim'), t('boa')])).not.toThrow();
    expect(xpOf('ana')).toBe(5); // só a "boa"
    falhar.ligado = false;
    recordHistory([t('ruim'), t('boa')]);
    expect(xpOf('ana')).toBe(10); // "ruim" recuperada, "boa" não duplicou
  });
});
