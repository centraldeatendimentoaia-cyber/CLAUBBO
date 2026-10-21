import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { SALDO_INICIAL, chaveAgente, chavePessoa, extratoDe, mover, saldoDe, totalGeral } from './carteiras.mjs';

const oldData = config.data;
let dir = '';
beforeEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteiras-'));
  config.data = dir;
});
afterAll(() => {
  config.data = oldData;
  fs.rmSync(dir, { recursive: true, force: true });
});

const ana = () => chavePessoa('Ana');
const bia = () => chaveAgente('bia');

describe('chaves', () => {
  it('normaliza o nome da pessoa', () => {
    expect(chavePessoa(' Ana ')).toBe(chavePessoa('ana'));
    expect(chavePessoa(' Ana ')).toBe('pessoa:ana');
    expect(chaveAgente('bia')).toBe('agente:bia');
  });
});

describe('saldoDe', () => {
  it('concede o saldo inicial uma única vez', () => {
    expect(saldoDe(ana())).toBe(SALDO_INICIAL);
    expect(mover({ id: 'm1', de: ana(), para: bia(), valor: 10, texto: 'x' })).toEqual({ ok: true, duplicado: false });
    expect(saldoDe(ana())).toBe(SALDO_INICIAL - 10);
    expect(saldoDe(bia())).toBe(SALDO_INICIAL + 10);
  });
  it('nomes hostis viram contas comuns', () => {
    for (const n of ['__proto__', 'constructor']) {
      expect(saldoDe(chavePessoa(n))).toBe(SALDO_INICIAL);
      expect(saldoDe(chaveAgente(n))).toBe(SALDO_INICIAL);
    }
    expect(mover({ id: 'h1', de: chavePessoa('__proto__'), para: chaveAgente('constructor'), valor: 5, texto: 'x' }).ok).toBe(true);
    expect(saldoDe(chaveAgente('constructor'))).toBe(SALDO_INICIAL + 5);
  });
});

describe('mover', () => {
  it('repetir o id não move de novo', () => {
    mover({ id: 'm1', de: ana(), para: bia(), valor: 10, texto: 'x' });
    expect(mover({ id: 'm1', de: ana(), para: bia(), valor: 10, texto: 'x' })).toEqual({ ok: true, duplicado: true });
    expect(saldoDe(ana())).toBe(SALDO_INICIAL - 10);
  });
  it('saldo insuficiente devolve 422 sem alterar', () => {
    const r = mover({ id: 'm1', de: ana(), para: bia(), valor: SALDO_INICIAL + 1, texto: 'x' });
    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(saldoDe(ana())).toBe(SALDO_INICIAL);
    expect(saldoDe(bia())).toBe(SALDO_INICIAL);
    // a recusa não queima o id: depois de ter saldo, o mesmo id passa
    expect(mover({ id: 'm1', de: ana(), para: bia(), valor: 1, texto: 'x' }).ok).toBe(true);
  });
  it('recusa valor inválido', () => {
    for (const valor of [0, -5, 1.5, NaN]) expect(mover({ id: `v${valor}`, de: ana(), para: bia(), valor, texto: 'x' })).toMatchObject({ ok: false, status: 422 });
    expect(saldoDe(ana())).toBe(SALDO_INICIAL);
  });
  it('conta que não é de pessoa nem agente começa em zero', () => {
    mover({ id: 'p1', de: ana(), para: 'partida:1', valor: 10, texto: 'x' });
    expect(saldoDe('partida:1')).toBe(10);
    expect(mover({ id: 'p2', de: 'partida:2', para: ana(), valor: 1, texto: 'x' })).toMatchObject({ ok: false, status: 422 });
  });
});

describe('extratoDe', () => {
  it('limita a 20, mais recente primeiro', () => {
    for (let i = 1; i <= 25; i++) mover({ id: `m${i}`, de: ana(), para: bia(), valor: 1, texto: `t${i}` }, 1000 + i);
    const e = extratoDe(ana());
    expect(e).toHaveLength(20);
    expect(e[0]).toEqual({ at: 1025, delta: -1, texto: 't25' });
    expect(extratoDe(bia())[0].delta).toBe(1);
  });
});

describe('totalGeral', () => {
  it('fica constante após várias movimentações', () => {
    const contas = [ana(), bia(), chavePessoa('Caio'), 'partida:9'];
    saldoDe(ana()); saldoDe(bia()); saldoDe(chavePessoa('Caio'));
    const antes = totalGeral();
    for (let i = 0; i < 40; i++) mover({ id: `r${i}`, de: contas[i % 4], para: contas[(i * 3 + 1) % 4], valor: (i % 7) + 1, texto: 'x' });
    expect(totalGeral()).toBe(antes);
  });
});
