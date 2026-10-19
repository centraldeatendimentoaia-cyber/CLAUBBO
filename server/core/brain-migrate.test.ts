import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulos .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulos .mjs sem tipos
import { BRAIN_DIR, migrateBrainFolder } from './brain.mjs';

let dir = '';
let before = '';
const put = (...p: string[]) => {
  const f = path.join(dir, ...p.slice(0, -1));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, p.at(-1)!);
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-mig-'));
  before = config.brain;
  config.brain = dir;
});
afterEach(() => {
  config.brain = before;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('migrateBrainFolder', () => {
  it('sem pasta antiga não faz nada', () => {
    expect(migrateBrainFolder()).toEqual({ moved: 0, kept: 0 });
    expect(fs.existsSync(path.join(dir, BRAIN_DIR))).toBe(false);
  });

  it('só a pasta antiga: renomeia e mantém todo o conteúdo', () => {
    put('Agents Office', 'skills', 'x', 'SKILL.md', 'skill x');
    put('Agents Office', 'feedback', 'ana.md', '[regra] a');
    expect(migrateBrainFolder()).toEqual({ moved: 1, kept: 0 });
    expect(fs.existsSync(path.join(dir, 'Agents Office'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, BRAIN_DIR, 'skills', 'x', 'SKILL.md'), 'utf8')).toBe('skill x');
    expect(fs.readFileSync(path.join(dir, BRAIN_DIR, 'feedback', 'ana.md'), 'utf8')).toBe('[regra] a');
  });

  it('as duas existem: move o que falta, nunca sobrescreve e não apaga o que ficou', () => {
    put('Agents Office', 'skills', 'x', 'SKILL.md', 'antiga x');
    put('Agents Office', 'skills', 'y', 'SKILL.md', 'antiga y');
    put('Agents Office', 'feedback', 'ana.md', 'antiga ana');
    put(BRAIN_DIR, 'skills', 'x', 'SKILL.md', 'nova x');
    const r = migrateBrainFolder();
    expect(r).toEqual({ moved: 2, kept: 1 });
    expect(fs.readFileSync(path.join(dir, BRAIN_DIR, 'skills', 'x', 'SKILL.md'), 'utf8')).toBe('nova x');
    expect(fs.readFileSync(path.join(dir, BRAIN_DIR, 'skills', 'y', 'SKILL.md'), 'utf8')).toBe('antiga y');
    expect(fs.readFileSync(path.join(dir, BRAIN_DIR, 'feedback', 'ana.md'), 'utf8')).toBe('antiga ana');
    // o conflito (x/SKILL.md) continua na pasta antiga
    expect(fs.readFileSync(path.join(dir, 'Agents Office', 'skills', 'x', 'SKILL.md'), 'utf8')).toBe('antiga x');
  });

  it('rodar de novo não muda nada', () => {
    put('Agents Office', 'feedback', 'ana.md', 'a');
    migrateBrainFolder();
    expect(migrateBrainFolder()).toEqual({ moved: 0, kept: 0 });
  });
});
