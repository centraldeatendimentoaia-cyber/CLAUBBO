import { describe, expect, it } from 'vitest';
import { apostasPossiveis, humorRotulo, mensagemDaFalha, resumoRodada, rotuloGesto, textoResultado } from './jogo-model';

describe('rotuloGesto', () => {
  it('nomes em português; valor desconhecido não quebra', () => {
    expect(rotuloGesto('pedra')).toBe('Pedra');
    expect(rotuloGesto('papel')).toBe('Papel');
    expect(rotuloGesto('tesoura')).toBe('Tesoura');
    expect(rotuloGesto('x')).toBe('?');
  });
});

describe('resumoRodada', () => {
  const r = { numero: 2, gestoPessoa: 'pedra', gestoAgente: 'tesoura' };
  it('diz quem venceu a rodada', () => {
    expect(resumoRodada({ ...r, vencedor: 'pessoa' })).toBe('Rodada 2: Pedra contra Tesoura. Você venceu a rodada.');
    expect(resumoRodada({ ...r, vencedor: 'agente' })).toBe('Rodada 2: Pedra contra Tesoura. O agente venceu a rodada.');
    expect(resumoRodada({ ...r, vencedor: 'empate' })).toBe('Rodada 2: Pedra contra Tesoura. Empate: a rodada se repete.');
  });
});

describe('textoResultado', () => {
  it('partida em andamento não tem resultado', () => expect(textoResultado(false, undefined, 0)).toBe(''));
  it('vitória, derrota e empate com o saldo da pessoa', () => {
    expect(textoResultado(true, 'pessoa', 10)).toBe('Você venceu! +10 moedas.');
    expect(textoResultado(true, 'agente', -25)).toBe('Você perdeu. −25 moedas.');
    expect(textoResultado(true, 'empate', 0)).toBe('Empate. As apostas voltaram: 0 moedas.');
  });
  it('uma moeda no singular', () => expect(textoResultado(true, 'pessoa', 1)).toBe('Você venceu! +1 moeda.'));
});

describe('apostasPossiveis', () => {
  it('só valores que as duas partes pagam', () => {
    expect(apostasPossiveis(100, 100)).toEqual([5, 10, 25]);
    expect(apostasPossiveis(12, 100)).toEqual([5, 10]);
    expect(apostasPossiveis(100, 7)).toEqual([5]);
    expect(apostasPossiveis(4, 100)).toEqual([]);
  });
  it('saldo do agente desconhecido: vale só o da pessoa', () => {
    expect(apostasPossiveis(10, null)).toEqual([5, 10]);
    expect(apostasPossiveis(null, 100)).toEqual([5, 10, 25]);
  });
});

describe('mensagemDaFalha', () => {
  it('uma mensagem em português por status', () => {
    expect(mensagemDaFalha(0, '')).toBe('Sem conexão com o servidor.');
    expect(mensagemDaFalha(403, '')).toMatch(/dono ou equipe/);
    expect(mensagemDaFalha(404, '')).toMatch(/não encontrada/);
    expect(mensagemDaFalha(409, '')).toMatch(/mudou/);
    expect(mensagemDaFalha(410, '')).toMatch(/expirou/);
    expect(mensagemDaFalha(422, '')).toMatch(/moedas/);
    expect(mensagemDaFalha(429, '')).toMatch(/Espere/);
    expect(mensagemDaFalha(500, '')).toBe('Não deu certo.');
  });
  it('409, 422 e 429 preferem o motivo do servidor', () => {
    expect(mensagemDaFalha(409, 'agente ocupado')).toBe('agente ocupado');
    expect(mensagemDaFalha(422, 'agente sem moedas para apostar')).toBe('agente sem moedas para apostar');
    expect(mensagemDaFalha(403, 'qualquer')).toMatch(/dono ou equipe/);
  });
});

describe('humorRotulo', () => {
  it('ícone e palavra, nunca só cor', () => {
    for (const h of ['animado', 'neutro', 'chateado']) {
      const r = humorRotulo(h);
      expect(r.palavra).toBe(h);
      expect(r.icone).not.toBe('');
    }
    expect(humorRotulo('xyz').palavra).toBe('neutro');
    expect(humorRotulo(undefined).palavra).toBe('neutro');
  });
});
