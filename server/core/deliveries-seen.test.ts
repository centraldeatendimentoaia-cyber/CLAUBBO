import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { deliveriesFrom, filesOf, loadSeen, markSeen } from './deliveries.mjs';

let dir = '';
const oldData = config.data;
const agents = [{ id: 'ana', name: 'Ana', account: 'principal', room: 'r1' }];
const rooms = [{ id: 'r1', name: 'Marketing' }];
const task = (over: Record<string, unknown>) => ({ id: 't1', agent: 'ana', title: 'Campanha', text: 'Campanha', state: 'done', addedAt: 1, startedAt: 2, doneAt: 3, result: 'Pronto. A campanha ficou assim.', ...over });

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliv-seen-'));
  config.data = dir;
});
afterAll(() => {
  config.data = oldData;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('entregas vistas', () => {
  it('marca como vista, só acrescenta e ignora repetido e lixo', () => {
    expect(markSeen(['a', 'b', 'a', '', 7]).added).toBe(3); // a, b, "7"
    expect(markSeen(['a', 'c']).added).toBe(1);
    expect(markSeen('nada').added).toBe(0);
    expect([...loadSeen()]).toEqual(['a', 'b', '7', 'c']);
  });

  it('a entrega sai com seen true só quando o id está no conjunto', () => {
    const list = deliveriesFrom([task({ id: 'x', doneAt: 5 }), task({ id: 'y', doneAt: 4 })], agents, rooms, 'UTC', new Set(['escritorio:ana:y']));
    expect(list.map((d: { id: string; seen: boolean }) => [d.id, d.seen])).toEqual([['escritorio:ana:x', false], ['escritorio:ana:y', true]]);
  });
});

describe('arquivos da entrega', () => {
  const patch = 'diff --git a/server/a.mjs b/server/a.mjs\nindex 1..2 100644\n--- a/server/a.mjs\n+++ b/server/a.mjs\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/novo.ts b/novo.ts\nnew file mode 100644\n--- /dev/null\n+++ b/novo.ts\n@@ -0,0 +1 @@\n+z\n';
  it('lê o diff: alterado e criado', () => {
    expect(filesOf({ diff: { patch } })).toEqual([{ path: 'server/a.mjs' }, { path: 'novo.ts', created: true }]);
  });
  it('sem patch, usa o stat; sem nada, lista vazia', () => {
    expect(filesOf({ diff: { stat: ' client/x.ts | 4 ++--\n 1 file changed, 2 insertions(+)', patch: '' } })).toEqual([{ path: 'client/x.ts' }]);
    expect(filesOf({})).toEqual([]);
  });
  it('a entrega leva files e edited', () => {
    const [d] = deliveriesFrom([task({ diff: { patch, stat: '' } })], agents, rooms, 'UTC');
    expect(d.edited).toBe(2);
    expect(d.files).toHaveLength(2);
    const [e] = deliveriesFrom([task({})], agents, rooms, 'UTC');
    expect(e.files).toBeUndefined();
  });
});
