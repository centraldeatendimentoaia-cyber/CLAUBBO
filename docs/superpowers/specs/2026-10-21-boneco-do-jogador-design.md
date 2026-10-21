# Boneco do jogador, botão de interação e auras por modelo: design

Data: 2026-10-21. Projeto 3 de 5 (ver "Contexto e ordem dos projetos" em `2026-10-21-painel-holding-design.md`).

## Intenção e motivo

Hoje o dono observa o escritório de fora: vê os agentes andando e clica neles. Falta um corpo dentro do escritório. O dono quer andar pelas salas, chegar perto de um agente e agir sobre ele (conversar, dar tarefa, desafiar, perguntar algo avulso, agradecer, cobrar mais), e usar o elevador para trocar de andar. A promoção ou o rebaixamento de modelo de IA de um agente passa a ser um gesto físico ("puxar a orelha"), e o modelo de cada agente fica visível na aura que o envolve.

Já existe parte da base: a cena de visita a outros prédios tem um boneco que anda e sai por um elevador (`client/src/world/sim/visitor.ts`, `VisitWorld` em `client/src/world/index.ts`), e o escritório já tem vários andares, cada um com a própria simulação. No escritório do dono, porém, não existe boneco do jogador. Este projeto leva o boneco para dentro do escritório do dono.

## Objetivos

- O dono anda pelo escritório com o teclado (setas ou WASD), com colisão, e a câmera o segue.
- Um botão de interação (tecla `E`) aparece quando há algo interagível por perto e abre um menu daquele alvo.
- Menu do agente, nesta ordem:
  1. Conversar e dar tarefa: abre o terminal daquele agente.
  2. Desafiar para um jogo: só aparece habilitado se o agente estiver ocioso.
  3. Perguntar `/btw`: pergunta avulsa que não interrompe o que o agente faz.
  4. Agradecer pelo trabalho: dá XP ao agente por um resultado verificado.
  5. Puxar a orelha: sobe o agente um degrau na escada de modelos.
  6. Baixar o modelo: desce o agente um degrau.
- Menu do elevador: lista os andares e troca o dono de andar.
- Aura por modelo em cada agente (ver "Auras").

## Fora do escopo (não objetivos)

- Jogos em si, moedas, humor do agente e carteira no servidor: projeto 4. Aqui, "Desafiar" só entrega o convite e o ponto de entrada.
- Arte nova do boneco, dos agentes e dos quartos: projeto 5. O boneco usa o personagem e a aparência que já existem.
- Dois jogadores ou a equipe com boneco no escritório do dono. Esta versão tem um boneco, o do dono.
- Controles de toque no celular. Os pedidos da página do celular continuam como estão.
- Interação com móveis e objetos além do elevador e dos agentes.

## Antiobjetivos (seria fracasso mesmo funcionando)

- Subir o modelo de um agente sem o dono ter feito o gesto de propósito, ou sem registro. Subir custa dinheiro.
- A equipe ou o celular conseguirem trocar modelo, agradecer ou rebaixar. Só o dono.
- XP por agradecer sem resultado verificado, ou o mesmo resultado agradecido duas vezes.
- Estado do modelo comunicado só por cor.
- Cópia de arte, nomes ou formatos de outro jogo. A aura em forma de chama é um efeito original de energia desenhado aqui, sem reproduzir personagens ou sprites de terceiros.
- A aura ou o boneco piorarem o desempenho do escritório com muitos agentes na tela.

## Restrições

- Código existente: cliente TypeScript + Vite + canvas em `client/src` (mundo em `client/src/world`, arte em `client/src/art`), servidor Node 22 em `server/bridge.mjs`, módulos em `server/core/*.mjs` com testes vitest ao lado. Seguir esses padrões.
- Segurança existente não pode regredir: tokens de `data/acesso.json`, papéis `dono`/`equipe`, `phoneGate`, auditoria em `data/auditoria.jsonl`, regra de que o agente nunca decide por si (`x-v2-agente` é sempre negado em decisões). XP só por evento verificado, em `data/xp.json`, com chave única.
- Cada agente tem `model` (`haiku`, `sonnet`, `opus`, `fable` ou um id livre para o Codex) e `effort` em `data/`. A troca de modelo usa o caminho que já grava o agente, e a validação existente em `server/core/agents.mjs` continua valendo.
- Acessibilidade: o modelo nunca é só cor. Cada degrau tem forma e intensidade próprias, e o nome do modelo aparece em texto no menu e na dica. Com `prefers-reduced-motion`, a aura não anima. Tudo do menu é operável por teclado.

## Decisões do dono

- O que cada ação faz foi dita pelo dono: conversar e dar tarefa abre o terminal; desafiar leva a um jogo que ele jogue; `/btw` é para dúvida aleatória no meio do processo; puxar a orelha muda o modelo para cima; existe outra forma de descer o modelo; agradecer pelo ótimo trabalho existe.
- Escada de modelos do Claude, do mais fraco ao mais forte: `haiku`, `sonnet`, `opus`, `fable`.
- Puxar a orelha e baixar o modelo são permanentes até o dono mudar de novo (decisão do dono, depois de apresentada a alternativa de reverter após a próxima tarefa).
- Auras (decisão do dono, depois de ver três rodadas de mockups):
  - `fable` é o único com chama de energia vindo do alto: chama grande dourada com miolo branco, brasas subindo, raios, ondas no chão e o corpo tremendo. É o nível "supremo".
  - `opus` tem algo intermediário: um brilho mais forte, sem fogo.
  - `haiku` e `sonnet` têm uma aura singela, quase imperceptível.
  - Agentes que rodam no Codex seguem a mesma lógica, com uma escada própria.
  - O visual JMAL (rubi, dourado, coroa) é só do dono e não é reaproveitado.
- A aura não é a fantasia JMAL e não substitui as fantasias existentes (`costume`).
- Referência visual das auras: `.superpowers/brainstorm/1475-1792584630/content/auras-chama-v3.html` (git-ignorado). O boneco nesse arquivo é um bloco de teste; a aura é o que vale.

## Decisões tomadas pelo autor do documento (a conferir)

- Só o dono usa o boneco e o menu. Para a equipe e para o celular, nada muda. Todas as ações do menu que mudam o estado (modelo, XP, `/btw`) são `ownerOnly` no servidor, pela mesma tabela de risco do painel da holding, não só escondidas na página.
- Subir o modelo custa mais, mas a ação nasce de um clique do próprio dono na página dele. Por isso a decisão é: sem janela de confirmação do Windows, e sim uma confirmação dentro do menu mostrando o modelo de origem, o de destino e que o custo sobe. Baixar o modelo não pede confirmação. Ambas ficam em `data/auditoria.jsonl`. Se o dono preferir a janela do Windows na subida, é uma troca de uma linha na tabela de risco.
- Alcance e foco: o alvo é o interagível mais perto dentro de cerca de 1,5 casa na frente do boneco. Sem alvo, `E` não faz nada. Com mais de um, vale o mais perto.
- `/btw`: uma pergunta de uma rodada, feita pelo mesmo mecanismo de execução dos agentes (`runTurn`), sem ferramentas, em sessão separada, com o prompt de sistema do agente. A resposta aparece num balão perto do agente e não entra na fila de tarefas dele, nem altera `data/` de tarefas. Se o agente estiver em tarefa de código, o `/btw` não toca na tarefa. Fica limitado em tamanho de pergunta e resposta e tem um intervalo mínimo entre perguntas, para não virar um canal de gasto sem controle.
- Agradecer: o botão só fica habilitado se o agente tem um resultado verificado ainda não agradecido (tarefa concluída pelo dono ou rotina concluída sem erro). A chave de XP é `obrigado:<id do resultado>`, única. Quando o agradecimento pertence a um cartão que o dono já marcou com "Ficou bom", não soma de novo.
- "Desafiar": no projeto 3 a opção existe, aparece habilitada só para agente ocioso, e leva a uma tela de convite que diz que os jogos chegam no próximo projeto. Nada de moeda ou humor aqui.
- Elevador: o menu lista os andares que o snapshot já informa (`rooms[].floor`, mais os andares 1 e 2). Escolher um andar usa a troca de andar que já existe (`setFloor`) e leva o boneco para o elevador do andar de destino. Nenhum agente é tocado.
- O boneco nasce no elevador do andar 1 ao abrir o escritório, e a posição não é guardada entre sessões.
- Codex: a escada de modelos do Codex é uma tabela no servidor, por provedor, preenchida com os ids de modelo que o runner de Codex aceita hoje (`runner.mjs`, argumento `-m`). Id fora da tabela é tratado como "sem degrau": o agente mostra a aura singela e as ações de subir e descer ficam desabilitadas com o motivo.
- Desempenho: a aura é desenhada junto do agente, sem camada extra por frame para agentes fora da tela. A forma de fazer (sprite pré-desenhado, camada de canvas, partículas) fica com o construtor, desde que a cena com todos os agentes visíveis continue fluida.

### Respostas à checagem do construtor (decisões do autor, a conferir)

- A tabela de risco já existe: o painel da holding foi mesclado na `main` e a classificação mora em `server/core/pendencias.mjs` (`classify`, com `ownerOnly`). Este projeto estende essa tabela com as novas ações (`modelo:subir`, `modelo:descer`, `agradecer`, `btw`, todas `ownerOnly`), em vez de criar outra.
- Agradecer: o id canônico do resultado é o id da tarefa (`tarefa:<id>`) ou o id da execução da rotina (`rotina:<id>`), os mesmos que o `xp.mjs` já usa em `bom:<id>` e `rotina:<id>`. A chave nova é `obrigado:<id>`. Se já existe `bom:<id>` para o mesmo resultado, agradecer não soma XP (o botão mostra "já reconhecido"). O botão só habilita para o resultado mais recente ainda sem `bom:` nem `obrigado:`, e o servidor confere isso, não a página.
- Subir o modelo: quem protege o dono é o servidor, não a confirmação da tela. A rota exige o papel `dono` e recebe o degrau esperado (`de` e `para`). Se o modelo atual do agente não for o `de`, responde 409 sem mudar nada, o que impede clique repetido ou duplo salto. A confirmação da tela é só um passo de interface.
- Troca de modelo e `effort`: ao trocar, o servidor revalida o agente inteiro pela validação existente em `agents.mjs`. Se o `effort` atual não valer para o novo modelo, o servidor mantém o `effort` e rejeita a troca com o motivo, sem gravar estado inválido.
- `/btw`: no máximo 500 caracteres de pergunta e 1500 de resposta, uma pergunta em andamento por agente e intervalo mínimo de 20 segundos por agente, guardados em memória (somem ao reiniciar). Funciona também com agente Codex, pelo runner dele. Se existir um teto de custo no projeto, o `/btw` respeita o mesmo teto das chamadas entre agentes.
- Elevador: o menu só lista andares com ponto de elevador no mapa. Andar sem elevador não aparece na lista e o motivo fica visível. Se não houver nenhum elevador alcançável, o menu mostra uma mensagem em vez de uma lista vazia.

## O que fica para o construtor

- Como acoplar o boneco do dono ao `Sim` do escritório, reaproveitando o que `visitor.ts` já faz, sem quebrar a simulação por andar nem a visita.
- A forma exata de desenhar a aura (e as auras singela e intermediária, que ainda não têm mockup) respeitando os níveis acima, a regra de acessibilidade e `prefers-reduced-motion`.
- O contrato do servidor para trocar modelo, agradecer e `/btw` (rotas, verificação de papel, auditoria, tabela de risco), seguindo os padrões do painel da holding.
- A tabela de escada de modelos do Codex, a partir do que o runner aceita.
- Estados vazios e erros: agente que some enquanto o menu está aberto, agente em tarefa quando o dono tenta `/btw`, modelo já no topo ou na base, falha ao gravar o modelo.
- Como o terminal do agente abre a partir do menu (reaproveitar o painel de terminal existente).

## Critérios de sucesso

- O dono abre o escritório, anda até um agente com o teclado e abre o menu com `E`.
- Conversar abre o terminal do agente certo. `/btw` devolve uma resposta sem interromper uma tarefa em andamento do agente.
- Puxar a orelha troca o modelo do agente um degrau acima, mostra a nova aura e fica registrado na auditoria; baixar faz o inverso. Equipe e celular recebem 403 nessas ações.
- Agradecer rende XP uma única vez por resultado e nunca sem resultado verificado.
- O `fable` aparece com a chama e o `opus` com o brilho intermediário; `haiku` e `sonnet` quase não chamam atenção. O nome do modelo está sempre disponível em texto.
- O elevador troca o dono de andar sem mexer nos agentes.
- A suíte (`npm run check`) e o build continuam passando.
