# Interação total: bug do desafio, objetos do mapa, presença multiusuário e celular que controla tudo (projeto 6)

**Branch:** `feature/interacao-total` (worktree `D:\escritorio-v2-interacao`). Sem merge e sem push. Não mexe em `client/src/art/` (o Sérgio redesenha a arte em outro worktree), nem em ids e posições dos móveis.

**Base lida:** specs `2026-10-21-boneco-do-jogador-design.md` (boneco, menu `E`, mesmas regras de acesso: só `dono` e `equipe` com nome) e `2026-10-21-jogos-com-agentes-design.md` (pedra, papel e tesoura, carteira e humor no servidor, só moedas), e o plano `2026-10-22-equipe-na-barra.md` (personagens da equipe em `data/personagens.json`).

**Como testar sem tocar no servidor do João:** servidor próprio com `BRIDGE_PORT=4540` e `V2_DATA`/`V2_HOME` temporários, Chrome headless com `playwright-core`. Nunca a porta 4530.

## Tarefas, na ordem do João

### 1. Bug: "Desafiar para um jogo" não funciona
- [ ] Reproduzir no Chrome (menu `E` > Desafiar > aposta) e achar a causa de verdade (`systematic-debugging`).
- [ ] Teste de regressão no servidor e correção na causa.
- [ ] Partida completa a partir do menu no navegador. **Retorno parcial ao fechar este item.**

### 2. Interação com todos os objetos
- [ ] Inventário dos móveis (`client/src/art/furniture/`, só leitura) e do que o mapa coloca em cada sala.
- [ ] Alvo "objeto" em `world/player.ts` (mesmo raio e regra de frente do agente), com id estável do móvel; dica "E · …" no laço do menu.
- [ ] Modelo puro do menu dos objetos (`interacao-model.ts`) com testes: fliperama e ping-pong (convidar agente ocioso ou jogar contra ele, reaproveitando `jogos.mjs` e as carteiras, só moedas), mais uma ação simples e coerente por tipo de móvel (sentar, pegar café, ver a lousa, ver a hora, olhar pela janela).
- [ ] Textos novos com `tr()` e traduções en, es e fr. Teste no navegador de cada objeto.

### 3. Boneco de outra pessoa em tempo real (presença)
- [ ] Desenho curto no fim deste arquivo (canal ao vivo do servidor, formato, limite de taxa, remoção ao desconectar, acesso).
- [ ] Servidor: módulo `presenca.mjs` com testes (estado em memória por pessoa, limite de taxa, expiração, só `dono` e `equipe` com nome) e as rotas.
- [ ] Cliente: envia a posição do boneco com limite de taxa; desenha o boneco dos outros com o personagem editado e o nome; remove ao sumir.
- [ ] Teste com duas abas e duas pessoas no navegador.

### 4. Celular controla tudo
- [ ] Direcional na tela que chama `player.setIntent`, visível só em tela de toque.
- [ ] Botão de interação (E) e menus operáveis por toque; jogo pelo celular.
- [ ] `phoneGate`: liberar só as rotas que o menu usa, mantendo o token do QR code e a trava `V2_CELULAR_ESCRITA`; testes de acesso.
- [ ] Atualizar `CELULAR.md` e testar com viewport e toque no Chrome.

## Fechamento de cada entrega
`npm test`, teste no navegador, `npm run check`, `tsc -b`, `npm run build` e `npm run i18n:check` (sem texto novo sem tradução), commits pequenos em português.
