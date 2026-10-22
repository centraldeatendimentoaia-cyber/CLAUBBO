import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { criarPresenca, podeAparecer } from './presenca.mjs';

const dono = { nome: 'João', papel: 'dono' };
const ana = { nome: 'Ana', papel: 'equipe' };
const pos = { andar: 1, x: 10.5, y: 8, dir: 'down' };

function nova(opts = {}) {
  let t = 1_000;
  const p = criarPresenca({ now: () => t, ...opts });
  return { p, avancar: (ms: number) => (t += ms) };
}

describe('podeAparecer', () => {
  it('só dono ou equipe com nome', () => {
    expect(podeAparecer(dono)).toBe(true);
    expect(podeAparecer(ana)).toBe(true);
    expect(podeAparecer({ nome: 'agentes', papel: 'agente' })).toBe(false);
    expect(podeAparecer({ nome: '', papel: 'dono' })).toBe(false);
    expect(podeAparecer(null)).toBe(false);
  });
});

describe('criarPresenca', () => {
  it('guarda a posição e lista sem o carimbo de tempo', () => {
    const { p } = nova();
    expect(p.atualizar(dono, pos)).toEqual({ ok: true });
    expect(p.lista()).toEqual([{ nome: 'João', papel: 'dono', ...pos }]);
  });

  it('uma entrada por pessoa (nome sem diferenciar maiúscula): a última posição vale', () => {
    const { p, avancar } = nova();
    p.atualizar(dono, pos);
    avancar(200);
    p.atualizar({ nome: 'joão', papel: 'dono' }, { ...pos, x: 12 });
    expect(p.lista()).toHaveLength(1);
    expect(p.lista()[0].x).toBe(12);
  });

  it('recusa quem não é dono nem equipe (403) e dado inválido (422); nada entra na lista', () => {
    const { p } = nova();
    expect(p.atualizar({ nome: 'agentes', papel: 'agente' }, pos)).toMatchObject({ ok: false, status: 403 });
    for (const ruim of [{ ...pos, andar: 0 }, { ...pos, andar: 1.5 }, { ...pos, x: NaN }, { ...pos, y: -1 }, { ...pos, x: 1e9 }, { ...pos, dir: 'diagonal' }, { ...pos, x: '3' }, null, undefined]) {
      expect(p.atualizar(dono, ruim), JSON.stringify(ruim)).toMatchObject({ ok: false, status: 422 });
    }
    expect(p.lista()).toEqual([]);
  });

  it('limite de taxa: aviso colado no anterior é recusado (429) e não muda a posição; depois do intervalo vale', () => {
    const { p, avancar } = nova({ minIntervaloMs: 100 });
    p.atualizar(dono, pos);
    avancar(50);
    expect(p.atualizar(dono, { ...pos, x: 20 })).toMatchObject({ ok: false, status: 429 });
    expect(p.lista()[0].x).toBe(10.5);
    avancar(60);
    expect(p.atualizar(dono, { ...pos, x: 20 })).toEqual({ ok: true });
    expect(p.lista()[0].x).toBe(20);
  });

  it('o limite de taxa é por pessoa: outra pessoa entra na hora', () => {
    const { p } = nova({ minIntervaloMs: 100 });
    p.atualizar(dono, pos);
    expect(p.atualizar(ana, pos)).toEqual({ ok: true });
  });

  it('sem aviso por mais que o prazo a pessoa some; varrer diz que alguém saiu', () => {
    const { p, avancar } = nova({ ttlMs: 5000 });
    p.atualizar(dono, pos);
    avancar(4000);
    p.atualizar(ana, pos);
    avancar(2000); // João está há 6 s sem avisar; Ana, há 2 s
    expect(p.varrer()).toBe(true);
    expect(p.lista().map((x: { nome: string }) => x.nome)).toEqual(['Ana']);
    expect(p.varrer()).toBe(false);
  });

  it('remover tira a pessoa na hora', () => {
    const { p } = nova();
    p.atualizar(dono, pos);
    expect(p.remover('JOÃO')).toBe(true);
    expect(p.remover('João')).toBe(false);
    expect(p.lista()).toEqual([]);
  });

  it('lotado: pessoa nova é recusada (503), quem já está continua atualizando', () => {
    const { p, avancar } = nova({ max: 2, minIntervaloMs: 0 });
    p.atualizar(dono, pos);
    p.atualizar(ana, pos);
    expect(p.atualizar({ nome: 'Beto', papel: 'equipe' }, pos)).toMatchObject({ ok: false, status: 503 });
    avancar(10);
    expect(p.atualizar(dono, { ...pos, x: 3 })).toEqual({ ok: true });
  });

  it('um nome como __proto__ é só um nome', () => {
    const { p } = nova();
    expect(p.atualizar({ nome: '__proto__', papel: 'equipe' }, pos)).toEqual({ ok: true });
    expect(p.lista()).toHaveLength(1);
  });
});
