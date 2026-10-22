// Barra da equipe, parte pura: quem pode editar quem, o texto de cada avatar e as mensagens de falha.
// Quem decide de verdade é o servidor (personagens.mjs); aqui só se explica ao jogador.
import type { AppearanceParts } from '../../../shared/appearance';
import { tr } from '../../../shared/i18n';

export interface Pessoa {
  nome: string;
  papel: 'dono' | 'equipe';
  rotulo: string;
  seed: number;
  look: 'f' | 'm';
  parts?: AppearanceParts;
  costume?: 'jmal';
  custom: boolean;
}

const chave = (n: string) => n.trim().toLowerCase();

/** O dono edita qualquer um; a pessoa da equipe, só o próprio (o servidor repete a regra). */
export const podeEditarPessoa = (eu: { nome: string; papel: string }, alvo: Pick<Pessoa, 'nome'>): boolean =>
  eu.papel === 'dono' || (eu.papel === 'equipe' && chave(eu.nome) === chave(alvo.nome));

/** Texto do botão e da dica: "JMAL (dono)" ou "Ana (equipe)"; o próprio fica marcado. */
export const descricaoPessoa = (p: Pessoa, euNome: string): string =>
  `${p.rotulo} (${p.papel === 'dono' ? tr('dono') : tr('equipe')})${chave(p.nome) === chave(euNome) ? ` · ${tr('você')}` : ''}`;

/** O que o módulo de arte precisa para desenhar o avatar da pessoa. */
export const fonteAvatar = (p: Pessoa) => ({ seed: p.seed, look: p.look, kind: 'main' as const, parts: p.parts, ...(p.costume ? { costume: p.costume } : {}) });

export function mensagemDaFalha(status: number): string {
  switch (status) {
    case 400: return tr('Personagem inválido: confira as peças.');
    case 403: return tr('Só o dono ou a própria pessoa muda este personagem.');
    case 404: return tr('Essa pessoa não está mais na equipe.');
    default: return tr('Não foi possível salvar. Tente de novo.');
  }
}
