# Mudanças

## [Não lançado]

### Adicionado

- Interação com os móveis do mapa (tecla E): fliperama e mesa de ping-pong convidam um agente ocioso para o jogo (mesmas carteiras e moedas); os outros móveis (sofá, café, lousa, relógio, janela, estante...) mostram uma ação curta.
- Presença ao vivo: quem está com o Claubbo aberto (dono e equipe com nome) aparece como boneco, com o personagem editado e o nome, no mapa dos outros. Rotas `POST /api/presenca` e `/api/presenca/sair` e evento `presenca` no `/api/stream`; só memória, limite de taxa e remoção ao fechar a página.
- Controles de toque no celular: direcional, botão E e correr; o celular anda pelo mapa, abre os menus e joga. Veja CELULAR.md.
- Jogos com agentes: o dono e a equipe desafiam um agente ocioso para Pedra, Papel e Tesoura (melhor de 3, aposta de 5, 10 ou 25 moedas) pelo menu do agente. Veja "Jogos e moedas" no README.
- Carteiras de pessoas e agentes guardadas no servidor (100 moedas iniciais, apostas reservadas, moeda conservada). O painel da holding passa a mostrar a carteira do servidor no lugar do valor do navegador.
- Humor do agente (animado, neutro ou chateado) conforme o resultado das últimas partidas, só como expressão: não altera aura, modelo, nível, tarefa, custo nem prioridade.
- Equipe na barra superior: um avatar por pessoa (o dono com a skin JMAL), com editor de personagem; a pessoa edita o próprio e o dono edita qualquer um. Rotas `GET /api/equipe` e `POST /api/equipe/<nome>/personagem`, com auditoria.
- O dono pode editar o próprio personagem (JMAL): a fantasia rubi, dourado e coroa aparece na barra e na prévia do editor, as peças escolhidas valem por cima dela e "Voltar ao padrão" volta ao JMAL original.
- Etiqueta de humor (animado ou chateado) ao lado do nome do agente na barra lateral e na gaveta.
- Humor no mapa: emoji (😄 ou 😞) sobre a cabeça do agente, só quando o humor não é neutro.
- Textos de jogos, equipe na barra e humor traduzidos (en, es, fr) e `npm run i18n:check` na raiz.
- Rotas `GET /api/carteira`, `POST /api/jogos/desafio`, `POST /api/jogos/:id/jogada` e `GET /api/jogos/:id`, com acesso por pessoa e auditoria com o nome.

### Corrigido

- "Desafiar para um jogo" no menu do mapa falhava porque o menu manda o id do snapshot (`escritorio:<id>`) e o servidor só conhecia o id puro; agora aceita os dois.
