import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { BadRequest, parseBody, readBodyText, statusOf } from './http-body.mjs';
// @ts-expect-error módulo .mjs sem tipos
import { writeJson } from './store.mjs';

describe('corpo da requisição', () => {
  it('JSON quebrado, null, lista e número dão BadRequest "pedido inválido" (400)', () => {
    for (const t of ['{bad', 'null', '[1]', '7', '"x"']) {
      let err: unknown;
      try { parseBody(t); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(BadRequest);
      expect((err as Error).message).toBe('pedido inválido');
      expect(statusOf(err)).toBe(400);
    }
  });
  it('corpo vazio e objeto passam', () => {
    expect(parseBody('')).toEqual({});
    expect(parseBody('{"a":1}')).toEqual({ a: 1 });
  });
  it('erro de verdade continua 500', () => {
    expect(statusOf(new TypeError('x'))).toBe(500);
    expect(statusOf(undefined)).toBe(500);
  });
  it('caractere de 2 bytes cortado entre dois pedaços chega inteiro (sem "�")', async () => {
    const bytes = Buffer.from('{"t":"salão"}', 'utf8');
    const cut = bytes.indexOf(0xc3) + 1; // no meio do "ã"
    const req = Readable.from([bytes.subarray(0, cut), bytes.subarray(cut)], { objectMode: false });
    const text = await readBodyText(req);
    expect(text).toBe('{"t":"salão"}');
    expect(parseBody(text)).toEqual({ t: 'salão' });
  });
});

describe('gravação em UTF-8', () => {
  it('writeJson grava "salão" como UTF-8 e relê igual', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'v2-utf8-')), 'a.json');
    writeJson(f, { t: 'sexta do salão' });
    const raw = fs.readFileSync(f);
    expect(raw.includes(Buffer.from('salão', 'utf8'))).toBe(true);
    expect(raw.includes(0xef) && raw.includes(Buffer.from([0xef, 0xbf, 0xbd]))).toBe(false);
    expect(JSON.parse(raw.toString('utf8')).t).toBe('sexta do salão');
  });
});
