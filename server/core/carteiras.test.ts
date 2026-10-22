import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { config } from './config.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { SALDO_INICIAL, contaDe, contasPorPrefixo, jaMovido, chaveAgente, chavePessoa, extratoDe, mover, saldoDe, totalGeral } from './carteiras.mjs';

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
  it('recusa nome vazio ou em branco', () => {
    for (const n of ['', '   ', undefined, null]) expect(() => chavePessoa(n)).toThrow();
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

describe('mover: validação e limites', () => {
  it('recusa id, origem ou destino que não sejam texto não vazio', () => {
    for (const id of ['', 5, null, undefined]) expect(mover({ id, de: ana(), para: bia(), valor: 1, texto: 'x' })).toMatchObject({ ok: false, status: 422, error: 'dados inválidos' });
    for (const de of ['', 7, undefined]) expect(mover({ id: 'a', de, para: bia(), valor: 1, texto: 'x' })).toMatchObject({ ok: false, status: 422, error: 'dados inválidos' });
    for (const para of ['', {}, undefined]) expect(mover({ id: 'b', de: ana(), para, valor: 1, texto: 'x' })).toMatchObject({ ok: false, status: 422, error: 'dados inválidos' });
    expect(saldoDe(ana())).toBe(SALDO_INICIAL);
  });
  it('origem igual ao destino devolve 422 sem alterar', () => {
    expect(mover({ id: 'i1', de: ana(), para: ana(), valor: 1, texto: 'x' })).toMatchObject({ ok: false, status: 422, error: 'origem e destino iguais' });
    expect(saldoDe(ana())).toBe(SALDO_INICIAL);
  });
  it('guarda só os 500 últimos ids: o mais antigo deixa de ser deduplicado, o mais novo continua', () => {
    mover({ id: 'x0', de: ana(), para: 'partida:x', valor: 1, texto: 'x' });
    // direções alternadas para os saldos nunca zerarem
    for (let i = 1; i <= 500; i++) mover({ id: `y${i}`, de: i % 2 ? bia() : ana(), para: i % 2 ? ana() : bia(), valor: 1, texto: 'x' });
    expect(mover({ id: 'y500', de: ana(), para: bia(), valor: 1, texto: 'x' })).toEqual({ ok: true, duplicado: true });
    const antes = saldoDe(ana());
    expect(mover({ id: 'x0', de: ana(), para: 'partida:x', valor: 1, texto: 'x' })).toEqual({ ok: true, duplicado: false });
    expect(saldoDe(ana())).toBe(antes - 1);
  });
  it('ganhou e perdeu são contados junto com a movimentação, uma única vez', () => {
    mover({ id: 'p', de: ana(), para: 'partida:g', valor: 10, texto: 'x' });
    mover({ id: 'q', de: bia(), para: 'partida:g', valor: 10, texto: 'x' });
    const fim = { id: 'g:fim', de: 'partida:g', para: ana(), valor: 20, texto: 'x', contar: { ganhou: ana(), perdeu: bia(), valor: 10 } };
    expect(mover(fim)).toEqual({ ok: true, duplicado: false });
    expect(mover(fim)).toEqual({ ok: true, duplicado: true });
    expect(contaDe(ana())).toMatchObject({ ganhou: 10, perdeu: 0 });
    expect(contaDe(bia())).toMatchObject({ ganhou: 0, perdeu: 10 });
  });
  it('contadores sobrevivem a recarregar do disco; saldo corrompido vira 0', () => {
    mover({ id: 'p', de: ana(), para: 'partida:g', valor: 10, texto: 'x' });
    mover({ id: 'g:fim', de: 'partida:g', para: bia(), valor: 10, texto: 'x', contar: { ganhou: bia(), perdeu: ana(), valor: 5 } });
    const f = path.join(dir, 'carteiras.json');
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    d.contas['pessoa:zé'] = { saldo: 'lixo' };
    fs.writeFileSync(f, JSON.stringify(d));
    expect(saldoDe('pessoa:zé')).toBe(0);
    expect(contaDe(bia()).ganhou).toBe(5);
    expect(contaDe(ana()).perdeu).toBe(5);
  });
});

describe('mover: apoio às partidas', () => {
  it('contar não abre nem cria conta que não existe', () => {
    mover({ id: 'p', de: ana(), para: 'partida:g', valor: 10, texto: 'x' });
    mover({ id: 'f', de: 'partida:g', para: ana(), valor: 10, texto: 'x', contar: { ganhou: ana(), perdeu: 'pessoa:fantasma', valor: 5 } });
    const d = JSON.parse(fs.readFileSync(path.join(dir, 'carteiras.json'), 'utf8'));
    expect(d.contas['pessoa:fantasma']).toBeUndefined();
    expect(contaDe(ana()).ganhou).toBe(5);
  });
  it('jaMovido diz se o id já foi aplicado', () => {
    expect(jaMovido('m1')).toBe(false);
    mover({ id: 'm1', de: ana(), para: bia(), valor: 1, texto: 'x' });
    expect(jaMovido('m1')).toBe(true);
    mover({ id: 'm2', de: ana(), para: bia(), valor: 1000, texto: 'x' });
    expect(jaMovido('m2')).toBe(false);
  });
  it('contasPorPrefixo lista saldos positivos e o extrato da partida diz de onde veio a moeda', () => {
    mover({ id: 'a', de: ana(), para: 'partida:z', valor: 10, texto: 'x' });
    mover({ id: 'b', de: bia(), para: 'partida:z', valor: 5, texto: 'x' });
    const [z] = contasPorPrefixo('partida:');
    expect(z).toMatchObject({ chave: 'partida:z', saldo: 15 });
    expect(z.extrato.map((e: any) => [e.com, e.delta])).toEqual([[ana(), 10], [bia(), 5]]);
    expect(contasPorPrefixo('pessoa:z')).toEqual([]);
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
