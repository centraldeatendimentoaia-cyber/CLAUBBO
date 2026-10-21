import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { addPerson, loadTeam, personByToken } from './equipe.mjs';

let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'equipe-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('equipe', () => {
  it('sem arquivo a equipe é vazia', () => {
    expect(loadTeam(dir)).toEqual({ pessoas: [] });
  });

  it('grava só o hash: o token em claro não aparece no arquivo', () => {
    const { token } = addPerson(dir, 'Ana', 'equipe');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(path.join(dir, 'equipe.json'), 'utf8')).not.toContain(token);
    expect(loadTeam(dir).pessoas).toHaveLength(1);
  });

  it('personByToken acerta o token certo e recusa errado e vazio', () => {
    const { token } = addPerson(dir, 'Ana', 'equipe');
    const team = loadTeam(dir);
    expect(personByToken(team, token)).toEqual({ nome: 'Ana', papel: 'equipe' });
    expect(personByToken(team, 'f'.repeat(64))).toBeNull();
    expect(personByToken(team, '')).toBeNull();
    expect(personByToken(team, undefined)).toBeNull();
  });

  it('recusa nome repetido (sem diferenciar maiúsculas) e nome com marcação', () => {
    expect(addPerson(dir, 'Ana', 'equipe').token).toBeTruthy();
    expect(addPerson(dir, 'ana', 'equipe').error).toBeTruthy();
    expect(addPerson(dir, '<script>', 'equipe').error).toBeTruthy();
    expect(addPerson(dir, 'Bia', 'chefe').error).toBeTruthy();
    expect(loadTeam(dir).pessoas).toHaveLength(1);
  });
});
