import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { listRoutines, recordHistory } from './routines.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { parseWhen } from './when.mjs';

let dir = '';
const oldData = config.data;
const task = (over: Record<string, unknown>) => ({ id: 't1', agent: 'ana', routine: 'r1', state: 'done', addedAt: 1, startedAt: 2, doneAt: 3, result: 'ok', ...over });
const lines = () => fs.readFileSync(path.join(dir, 'routines-history.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rout-hist-'));
  config.data = dir;
  const w = parseWhen('dias úteis às 8h');
  fs.writeFileSync(path.join(dir, 'routines.json'), JSON.stringify({ routines: [{ id: 'r1', title: 'Bom dia', agent: 'ana', text: 'x', whenText: 'dias úteis às 8h', when: w.when, paused: false, lastRun: 0 }] }));
});
afterAll(() => {
  config.data = oldData;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('histórico das rotinas', () => {
  it('grava só tarefas de rotina terminadas, com início, fim, ok/erro e 300 letras do resultado', () => {
    const n = recordHistory([
      task({ id: 'a', result: 'x'.repeat(500) }),
      task({ id: 'b', error: 'falhou feio', result: undefined }),
      task({ id: 'c', state: 'doing' }),
      task({ id: 'd', routine: undefined }),
    ]);
    expect(n).toBe(2);
    const [a, b] = lines();
    expect(a).toMatchObject({ routine: 'r1', task: 'a', startedAt: 2, finishedAt: 3, ok: true });
    expect(a.result).toHaveLength(300);
    expect(b).toMatchObject({ task: 'b', ok: false, result: 'falhou feio' });
  });

  it('não repete uma execução já gravada e só acrescenta ao arquivo', () => {
    expect(recordHistory([task({ id: 'a' }), task({ id: 'e', doneAt: 9 })])).toBe(1);
    expect(lines().map((l) => l.task)).toEqual(['a', 'b', 'e']);
  });

  it('a lista de rotinas traz as últimas 10, da mais nova para a mais antiga', () => {
    recordHistory(Array.from({ length: 15 }, (_, i) => task({ id: `m${i}`, doneAt: 100 + i })));
    const [r] = listRoutines();
    expect(r.history).toHaveLength(10);
    expect(r.history[0].task).toBe('m14');
    expect(r.history[9].task).toBe('m5');
  });
});
