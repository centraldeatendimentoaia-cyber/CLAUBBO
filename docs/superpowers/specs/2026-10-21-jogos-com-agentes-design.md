# Jogos com agentes: desafio, moedas, humor e carteira no servidor (projeto 4)

Status: desenho escrito pelo assistente a pedido do dono ("execute tudo sem me perguntar nada"). Toda escolha marcada como "decisão minha" pode ser desfeita.

## Intenção

No projeto 3 o botão "Desafiar" só entrega um convite. Aqui ele vira um jogo de verdade: o jogador desafia um agente ocioso, joga uma partida curta valendo moedas e o resultado muda o humor do agente. As moedas passam a viver no servidor, para que ninguém ganhe moeda alterando o navegador.

## Objetivos

- Desafiar um agente ocioso para Pedra, Papel e Tesoura, melhor de 3 rodadas, com aposta de 5, 10 ou 25 moedas. (decisão minha: um só jogo, o mais simples de provar justo. Outros jogos entram depois, sobre a mesma base.)
- Carteira por pessoa (dono e cada pessoa da equipe com nome) e por agente, guardadas no servidor.
- Humor do agente (animado, neutro, chateado) que muda com o resultado das partidas e aparece no menu e na etiqueta do agente.
- Só moedas: nenhum dinheiro real, nenhuma troca por algo fora do jogo.
- O servidor decide tudo: o navegador só envia a jogada escolhida e mostra o que o servidor devolve.

## Não objetivos

- Jogos em tempo real entre pessoas, apostas entre pessoas, loja, compra de moedas, ranking público.
- Humor mudar a qualidade, o custo ou a prioridade do trabalho do agente. Humor é só expressão (texto, ícone). Nunca degrada trabalho.
- Mover para o servidor as carteiras da simulação de agentes entre si (as apostas que os agentes fazem uns com os outros no escritório). Elas continuam no navegador, como hoje.
- Arte nova (projeto 5).

## Regras do jogo

- Quem pode jogar: papel `dono` ou `equipe` com `nome`, igual às ações do projeto 3. Token sem nome, token inválido e agentes recebem 403.
- O agente precisa estar ocioso (sem tarefa em andamento) e não pode estar em outra partida. Senão, 409.
- Aposta: 5, 10 ou 25. Outro valor, 400. A aposta só é aceita se a pessoa e o agente tiverem saldo para cobrir; o servidor reserva as duas apostas ao abrir a partida (saldo não fica negativo).
- A jogada do agente é sorteada pelo servidor (`crypto.randomInt`) só depois de receber a jogada da pessoa naquela rodada, e fica gravada. O cliente nunca sabe a jogada do agente antes de enviar a sua.
- Vence quem ganhar 2 rodadas. Empate de rodada repete a rodada, com no máximo 5 rodadas no total; passou disso, a partida acaba empatada e as apostas voltam.
- Quem vence leva as duas apostas. Moeda nunca é criada nem destruída por uma partida.
- Partida abandonada (sem jogada por 2 minutos) expira: apostas voltam, sem efeito no humor.
- Uma partida aberta por agente e uma por pessoa ao mesmo tempo. Intervalo de 10 s entre partidas da mesma pessoa com o mesmo agente.

## Carteira

- Arquivo `data/carteiras.json`, gravado como o `xp.json`: leitura e escrita sem `await` entre conferir e gravar, objetos sem protótipo para ids hostis.
- Entrada por pessoa (`pessoa:<nome em minúsculas>`) e por agente (`agente:<id>`). Cada uma: `saldo`, `ganhou`, `perdeu`, `extrato` (últimas 20 movimentações).
- Saldo inicial: 100 para a pessoa e 100 para o agente, concedido uma única vez na primeira consulta (decisão minha: sem mesada recorrente, para que a moeda tenha valor).
- O painel passa a mostrar a carteira do servidor da pessoa logada. O valor antigo do navegador some do painel, mas não é apagado.
- Cada movimentação tem id único (id da partida + papel). Repetir o pedido não move moeda duas vezes.
- Teto de proteção: o agente nunca fica abaixo de 0 e, se o saldo do agente for menor que 5, ele recusa o desafio ("sem moedas para apostar"). (decisão minha: se o agente zerar, só volta a jogar quando alguma regra futura o abastecer; por ora o dono pode ver isso no extrato.)

## Humor do agente

- Valores: `animado`, `neutro`, `chateado`. Guardado por agente em `data/humor.json` com o instante da última mudança.
- Regra: vitória do agente numa partida soma +1, derrota soma −1 (partida empatada não muda). O humor é calculado sobre as 5 últimas partidas: soma ≥ 2 animado, ≤ −2 chateado, senão neutro.
- Volta ao neutro depois de 6 horas sem partida.
- Onde aparece: ícone e palavra no menu do agente, linha curta no balão ao fim da partida (animado comemora, chateado reclama de brincadeira), e uma etiqueta discreta ao lado do nome. Textos curtos e fixos, sem chamar modelo de linguagem (decisão minha: custo zero).
- Nunca muda aura, modelo, nível, tarefas, custo nem prioridade.

## Rotas

Todas exigem papel `dono` ou `equipe` com `nome`; ficam em PHONE_WRITES quando forem escrita e em AUDITED, como `modelo`, `obrigado` e `btw`.

- `GET /api/carteira`: saldo e extrato da pessoa logada.
- `POST /api/jogos/desafio` com `{agente, aposta}`: abre a partida, devolve `{id, rodada: 1, placar}`.
- `POST /api/jogos/:id/jogada` com `{gesto}` (`pedra`, `papel`, `tesoura`): devolve a rodada (jogada do agente, quem ganhou, placar) e, se acabou, o resultado final, o novo saldo e o humor do agente.
- `GET /api/jogos/:id`: estado da partida (para retomar após recarregar a página). Só quem abriu a partida lê.
- O humor entra em `/api/holding` (elenco) e `/api/agentes` onde o menu já lê o agente.

Erros: 400 corpo inválido ou aposta fora dos valores; 403 papel; 404 agente ou partida inexistente; 409 agente ocupado, partida já encerrada ou fora de ordem; 429 intervalo; 422 sem saldo da pessoa ou do agente.

## Interface

- No menu do agente, "Desafiar" abre um painel néon pequeno: escolha da aposta (5, 10, 25), saldo da pessoa, três botões de gesto (teclas 1, 2, 3), placar da melhor de 3 e a jogada do agente revelada depois de escolher.
- Respeita `prefers-reduced-motion`: sem animação de revelação, só o texto.
- Texto do servidor e do agente entra só por `textContent`/`h({text})`.
- Fim da partida mostra ganho ou perda em moedas, o saldo novo e o humor do agente.
- O botão só habilita para agente ocioso e com saldo; senão mostra o motivo.

## Coerência com decisões anteriores

- Mesmas permissões do projeto 3 (equipe pode tudo que o dono pode neste projeto; cada pessoa tem a sua carteira).
- Auditoria com `nome` em toda abertura de partida e em todo resultado.
- Sem janela do Windows, sem processo novo, sem chamar o modelo.

## Verificação esperada

- Testes de unidade das regras (rodadas, empate, expiração, reserva e devolução de apostas, idempotência, saldo nunca negativo, moedas conservadas em qualquer sequência de partidas).
- Testes das rotas pelo servidor isolado em outra porta, sem tocar em `D:\escritorio-v2\data`.
- Teste no navegador: abrir o painel, jogar uma partida inteira, conferir saldo e humor.
- Declarar o que não foi visto.

## Fica para o construtor

Nome dos arquivos, formato exato do extrato, textos das falas, visual do painel dentro do sistema néon existente, e como o sorteio é injetado nos testes (função `sorteio` passada ao módulo).
