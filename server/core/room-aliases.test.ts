import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-rooms-'));
const ROOMS = [
  { id: 'sala-1', base: 'Escritório', prefix: '' },
  { id: 'reuniao', base: 'Reunião', prefix: '' },
  { id: 'cli-aorus', base: 'AORUS', prefix: '[CLI] ' },
  { id: 'cli-run', base: 'run', prefix: '[CLI] ' },
];
let m: any;

beforeAll(async () => {
  process.env.V2_DATA = data;
  // @ts-expect-error módulo .mjs sem tipos
  m = await import('./room-aliases.mjs');
});

describe('apelidos de sala', () => {
  it('renomeia, com acentos e espaços extras, e mostra o apelido', () => {
    const r = m.renameRoom('sala-1', '  Cozinha   Afetiva – Atenção ', ROOMS);
    expect(r).toEqual({ ok: true, name: 'Cozinha Afetiva – Atenção' });
    expect(m.displayName('sala-1', 'Escritório')).toBe('Cozinha Afetiva – Atenção');
    expect(m.displayName('reuniao', 'Reunião')).toBe('Reunião');
  });

  it('nome vazio volta ao nome original', () => {
    m.renameRoom('reuniao', 'Time', ROOMS);
    const r = m.renameRoom('reuniao', '   ', ROOMS);
    expect(r).toEqual({ ok: true, name: 'Reunião' });
    expect(m.displayName('reuniao', 'Reunião')).toBe('Reunião');
  });

  it('recusa nome repetido, sem ligar para acento nem caixa, mas aceita o próprio nome', () => {
    m.renameRoom('reuniao', 'Café', ROOMS);
    expect(m.renameRoom('sala-1', 'cafe', ROOMS)).toMatchObject({ ok: false, status: 409 });
    expect(m.renameRoom('cli-run', 'aorus', ROOMS)).toMatchObject({ ok: false, status: 409 }); // nome original de outra sala sem apelido
    expect(m.renameRoom('reuniao', 'CAFÉ', ROOMS)).toMatchObject({ ok: true });
  });

  it('sala de terminal: o prefixo [CLI] continua, com ou sem digitar', () => {
    expect(m.renameRoom('cli-aorus', '[CLI] Loja', ROOMS)).toEqual({ ok: true, name: 'Loja' });
    expect(m.renameRoom('cli-run', 'Loja', ROOMS)).toMatchObject({ ok: false, status: 409 });
    expect(m.displayName('cli-aorus', 'AORUS')).toBe('Loja');
  });

  it('recusa sala inexistente e nome longo', () => {
    expect(m.renameRoom('nao-existe', 'x', ROOMS)).toMatchObject({ ok: false, status: 404 });
    expect(m.renameRoom('sala-1', 'x'.repeat(41), ROOMS)).toMatchObject({ ok: false, status: 400 });
  });

  it('persiste em data/room-aliases.json e sobrevive a um "reinício" (módulo recarregado)', async () => {
    m.renameRoom('cli-run', 'Pasta de testes', ROOMS);
    const onDisk = JSON.parse(fs.readFileSync(path.join(data, 'room-aliases.json'), 'utf8'));
    expect(onDisk.aliases['cli-run']).toBe('Pasta de testes');
    vi.resetModules();
    // @ts-expect-error módulo .mjs sem tipos
    const fresh = await import('./room-aliases.mjs');
    expect(fresh.displayName('cli-run', 'run')).toBe('Pasta de testes');
    expect(fresh.displayName('sala-1', 'Escritório')).toBe('Cozinha Afetiva – Atenção');
  });
});
