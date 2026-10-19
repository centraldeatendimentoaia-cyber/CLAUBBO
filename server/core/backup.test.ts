import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { createBackup, listBackups, restoreBackup } from './backup.mjs';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-backup-'));
afterAll(() => fs.rmSync(data, { recursive: true, force: true }));
const put = (rel: string, text: string) => { const f = path.join(data, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const read = (rel: string) => fs.readFileSync(path.join(data, rel), 'utf8');

describe('backup e restauração de data/', () => {
  it('copia os dados (com subpastas) e deixa de fora backups/, run/ e timeline/', () => {
    put('agents.json', 'v1'); put('chat/ana.json', 'conversa v1'); put('run/grande.bin', 'x'); put('timeline/2026-10-18.jsonl', 'x');
    const b = createBackup(data, Date.parse('2026-10-18T10:00:00'));
    expect(b.name).toBe('2026-10-18_100000');
    expect(fs.readFileSync(path.join(data, 'backups', b.name, 'chat', 'ana.json'), 'utf8')).toBe('conversa v1');
    expect(fs.existsSync(path.join(data, 'backups', b.name, 'run'))).toBe(false);
    expect(fs.existsSync(path.join(data, 'backups', b.name, 'timeline'))).toBe(false);
    expect(fs.existsSync(path.join(data, 'backups', b.name, 'backups'))).toBe(false);
    expect(listBackups(data).map((x: { name: string }) => x.name)).toEqual(['2026-10-18_100000']);
  });

  it('restaurar volta o conteúdo, guarda antes o estado atual e não apaga o que é mais novo que o backup', () => {
    put('agents.json', 'v2 (depois do backup)'); put('novo.json', 'só existe agora');
    const r = restoreBackup(data, '2026-10-18_100000', Date.parse('2026-10-18T11:00:00'));
    expect(r).toMatchObject({ ok: true, restored: '2026-10-18_100000' });
    expect(read('agents.json')).toBe('v1');
    expect(read('novo.json')).toBe('só existe agora');
    const undo = listBackups(data).find((x: { auto: boolean }) => x.auto);
    expect(undo?.name).toBe(r.savedBefore);
    expect(fs.readFileSync(path.join(data, 'backups', r.savedBefore, 'agents.json'), 'utf8')).toBe('v2 (depois do backup)');
  });

  it('nome inválido (tentativa de caminho) ou inexistente: recusa sem tocar em nada', () => {
    expect(restoreBackup(data, '../../etc', 1)).toMatchObject({ ok: false, status: 400 });
    expect(restoreBackup(data, '2001-01-01_000000')).toMatchObject({ ok: false, status: 404 });
    expect(read('agents.json')).toBe('v1');
  });
});
