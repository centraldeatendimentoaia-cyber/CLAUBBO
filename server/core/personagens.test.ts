import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESSORIES, BOTTOM_STYLES, FACIAL_HAIR, HAIR_STYLES, PART_KEYS, TOP_STYLES } from '../../shared/appearance';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { addPerson } from './equipe.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { ESTILOS, PECAS, listarEquipe, podeEditar, salvarPersonagem, validarPecas } from './personagens.mjs';

const oldData = config.data;
let dir = '';
beforeEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'personagens-'));
  config.data = dir;
});
afterAll(() => {
  config.data = oldData;
  fs.rmSync(dir, { recursive: true, force: true });
});

const dono = { nome: 'dono', papel: 'dono' };
const ana = { nome: 'Ana', papel: 'equipe' };
const bia = { nome: 'Bia', papel: 'equipe' };
const corpo = { seed: 7, look: 'f', parts: { hair: '#112233', hairStyle: 'bob' } };

describe('listas iguais às de shared/appearance.ts', () => {
  it('peças e estilos', () => {
    expect(PECAS).toEqual([...PART_KEYS]);
    expect(ESTILOS).toEqual({ hairStyle: [...HAIR_STYLES], topStyle: [...TOP_STYLES], bottomStyle: [...BOTTOM_STYLES], accessory: [...ACCESSORIES], facialHair: [...FACIAL_HAIR] });
  });
});

describe('listarEquipe', () => {
  it('só o dono quando não há equipe; dono com a fantasia JMAL e sem hash', () => {
    const l = listarEquipe();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ nome: 'dono', papel: 'dono', rotulo: 'JMAL', costume: 'jmal', custom: false });
  });
  it('inclui a equipe, sem costume e sem hash; seed padrão estável', () => {
    addPerson(dir, 'Ana', 'equipe');
    const l = listarEquipe();
    expect(l.map((p: any) => p.nome)).toEqual(['dono', 'Ana']);
    expect(l[1].costume).toBeUndefined();
    expect(JSON.stringify(l)).not.toMatch(/hash|token/);
    expect(listarEquipe()[1].seed).toBe(l[1].seed);
  });
});

describe('podeEditar', () => {
  it('dono edita qualquer um; a pessoa só o próprio (sem diferenciar maiúsculas); agente e sem nome não', () => {
    expect(podeEditar(dono, 'Ana')).toBe(true);
    expect(podeEditar(ana, ' ana ')).toBe(true);
    expect(podeEditar(ana, 'Bia')).toBe(false);
    expect(podeEditar({ nome: 'agentes', papel: 'agente' }, 'Ana')).toBe(false);
    expect(podeEditar({ papel: 'equipe' }, 'Ana')).toBe(false);
  });
});

describe('salvarPersonagem', () => {
  it('a pessoa salva o próprio personagem e a lista reflete', () => {
    addPerson(dir, 'Ana', 'equipe');
    const r = salvarPersonagem({ quem: ana, alvo: 'Ana', corpo });
    expect(r).toMatchObject({ ok: true, status: 200 });
    expect(listarEquipe()[1]).toMatchObject({ seed: 7, look: 'f', parts: { hair: '#112233', hairStyle: 'bob' }, custom: true });
  });
  it('um do time não mexe no de outro (403) e o arquivo não muda', () => {
    addPerson(dir, 'Ana', 'equipe'); addPerson(dir, 'Bia', 'equipe');
    expect(salvarPersonagem({ quem: bia, alvo: 'Ana', corpo }).status).toBe(403);
    expect(fs.existsSync(path.join(dir, 'personagens.json'))).toBe(false);
  });
  it('o dono edita o de outro; o personagem do dono nunca perde a fantasia JMAL', () => {
    addPerson(dir, 'Ana', 'equipe');
    expect(salvarPersonagem({ quem: dono, alvo: 'Ana', corpo }).ok).toBe(true);
    expect(salvarPersonagem({ quem: dono, alvo: 'dono', corpo: { ...corpo, costume: 'reaper' } }).ok).toBe(true);
    expect(listarEquipe()[0].costume).toBe('jmal');
  });
  it('pessoa inexistente é 404', () => {
    expect(salvarPersonagem({ quem: dono, alvo: 'Zé', corpo }).status).toBe(404);
  });
  it('corpo inválido é 400 e não grava: peça fora da lista, cor ruim, seed, look', () => {
    for (const ruim of [
      { ...corpo, parts: { hairStyle: 'raio' } }, { ...corpo, parts: { hair: 'vermelho' } }, { ...corpo, parts: { costume: 'jmal' } },
      { ...corpo, parts: [] }, { ...corpo, seed: -1 }, { ...corpo, seed: 1.5 }, { ...corpo, look: 'x' }, { parts: {} },
    ]) expect(salvarPersonagem({ quem: dono, alvo: 'dono', corpo: ruim }).status, JSON.stringify(ruim)).toBe(400);
    expect(fs.existsSync(path.join(dir, 'personagens.json'))).toBe(false);
  });
  it('reset apaga o personagem guardado', () => {
    salvarPersonagem({ quem: dono, alvo: 'dono', corpo });
    expect(listarEquipe()[0].custom).toBe(true);
    expect(salvarPersonagem({ quem: dono, alvo: 'dono', corpo: { reset: true } }).ok).toBe(true);
    expect(listarEquipe()[0].custom).toBe(false);
  });
  it('nomes hostis (__proto__, constructor) viram chave comum e não quebram', () => {
    addPerson(dir, 'constructor', 'equipe');
    expect(salvarPersonagem({ quem: dono, alvo: 'constructor', corpo }).ok).toBe(true);
    expect(listarEquipe().find((p: any) => p.nome === 'constructor')).toMatchObject({ seed: 7 });
    expect(salvarPersonagem({ quem: dono, alvo: '__proto__', corpo }).status).toBe(404);
    expect(({} as any).seed).toBeUndefined();
  });
  it('validarPecas normaliza cores para minúsculas e mantém a ordem', () => {
    expect(Object.keys(validarPecas({ hairStyle: 'bob', skin: '#AABBCC' }))).toEqual(['skin', 'hairStyle']);
    expect(validarPecas({ skin: '#AABBCC' }).skin).toBe('#aabbcc');
  });
});
