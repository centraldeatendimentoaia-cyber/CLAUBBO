// Modelo puro (sem DOM) das interações com os móveis do mapa: o texto da dica, o título do menu e o que cada categoria
// faz. Fliperama e mesa de pingue-pongue convidam um agente ocioso para o jogo; o resto é uma ação simples que só conta
// o que o boneco fez. Nada aqui vai ao servidor.
import { tr } from '../../../shared/i18n';
import type { Categoria } from '../world/objetos';
import type { ItemMenu } from './interacao-model';

export interface Ocioso {
  id: string;
  name: string;
}

interface Uso {
  /** Verbo da dica: "E · {verbo}". */
  verbo: string;
  titulo: string;
  /** O que acontece ao usar (vira o texto do painel). */
  texto: string;
}

/** O texto de cada categoria de móvel. Categorias de jogo (fliperama, pingpong) não usam `texto`: abrem a lista de convidados. */
export function usoDe(c: Categoria): Uso {
  switch (c) {
    case 'fliperama': return { verbo: tr('Jogar no fliperama'), titulo: tr('Fliperama'), texto: '' };
    case 'pingpong': return { verbo: tr('Jogar pingue-pongue'), titulo: tr('Mesa de pingue-pongue'), texto: '' };
    case 'sentar': return { verbo: tr('Sentar um instante'), titulo: tr('Descansar'), texto: tr('Você se senta um instante e respira. O escritório segue trabalhando.') };
    case 'cafe': return { verbo: tr('Tomar um café'), titulo: tr('Máquina de café'), texto: tr('Você tira um café fresquinho. Hmm, cheiro de manhã.') };
    case 'agua': return { verbo: tr('Beber água'), titulo: tr('Bebedouro'), texto: tr('Você bebe um copo de água gelada.') };
    case 'lousa': return { verbo: tr('Ver a lousa'), titulo: tr('Lousa'), texto: tr('A lousa está cheia de setas e ideias. Dá para ler o plano do dia nela.') };
    case 'relogio': return { verbo: tr('Ver as horas'), titulo: tr('Relógio'), texto: '' };
    case 'janela': return { verbo: tr('Olhar pela janela'), titulo: tr('Janela'), texto: tr('Lá fora a cidade segue o ritmo dela. Vale uma pausa para olhar.') };
    case 'tv': return { verbo: tr('Ver a TV'), titulo: tr('TV'), texto: tr('Você assiste um pouco da TV. Passa algo sobre futebol.') };
    case 'livro': return { verbo: tr('Olhar a estante'), titulo: tr('Estante'), texto: tr('Manuais, pastas e um livro sobre cafeína que ninguém devolveu.') };
    case 'planta': return { verbo: tr('Regar a planta'), titulo: tr('Planta'), texto: tr('Você ajeita as folhas. A planta agradece, do jeito dela.') };
    case 'lanche': return { verbo: tr('Pegar um lanche'), titulo: tr('Lanche'), texto: tr('Você pega um lanche rápido. Combustível para o próximo commit.') };
    case 'quadro': return { verbo: tr('Admirar'), titulo: tr('Decoração'), texto: tr('Você para um instante e admira. Dá um ar de casa ao escritório.') };
    case 'espelho': return { verbo: tr('Olhar o espelho'), titulo: tr('Espelho'), texto: tr('Você ajeita o cabelo. Pronto para a reunião.') };
    case 'lavar': return { verbo: tr('Lavar as mãos'), titulo: tr('Pia'), texto: tr('Você lava as mãos com calma.') };
    case 'mesa': return { verbo: tr('Olhar a mesa'), titulo: tr('Mesa'), texto: tr('Uma mesa de trabalho: o lugar onde as tarefas viram resultado.') };
    case 'balcao': return { verbo: tr('Apoiar-se'), titulo: tr('Balcão'), texto: tr('Você se apoia um instante. Bom lugar para uma conversa rápida.') };
    case 'impressora': return { verbo: tr('Usar a impressora'), titulo: tr('Impressora'), texto: tr('Você imprime uma folha de teste. Funciona, por milagre.') };
    case 'arquivo': return { verbo: tr('Abrir o arquivo'), titulo: tr('Arquivo'), texto: tr('Pastas em ordem alfabética. Alguém aqui é organizado.') };
    case 'lixeira': return { verbo: tr('Jogar fora'), titulo: tr('Lixeira'), texto: tr('Você joga um papel amassado. Cesta!') };
    case 'luminaria': return { verbo: tr('Ver a luminária'), titulo: tr('Luminária'), texto: tr('Uma luz suave. Boa para ler com calma.') };
    case 'banheiro': return { verbo: tr('Ocupado'), titulo: tr('Banheiro'), texto: tr('A porta está fechada. Privacidade é sagrada.') };
  }
}

/** O texto da dica "E · …". */
export function dicaDoObjeto(c: Categoria): string {
  return tr('E · {0}', [usoDe(c).verbo]);
}

export const ehJogo = (c: Categoria): boolean => c === 'fliperama' || c === 'pingpong';

/** A hora no relógio de parede, no formato do idioma. */
export function textoDoRelogio(agora: Date): string {
  return tr('Agora são {0}.', [agora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })]);
}

/**
 * Itens do menu de um móvel. Jogo: um item por agente ocioso do Escritório (atalhos 1-9); sem ninguém livre, a lista vem
 * vazia e quem desenha mostra `MOTIVO_SEM_PARCEIRO`. Os outros móveis têm um único item "usar".
 */
export function menuDoObjeto(c: Categoria, ociosos: readonly Ocioso[]): ItemMenu[] {
  if (ehJogo(c)) {
    return ociosos.slice(0, 9).map((o, i) => ({ acao: 'jogar' as const, rotulo: tr('Chamar {0} para jogar', [o.name]), atalho: String(i + 1), habilitado: true, agenteId: o.id }));
  }
  return [{ acao: 'usar', rotulo: usoDe(c).verbo, atalho: '1', habilitado: true }];
}

export const MOTIVO_SEM_PARCEIRO = (): string => tr('Ninguém livre para jogar agora. Tente quando um agente estiver ocioso.');
