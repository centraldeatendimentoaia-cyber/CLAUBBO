# Painel da holding e gamificação básica: design

Data: 2026-10-21. Projeto 2 de 5 (ver "Contexto e ordem dos projetos").

## Intenção e motivo

O escritório (`D:\escritorio-v2`) já tem agentes, rotinas agendadas, aprovações, jogos entre agentes e carteiras. Falta uma tela que responda, ao abrir de manhã: "o que precisa de mim agora, e o que o resto da holding fez sem mim?". Hoje isso está espalhado e exige abrir cada agente.

A fantasia do produto é uma "big holding": todas as tarefas agendadas rodam, os agentes ficam esperando o dono para trabalhar, e há um elenco de agentes funcionais e inteligentes. O painel é a porta de entrada dessa fantasia. O público, por enquanto, é o dono e a equipe dele.

Decisão central do dono: **o que esperam dele é a primeira coisa na tela.** Todo o resto é consulta.

## Contexto e ordem dos projetos

Combinado com o dono, nesta ordem:

1. Design system néon (tokens, componentes). Rascunho aprovado nos mockups.
2. **Este projeto:** painel da holding + gamificação básica.
3. Boneco do jogador + botão de interação perto de objetos e pessoas.
4. Jogos contra agentes (só moedas; humor do agente muda com o resultado) e carteira no servidor.
5. Arte nova (quartos, bonecos, distintivos), original, sem copiar arte, nomes ou formatos de outro jogo.

Este documento cobre só o projeto 2. O visual vem do projeto 1 (néon), aplicado ao painel.

## Objetivos

- Mostrar "Esperando você" como primeira e maior seção. Cada pedido vira um cartão com: quem pediu, o que vai acontecer, há quanto tempo espera, custo (sim/não) e se é reversível. O dono decide sem abrir outra tela.
- Ação direta no cartão, com atalhos de teclado (1, 2, 3 por cartão; A para o lote seguro).
- Botão "Aprovar os seguros": aprova de uma vez só os itens que são, ao mesmo tempo, reversíveis, sem custo e que não enviam mensagem a terceiros. O dono confirmou esta regra ("faz total sentido").
- Mostrar, abaixo, o dia da holding: rotinas de hoje (rodou, falhou, vai rodar), elenco com nível, carteira do dono, ticker de atividade.
- Gamificação básica: XP e nível por agente, moedas do dono, atribuídos só por resultado verificado.
- Falha de rotina visível e destacada, nunca escondida.

## Fora do escopo (não objetivos)

- Boneco do jogador, botão de interação, jogos contra agentes, carteira no servidor (projetos 3 e 4).
- Arte nova de quartos, bonecos e distintivos (projeto 5).
- Multiusuário completo (contas, convites, permissões finas por agente). Esta versão tem só o mínimo descrito em "Decisão do dono sobre a equipe".
- Mapear empresas da holding para quartos. Era só um palpite; não está decidido.

## Antiobjetivos (seria fracasso mesmo funcionando)

- XP por volume (mensagens, tokens, número de tarefas disparadas). Isso premia lixo. XP só vem de resultado verificado: aprovação do dono, teste passando, rotina concluída com sucesso.
- Uma aprovação em lote que mande mensagem, gaste dinheiro ou faça algo irreversível sem clique individual.
- Estado do agente comunicado só por cor.
- Cópia de arte, nomes ou formatos do Habbo Hotel ou do Code Tavern.

## Restrições

- Código existente: servidor Node 22 em `server/bridge.mjs` (porta 4530) com `server/core/*` (agentes, runner, fila, tarefas, rotinas, reuniões, uso, chat); cliente TypeScript + Vite + canvas em `client/src`. Dados em `data/*.json`. Seguir esses padrões.
- Segurança existente não pode regredir: tokens por instalação em `data/acesso.json`, diálogo de confirmação do Windows nas aprovações sensíveis, auditoria em `data/auditoria.jsonl`, `data/tool-rules.json`. O diálogo do Windows aparece só na máquina do servidor; a equipe remota vai precisar de aprovação na própria página (projeto futuro). O painel não pode contornar o diálogo.
- Acessibilidade: o estado nunca é só cor; cada estado tem forma própria. Contraste legível sobre fundo roxo-escuro. Tudo operável por teclado.
- Carteiras hoje ficam em `localStorage` (`claubbo.wallets.v1`). Mover para o servidor é projeto 4. O painel só lê o valor existente.

## Decisões de design (do dono ou acordadas)

Tokens néon, vindos do mockup aprovado:

| Token | Valor |
|---|---|
| Noite (fundo) | `#1a0f2e` |
| Roxo (painel) | `#2a1452` |
| Profundo (sombra, ticker) | `#0d0620` |
| Rosa | `#ff4fa3` |
| Turquesa | `#3ad3d0` |
| Amarelo | `#ffd23f` |
| Lima | `#7cff6b` |
| Branco | `#ffffff` |
| Lilás (parado) | `#a99cc9` |

- Botões e painéis: borda branca de 3px, sombra em "degrau" (`0 4px 0` escura), sem blur. Títulos em Pixelify Sans, corpo em system-ui.
- Estados do agente, sempre cor + forma + texto: trabalhando = quadrado lima; esperando você = losango amarelo; shell = círculo turquesa; parado = quadrado lilás; erro = triângulo rosa.
- Ordem da tela, de cima para baixo: (1) "Esperando você" em destaque com borda amarela; (2) faixa de 4 indicadores (rotinas de hoje, falhas, XP do elenco hoje, carteira); (3) duas colunas: Rotinas e Elenco; (4) ticker de atividade.
- Cartão de pedido: avatar do agente, título, descrição curta, etiquetas (tempo de espera, "sem custo", "reversível", "irreversível", "envia mensagem" em rosa), botões de ação com atalho. Cartão urgente (espera longa) ganha borda rosa. Ordenação por urgência.
- Itens que enviam mensagem ou são irreversíveis ficam de fora do lote seguro e exigem clique próprio.
- Protótipo de referência: `.superpowers/brainstorm/20-1792555236/content/painel-holding-v2.html` (dados fictícios; mostra organização, não números).

## Gamificação básica

- Cada agente tem XP e nível. XP é concedido apenas por evento verificado: o dono aprovou o resultado, um teste passou, uma rotina terminou com sucesso. Tabela de pontos exata fica com o construtor, com o princípio acima como limite.
- O dono tem nível e moedas (as da carteira existente).
- O ticker mostra eventos recentes que renderam XP ou moedas.

## O que fica para o construtor

- De onde vem "pedido esperando o dono": o construtor deve mapear o que já existe (aprovações pendentes, tarefas aguardando, saídas de agentes pensadores) e propor o contrato de dados. Se faltar um conceito unificado de "pedido pendente", criá-lo no servidor.
- Como classificar "reversível", "custo" e "envia mensagem": hoje não há esse metadado. Regra segura: na dúvida, tratar como não seguro (fora do lote).
- Persistência de XP e nível (arquivo em `data/`, seguindo o padrão atual).
- Formato visual dos indicadores, animações, estados vazios (nada esperando; nenhuma rotina hoje) e comportamento em tela estreita.
- Como o painel entra na navegação atual do cliente (tela inicial, painel lateral, atalho).

## Decisões tomadas pelo autor do documento (a conferir)

- Itens que passam pelo diálogo de confirmação do Windows (`confirmHuman`/`humanGated`) nunca entram no lote seguro. O lote pode ficar vazio com frequência; isso é aceito, porque segurança vale mais que conveniência.
- Escopo dos cartões na primeira versão: só fontes que já têm ação de decisão (aprovar, recusar, adiar). Saídas de agentes pensadores sem ação de decisão não viram cartão agora.
- A classificação de reversível, custo e "envia mensagem" mora no servidor, em tabela por tipo de pedido. O agente que pede nunca declara a própria classificação. Tipo sem entrada na tabela é tratado como não seguro. Deve existir teste de que item não seguro nunca entra no lote.
- "Hoje" usa o fuso do servidor (Brasil). Se `data/` não guardar histórico de execução de rotinas, o construtor passa a persistir um.
- Se o servidor responder 409 (pedido já decidido por outra pessoa ou mudou), o painel mostra "já decidido", atualiza o cartão e não repete a ação.
- XP concedido uma única vez por evento verificado (chave única por evento), para impedir duplicação por re-aprovação.
- Se o projeto 1 (tokens néon) ainda não existir em código, o painel cria os tokens do quadro acima como variáveis CSS reutilizáveis.

## Decisão do dono sobre a equipe

- A equipe também aprova pedidos pelo painel. O dono confirmou.
- Consequência: cada pessoa precisa ser identificável. Os tokens por instalação em `data/acesso.json` hoje identificam instalações, não pessoas. O construtor deve estender isso para um token por pessoa, com nome, e toda decisão registra quem decidiu em `data/auditoria.jsonl`.
- Dois papéis, decisão do autor do documento (a conferir): **dono** decide tudo; **equipe** decide pedidos comuns. Pedidos que passam pelo diálogo do Windows (`confirmHuman`/`humanGated`) continuam exigindo esse diálogo na máquina do servidor, e a equipe remota não os contorna: no painel, esses cartões aparecem para a equipe como "aguarda o dono". Pedidos que enviam mensagem a terceiros ou são irreversíveis só o dono aprova, pelo mesmo motivo.
- "Aprovar os seguros" funciona para os dois papéis, pois só inclui itens seguros.
- Dois decidindo ao mesmo tempo: vale o primeiro; o segundo recebe 409 e o painel mostra "já decidido por <nome>".
- Atualização em tempo real entre pessoas (push ou polling curto) fica a critério do construtor.
- "Ficou bom" (XP) só vale se clicado pelo dono.

## Decisão do dono sobre a janela do Windows

- A janela de confirmação do Windows fica só para o que é perigoso: tarefa de código nas etapas de implementação e testes, pedido de terminal, criar ou excluir agente. Sai da aprovação do plano de uma tarefa, das chamadas entre agentes e do lote seguro.
- Itens desconhecidos continuam exigindo a janela. A decisão é do servidor, não do cliente.

## Decisão do dono sobre XP

- Depois que uma tarefa executa, o cartão de resultado ganha o botão "Ficou bom". O XP principal do agente só é concedido quando o dono clica nele.
- Rotina concluída sem erro rende uma quantidade pequena de XP, sem clique.
- O evento "teste passou" fica fora desta versão, pois não há emissor dele hoje.

## Critérios de sucesso

- Ao abrir o painel, o dono vê primeiro o que espera por ele e decide um item em um clique ou uma tecla.
- "Aprovar os seguros" nunca aprova item que envia mensagem, custa dinheiro ou é irreversível.
- Falha de rotina aparece sem o dono precisar procurar.
- Nenhuma ação sensível do painel deixa de passar pelas proteções já existentes (diálogo, auditoria).
- XP só muda por eventos verificados, e isso é testável.
