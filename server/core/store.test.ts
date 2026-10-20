import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error módulo .mjs sem tipos
import { readJson, writeJson } from './store.mjs';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-')); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

const aside = () => fs.readdirSync(dir).filter((f) => f.includes('.corrompido-'));

describe('store: JSON corrompido', () => {
  it('arquivo ausente devolve o fallback sem criar nada', () => {
    expect(readJson(path.join(dir, 'x.json'), [])).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('arquivo corrompido é renomeado, registrado e não é sobrescrito pelo próximo salvamento', () => {
    const file = path.join(dir, 'rooms.json');
    fs.writeFileSync(file, '{"salas": [1, 2, '); // truncado
    expect(readJson(file, [])).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
    const [kept] = aside();
    expect(kept).toMatch(/^rooms\.json\.corrompido-/);
    expect(fs.readFileSync(path.join(dir, kept), 'utf8')).toBe('{"salas": [1, 2, ');
    expect(console.error).toHaveBeenCalledTimes(1);

    writeJson(file, []); // o fluxo normal grava o fallback
    expect(fs.readFileSync(path.join(dir, kept), 'utf8')).toBe('{"salas": [1, 2, '); // ilegível intacto
    expect(readJson(file, null)).toEqual([]);
  });

  it('JSON válido continua sendo lido e nada é renomeado', () => {
    const file = path.join(dir, 'ok.json');
    writeJson(file, { a: 1 });
    expect(readJson(file, {})).toEqual({ a: 1 });
    expect(aside()).toEqual([]);
  });

  it('se não der para guardar o arquivo ilegível, lança em vez de seguir', () => {
    const file = path.join(dir, 'a.json');
    fs.writeFileSync(file, 'lixo');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('EPERM'); });
    expect(() => readJson(file, [])).toThrow('EPERM');
    expect(fs.readFileSync(file, 'utf8')).toBe('lixo');
  });

  it('gravação atômica não deixa arquivo temporário', () => {
    const file = path.join(dir, 'w.json');
    writeJson(file, { n: 1 });
    writeJson(file, { n: 2 });
    expect(fs.readdirSync(dir)).toEqual(['w.json']);
    expect(readJson(file, null)).toEqual({ n: 2 });
  });
});
