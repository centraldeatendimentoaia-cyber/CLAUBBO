import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { decideMinutes, getMeeting } from './meetings.mjs';

let dir = '';
const oldData = config.data;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-decide-'));
  config.data = dir;
  const base = { objective: 'Plano', participants: ['a', 'b'], rounds: 1, turns: [], createdAt: 1 };
  fs.writeFileSync(path.join(dir, 'meetings.json'), JSON.stringify([
    { ...base, id: 'pronta', state: 'done', minutes: '## Decisão\n- seguir' },
    { ...base, id: 'andando', state: 'running' },
  ]));
});
afterAll(() => { config.data = oldData; fs.rmSync(dir, { recursive: true, force: true }); });

describe('aprovar a ata', () => {
  it('aprova a ata pronta uma única vez, mesmo com a reunião já encerrada', () => {
    expect(decideMinutes('pronta', 'approved')).toEqual({ ok: true });
    expect(getMeeting('pronta')).toMatchObject({ approval: 'approved', state: 'done' });
    expect(decideMinutes('pronta', 'rejected')).toMatchObject({ ok: false, status: 409 });
    expect(getMeeting('pronta').approval).toBe('approved');
  });
  it('recusa reunião inexistente, sem ata pronta ou decisão inválida', () => {
    expect(decideMinutes('nada', 'approved')).toMatchObject({ ok: false, status: 404 });
    expect(decideMinutes('andando', 'approved')).toMatchObject({ ok: false, status: 409 });
    expect(decideMinutes('pronta', 'talvez')).toMatchObject({ ok: false });
  });
});
