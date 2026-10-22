import { describe, expect, it } from 'vitest';
import { BATIMENTO_MS, convidadosDe, devoAvisar, INTERVALO_AVISO_MS, lerLista, temDesconhecido, type PresencaPessoa } from './presenca-model';

const p0 = { andar: 1, x: 10, y: 8, dir: 'down' as const };
const pessoa = (nome: string, extra: Partial<PresencaPessoa> = {}): PresencaPessoa => ({ nome, papel: 'equipe', ...p0, ...extra });

describe('devoAvisar', () => {
  it('primeira vez: avisa', () => expect(devoAvisar(p0, null, 0)).toBe(true));
  it('dentro do intervalo nunca avisa, mesmo mexendo', () => expect(devoAvisar({ ...p0, x: 12 }, p0, INTERVALO_AVISO_MS - 1)).toBe(false));
  it('parado: só o batimento avisa', () => {
    expect(devoAvisar(p0, p0, INTERVALO_AVISO_MS + 50)).toBe(false);
    expect(devoAvisar(p0, p0, BATIMENTO_MS)).toBe(true);
  });
  it('mexeu, virou ou mudou de andar depois do intervalo: avisa', () => {
    expect(devoAvisar({ ...p0, x: 10.5 }, p0, INTERVALO_AVISO_MS)).toBe(true);
    expect(devoAvisar({ ...p0, dir: 'left' }, p0, INTERVALO_AVISO_MS)).toBe(true);
    expect(devoAvisar({ ...p0, andar: 2 }, p0, INTERVALO_AVISO_MS)).toBe(true);
  });
  it('um fio de diferença não vale aviso', () => expect(devoAvisar({ ...p0, x: 10.01 }, p0, INTERVALO_AVISO_MS + 10)).toBe(false));
});

describe('convidadosDe', () => {
  const equipe = [
    { nome: 'Ana', look: 'f' as const, custom: true, parts: { hair: 'long' } as never },
    { nome: 'Beto', look: 'm' as const, custom: false },
  ];

  it('tira a própria pessoa (sem diferenciar maiúscula) e dá o personagem editado a quem tem', () => {
    const r = convidadosDe([pessoa('João', { papel: 'dono' }), pessoa('ana'), pessoa('Beto')], 'joão', equipe);
    expect(r.map((c) => c.nome)).toEqual(['ana', 'Beto']);
    expect(r[0]).toMatchObject({ id: 'convidado:ana', look: 'f', parts: { hair: 'long' }, andar: 1, x: 10, y: 8, dir: 'down' });
    expect(r[1].parts).toBeUndefined(); // sem edição: aparência padrão
  });

  it('quem não está na equipe (ex.: celular) aparece com o padrão', () => {
    const r = convidadosDe([pessoa('celular', { papel: 'dono' })], 'João', equipe);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'convidado:celular', look: 'm' });
  });

  it('sem saber quem sou eu, ninguém aparece', () => {
    expect(convidadosDe([pessoa('Ana')], '', equipe)).toEqual([]);
  });
});

describe('temDesconhecido e lerLista', () => {
  it('só conta quem não sou eu e não está na equipe', () => {
    const eq = [{ nome: 'Ana', look: 'f' as const, custom: false }];
    expect(temDesconhecido([pessoa('Ana'), pessoa('João')], 'João', eq)).toBe(false);
    expect(temDesconhecido([pessoa('Zé')], 'João', eq)).toBe(true);
  });

  it('lerLista descarta o que não tem a forma esperada', () => {
    expect(lerLista([pessoa('Ana'), { nome: 'x' }, null, { ...pessoa('Y'), x: NaN }, { ...pessoa('Z'), dir: 'cima' }, 3])).toEqual([pessoa('Ana')]);
    expect(lerLista('lixo')).toEqual([]);
  });
});
