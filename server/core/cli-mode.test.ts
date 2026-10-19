import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-climode-'));
const load = async () => {
  vi.resetModules(); // simula o servidor reiniciando: o módulo lê o arquivo de novo
  // @ts-expect-error módulo .mjs sem tipos
  return (await import('./cli-mode.mjs')) as { getMode: () => { mode: string; since: number }; setMode: (m: string) => { ok: boolean; mode?: string; status?: number }; manualHit: (t: string) => { why: string; trecho: string } | null; manualReason: (t: string) => string | null };
};

beforeAll(() => { process.env.V2_DATA = tmp; });
afterAll(() => { delete process.env.V2_DATA; fs.rmSync(tmp, { recursive: true, force: true }); });

describe('modo automático dos pedidos aos terminais', () => {
  it('começa manual quando não há arquivo', async () => {
    expect((await load()).getMode().mode).toBe('manual');
  });

  it('ligado e desligado ficam salvos e sobrevivem ao reinício', async () => {
    let m = await load();
    expect(m.setMode('auto')).toMatchObject({ ok: true, mode: 'auto' });
    m = await load();
    expect(m.getMode().mode).toBe('auto');
    expect(m.setMode('manual')).toMatchObject({ ok: true, mode: 'manual' });
    m = await load();
    expect(m.getMode().mode).toBe('manual');
  });

  it('recusa modo inválido e arquivo adulterado cai no manual', async () => {
    let m = await load();
    expect(m.setMode('xis')).toMatchObject({ ok: false, status: 400 });
    fs.writeFileSync(path.join(tmp, 'cli-mode.json'), '{"mode":"qualquer-coisa"}');
    m = await load();
    expect(m.getMode().mode).toBe('manual');
    fs.writeFileSync(path.join(tmp, 'cli-mode.json'), 'lixo');
    m = await load();
    expect(m.getMode().mode).toBe('manual');
  });
});

describe('filtro de pedidos sensíveis', () => {
  it('proibição em lista não retém ("não faça push/deploy")', async () => {
    const { manualHit } = await load();
    for (const t of ['rode os testes. Limites: não faça push/deploy.', 'NÃO faça git push/deploy ou publicação', 'não publicar, deploy e pagamento', 'não faça push, deploy ou publicação']) expect(manualHit(t), t).toBeNull();
  });

  it('ordem real continua retida e diz o trecho', async () => {
    const { manualHit } = await load();
    expect(manualHit('faça o deploy do site')).toEqual({ why: 'deploy / publicação', trecho: 'deploy' });
    expect(manualHit('não faça deploy e pague o boleto')).toMatchObject({ why: 'pagamento', trecho: 'pague' });
    expect(manualHit('não faça push/deploy e apague a pasta data')).toMatchObject({ why: 'apagar arquivos/dados' });
    expect(manualHit('não deixe de fazer deploy')).toMatchObject({ why: 'deploy / publicação' });
  });
});

describe('registro das trocas de modo', () => {
  it('cada troca grava quando, de quê para quê e de onde veio; repetir o mesmo modo não grava; o registro sobrevive ao reinício', async () => {
    let m = (await load()) as unknown as { setMode: (m: string, who?: string) => unknown; modeLog: () => { at: string; from: string; to: string; who: string }[] };
    m.setMode('auto', 'página 127.0.0.1 · teste');
    m.setMode('auto', 'página 127.0.0.1 · teste');
    m.setMode('manual', 'página 127.0.0.1 · outro');
    m = (await load()) as unknown as typeof m;
    const log = m.modeLog().slice(0, 2); // os testes de antes do arquivo também trocaram o modo
    expect(log.map((e) => `${e.from}>${e.to}`)).toEqual(['auto>manual', 'manual>auto']);
    expect(log[0]).toMatchObject({ who: 'página 127.0.0.1 · outro' });
    expect(Number.isNaN(Date.parse(log[0]!.at))).toBe(false);
  });
});
