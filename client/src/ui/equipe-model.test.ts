import { describe, expect, it } from 'vitest';
import { descricaoPessoa, fonteAvatar, mensagemDaFalha, podeEditarPessoa, type Pessoa } from './equipe-model';

const dono: Pessoa = { nome: 'dono', papel: 'dono', rotulo: 'JMAL', seed: 1, look: 'm', costume: 'jmal', custom: false };
const ana: Pessoa = { nome: 'Ana', papel: 'equipe', rotulo: 'Ana', seed: 2, look: 'f', parts: { hairStyle: 'bob' }, custom: true };

describe('podeEditarPessoa', () => {
  it('dono edita todos; a pessoa só o próprio; outros papéis nunca', () => {
    expect(podeEditarPessoa({ nome: 'dono', papel: 'dono' }, ana)).toBe(true);
    expect(podeEditarPessoa({ nome: ' ana ', papel: 'equipe' }, ana)).toBe(true);
    expect(podeEditarPessoa({ nome: 'Bia', papel: 'equipe' }, ana)).toBe(false);
    expect(podeEditarPessoa({ nome: 'Ana', papel: '' }, ana)).toBe(false);
  });
});
describe('descricaoPessoa', () => {
  it('usa o rótulo, o papel e marca você', () => {
    expect(descricaoPessoa(dono, 'Ana')).toBe('JMAL (dono)');
    expect(descricaoPessoa(ana, 'ana')).toBe('Ana (equipe) · você');
  });
});
describe('fonteAvatar', () => {
  it('leva a fantasia JMAL só quando existe e sempre como personagem principal', () => {
    expect(fonteAvatar(dono)).toMatchObject({ kind: 'main', costume: 'jmal' });
    expect('costume' in fonteAvatar(ana)).toBe(false);
    expect(fonteAvatar(ana).parts).toEqual({ hairStyle: 'bob' });
  });
});
describe('mensagemDaFalha', () => {
  it('mensagem em português para cada status, com padrão', () => {
    for (const s of [400, 403, 404, 0, 500]) expect(mensagemDaFalha(s)).toMatch(/\S/);
    expect(mensagemDaFalha(403)).not.toBe(mensagemDaFalha(404));
  });
});
