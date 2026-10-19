import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-offices-'));
const SELF = 4530;
type Res = { ok: boolean; status?: number; errors?: string[]; office?: Record<string, unknown> };
const load = async () => {
  vi.resetModules();
  // @ts-expect-error módulo .mjs sem tipos
  return (await import('./offices.mjs')) as {
    listOffices: (p: number) => Record<string, unknown>[]; addOffice: (i: unknown, p: number) => Res;
    updateOffice: (id: string, i: unknown, p: number) => Res; removeOffice: (id: string, p: number) => Res; normalizeAddress: (s: string) => { url?: string; error?: string };
  };
};

beforeAll(() => { process.env.V2_DATA = tmp; });
afterAll(() => { delete process.env.V2_DATA; fs.rmSync(tmp, { recursive: true, force: true }); });

describe('lista de escritórios', () => {
  it('sem arquivo mostra este escritório e o antigo (4520) com aviso de falta de bloqueio', async () => {
    const o = await load();
    const list = o.listOffices(SELF);
    expect(list.map((x) => x.url)).toEqual(['http://127.0.0.1:4530', 'http://127.0.0.1:4520']);
    expect(list[0]).toMatchObject({ self: true, blockSend: true });
    expect(list[0]!.aviso).toBeUndefined();
    expect(list[1]).toMatchObject({ blockSend: false });
    expect(String(list[1]!.aviso)).toContain('bloqueio de envio novo');
  });

  it('valida endereço: só máquina local, só host e porta', async () => {
    const { normalizeAddress } = await load();
    expect(normalizeAddress('4520')).toEqual({ url: 'http://127.0.0.1:4520', port: 4520 });
    expect(normalizeAddress('localhost:4600/')).toMatchObject({ url: 'http://localhost:4600' });
    for (const bad of ['', 'abc', 'http://exemplo.com:80', 'https://127.0.0.1:4520', 'http://127.0.0.1:99999', 'http://u:p@127.0.0.1:4520', 'http://127.0.0.1:4520/x']) expect(normalizeAddress(bad).error, bad).toBeTruthy();
  });

  it('adiciona, edita e remove; sobrevive ao reinício', async () => {
    let o = await load();
    const added = o.addOffice({ name: '  LAVI  ', url: '4601' }, SELF);
    expect(added.ok).toBe(true);
    const id = String(added.office!.id);
    expect(added.office).toMatchObject({ name: 'LAVI', url: 'http://127.0.0.1:4601', blockSend: true });
    expect(o.addOffice({ name: 'Outro', url: 'http://127.0.0.1:4601' }, SELF)).toMatchObject({ ok: false, status: 409 });
    expect(o.addOffice({ name: '', url: '4602' }, SELF)).toMatchObject({ ok: false, status: 400 });
    expect(o.addOffice({ name: 'x'.repeat(41), url: '4602' }, SELF)).toMatchObject({ ok: false, status: 400 });
    expect(o.addOffice({ name: 'Fora', url: 'http://exemplo.com:80' }, SELF)).toMatchObject({ ok: false, status: 400 });
    expect(o.addOffice({ name: 'Flag', url: '4603', blockSend: 'sim' }, SELF)).toMatchObject({ ok: false, status: 400 });
    expect(o.updateOffice(id, { name: 'LAVI 2', url: '4604' }, SELF).office).toMatchObject({ name: 'LAVI 2', url: 'http://127.0.0.1:4604' });
    expect(o.updateOffice(id, { url: '4520' }, SELF)).toMatchObject({ ok: false, status: 409 }); // já está na lista (o antigo)
    expect(o.updateOffice('nao-existe', { name: 'x' }, SELF)).toMatchObject({ ok: false, status: 404 });
    o = await load(); // reinício
    expect(o.listOffices(SELF).some((x) => x.id === id && x.name === 'LAVI 2')).toBe(true);
    expect(o.removeOffice(id, SELF).ok).toBe(true);
    o = await load();
    expect(o.listOffices(SELF).some((x) => x.id === id)).toBe(false);
  });

  it('não deixa tirar o escritório em que o João está', async () => {
    const o = await load();
    const self = o.listOffices(SELF).find((x) => x.self)!;
    expect(o.removeOffice(String(self.id), SELF)).toMatchObject({ ok: false, status: 409 });
  });
});
