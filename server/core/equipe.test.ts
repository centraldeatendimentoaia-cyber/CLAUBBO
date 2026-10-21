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

describe('equipe: endurecimento', () => {
  it('recusa nomes reservados, também com espaço, caixa e caracteres de largura total', () => {
    for (const n of ['dono', 'Celular', ' AGENTES ', 'ｄｏｎｏ']) expect(addPerson(dir, n, 'equipe').error).toBeTruthy();
    expect(fs.existsSync(path.join(dir, 'equipe.json'))).toBe(false);
  });

  it('unicidade usa NFKC', () => {
    expect(addPerson(dir, 'Ａna', 'equipe').token).toBeTruthy();
    expect(addPerson(dir, 'ana', 'equipe').error).toBeTruthy();
  });

  it('arquivo ilegível ou estragado: lança e não reescreve', () => {
    const file = path.join(dir, 'equipe.json');
    fs.writeFileSync(file, '{ não é json');
    expect(() => addPerson(dir, 'Ana', 'equipe')).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('{ não é json');
  });

  it('linha inválida existente não é descartada: lança e mantém o arquivo', () => {
    const file = path.join(dir, 'equipe.json');
    const txt = JSON.stringify({ pessoas: [{ nome: 'Velha', papel: 'equipe', hash: 'curto' }] });
    fs.writeFileSync(file, txt);
    expect(() => addPerson(dir, 'Ana', 'equipe')).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(txt);
  });

  it('personByToken ignora hash de tamanho errado sem lançar', () => {
    expect(personByToken({ pessoas: [{ nome: 'X', papel: 'equipe', hash: 'abc' }] }, 'a'.repeat(64))).toBeNull();
  });
});
