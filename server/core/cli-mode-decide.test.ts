import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { decideAuto, manualHit } from './cli-mode.mjs';

type Decision = { liberado: boolean; why?: string; trecho?: string; ignorados: string[] };
const decide = decideAuto as (t: string) => Decision;

// Texto do pedido 2b50634f, que o modo automático reteve por engano: "push NÃO" e "nada de publicar" são proibições.
const PEDIDO_2B50634F = `Camila, aqui é o JMAL, em nome do João. Ele aprovou que você corrija os 4 itens de conformidade da sua auditoria (D:/escritorio-v2/data/run/respostas/retorno-ce52659c.md) em D:\\escritorio-v2.

1. README: adicionar seção de créditos citando o Habblaud (https://github.com/marmottajr/habblaud), o autor Márcio Junior e a licença MIT.
2. Build: fazer o dist/client levar LICENSE e NOTICE.md (e a licença OFL da Pixelify), e mostrar um crédito curto no app (ex.: tela Sobre ou rodapé discreto).
3. NOTICE.md: corrigir a frase que diz que server/ é todo novo, citando server/core/vendor/daystats.mjs e timeline.mjs como derivados do Habblaud.
4. Pasta "Agents Office/" no cérebro (server/core/brain.mjs:34, :52, :89): renomear para um nome neutro e criar migração que mova o conteúdo existente sem perder nada (se a pasta antiga existir, mover; nunca apagar dados).

Limites: commit local sim, push NÃO, nada de publicar. NÃO mexa nas imagens/assets: outros dois agentes estão criando substitutos em pasta separada. Rode os testes e o build e diga se passaram.
Critério de aceite: responda por partes com arquivos alterados, hash do commit e resultado de testes/build. Se algo falhar, diga.`;

describe('modo automático: proibição não é pedido de ação', () => {
  it('o texto do pedido 2b50634f é liberado e registra o que leu como proibição', () => {
    const d = decide(PEDIDO_2B50634F);
    expect(d.liberado).toBe(true);
    expect(d.ignorados.some((x) => /push/.test(x))).toBe(true);
    expect(d.ignorados.some((x) => /publicar/.test(x))).toBe(true);
  });

  it.each([
    'sem push',
    'não faça push',
    'proibido push',
    'nada de deploy',
    'não publique',
    'não apague a pasta X',
    'Limites: commit local sim, push NÃO, nada de publicar.',
    'push: não',
    'commit local, deploy proibido.',
    'sem push e sem deploy',
  ])('proibição é liberada: %s', (t) => {
    expect(manualHit(t), t).toBeNull();
  });

  it.each([
    ['faça push', 'deploy / publicação', 'push'],
    ['publique o post', 'deploy / publicação', 'publique'],
    ['rode o deploy', 'deploy / publicação', 'deploy'],
    ['apague a pasta X', 'apagar arquivos/dados', 'apague a pasta'],
    ['pague', 'pagamento', 'pague'],
  ])('ação real é retida: %s', (t, why, trecho) => {
    expect(decide(t)).toMatchObject({ liberado: false, why, trecho });
  });

  it.each([
    'sem push, mas faça deploy',
    'não faça push, publique o post',
    'push NÃO, mas faça deploy',
    'nada de deploy, pague o boleto',
    'faça push não',
    'rode o deploy, não o commit',
    'faça o deploy não pode falhar',
    'não deixe de fazer deploy',
    'sem push. Agora faça push',
    'não apague nada. Apague a pasta data',
  ])('proibição misturada com ação, ou frase ambígua, fica retida: %s', (t) => {
    expect(decide(t).liberado, t).toBe(false);
  });

  it('texto sem palavra sensível é liberado, sem trechos ignorados', () => {
    expect(decide('Liste os arquivos da pasta src e resuma o que cada um faz.')).toEqual({ liberado: true, ignorados: [] });
  });

  it('a retenção diz a palavra e o trecho (vão para o log)', () => {
    const d = decide('sem push, mas faça deploy');
    expect(d).toMatchObject({ liberado: false, why: 'deploy / publicação', trecho: 'deploy' });
    expect(d.ignorados).toEqual(['sem push']);
  });
});
