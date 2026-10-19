import fs from 'node:fs';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { cleanSystem, stripSystem } from './system-config.mjs';

const folder = fs.mkdtempSync(`${os.tmpdir()}/v2-sys-`).replace(/\\/g, '/');

describe('sistema do agente', () => {
  it('local: pasta existente, comando de uma linha e porta válida', () => {
    const r = cleanSystem({ type: 'local', name: 'Loja', folder, command: 'npm start', port: 3000 });
    expect(r.ok).toBe(true);
    expect(r.system).toMatchObject({ type: 'local', name: 'Loja', command: 'npm start', port: 3000, autoRestart: true });
  });
  it('recusa pasta inexistente, comando vazio/multilinha e porta fora do intervalo', () => {
    expect(cleanSystem({ type: 'local', folder: `${folder}/nao-existe`, command: 'x', port: 1 }).ok).toBe(false);
    expect(cleanSystem({ type: 'local', folder, command: '', port: 1 }).ok).toBe(false);
    expect(cleanSystem({ type: 'local', folder, command: 'a\nb', port: 1 }).ok).toBe(false);
    expect(cleanSystem({ type: 'local', folder, command: 'x', port: 70000 }).ok).toBe(false);
    expect(cleanSystem({ type: 'local', folder: 'relativo', command: 'x', port: 1 }).ok).toBe(false);
  });
  it('url só http/https; tipo desconhecido e ausência', () => {
    expect(cleanSystem({ type: 'url', url: 'https://exemplo.com' }).ok).toBe(true);
    expect(cleanSystem({ type: 'url', url: 'file:///c:/x' }).ok).toBe(false);
    expect(cleanSystem({ type: 'ftp' }).ok).toBe(false);
    expect(cleanSystem(null)).toEqual({ ok: true, system: null });
  });
  it('proposta de agente nunca leva o sistema (o comando só entra pelas mãos do João)', () => {
    expect(stripSystem({ id: 'x', name: 'X', system: { type: 'local', command: 'calc' } })).toEqual({ id: 'x', name: 'X' });
  });
});
