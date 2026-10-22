# Interação total: bug do desafio, objetos do mapa, presença multiusuário e celular que controla tudo (projeto 6)

**Branch:** `feature/interacao-total` (worktree `D:\escritorio-v2-interacao`). Sem merge e sem push. Não mexe em `client/src/art/` (o Sérgio redesenha a arte em outro worktree), nem em ids e posições dos móveis.

**Base lida:** specs `2026-10-21-boneco-do-jogador-design.md` (boneco, menu `E`, mesmas regras de acesso: só `dono` e `equipe` com nome) e `2026-10-21-jogos-com-agentes-design.md` (pedra, papel e tesoura, carteira e humor no servidor, só moedas), e o plano `2026-10-22-equipe-na-barra.md` (personagens da equipe em `data/personagens.json`).

**Como testar sem tocar no servidor do João:** servidor próprio com `BRIDGE_PORT=4540` e `V2_DATA`/`V2_HOME` temporários, Chrome headless com `playwright-core`. Nunca a porta 4530.

## Tarefas, na ordem do João

### 1. Bug: "Desafiar para um jogo" não funciona
- [x] Reproduzir no Chrome (menu `E` > Desafiar > aposta) e achar a causa de verdade (`systematic-debugging`).
- [x] Teste de regressão no servidor e correção na causa.
- [x] Partida completa a partir do menu no navegador. **Retorno parcial ao fechar este item.**

### 2. Interação com todos os objetos
- [x] Inventário dos móveis (`client/src/art/furniture/`, só leitura) e do que o mapa coloca em cada sala.
- [x] Alvo "objeto" em `world/player.ts` (mesmo raio e regra de frente do agente), com id estável do móvel; dica "E · …" no laço do menu.
- [x] Modelo puro do menu dos objetos (`interacao-model.ts`) com testes: fliperama e ping-pong (convidar agente ocioso ou jogar contra ele, reaproveitando `jogos.mjs` e as carteiras, só moedas), mais uma ação simples e coerente por tipo de móvel (sentar, pegar café, ver a lousa, ver a hora, olhar pela janela). **Feito com ressalvas:** jogar contra a máquina e sentar com animação ficaram de fora (precisam de servidor e de pose novos); fliperama e ping-pong convidam agente ocioso, os demais móveis mostram uma ação em texto.
- [x] Textos novos com `tr()` e traduções en, es e fr. Teste no navegador de cada objeto.

### 3. Boneco de outra pessoa em tempo real (presença)
- [x] Desenho curto no fim deste arquivo (canal ao vivo do servidor, formato, limite de taxa, remoção ao desconectar, acesso).
- [x] Servidor: módulo `presenca.mjs` com testes (estado em memória por pessoa, limite de taxa, expiração, só `dono` e `equipe` com nome) e as rotas.
- [x] Cliente: envia a posição do boneco com limite de taxa; desenha o boneco dos outros com o personagem editado e o nome; remove ao sumir.
- [x] Teste com duas abas e duas pessoas no navegador.

### 4. Celular controla tudo
- [x] Direcional na tela que chama `player.setIntent`, visível só em tela de toque.
- [x] Botão de interação (E) e menus operáveis por toque; jogo pelo celular.
- [x] `phoneGate`: liberar só as rotas que o menu usa, mantendo o token do QR code e a trava `V2_CELULAR_ESCRITA`; testes de acesso.
- [x] Atualizar `CELULAR.md` e testar com viewport e toque no Chrome.

## Fechamento de cada entrega
`npm test`, teste no navegador, `npm run check`, `tsc -b`, `npm run build` e `npm run i18n:check` (sem texto novo sem tradução), commits pequenos em português.

## Desenho da presença ao vivo (item 3)

- **Canal:** o `/api/stream` (SSE) que já existe ganha o evento `presenca` com a lista inteira (`[{nome, papel, andar, x, y, dir}]`, x e y em tiles). Cada página manda a posição do próprio boneco com `POST /api/presenca` e sai com `POST /api/presenca/sair`.
- **Quem vê e quem aparece:** só `dono` e `equipe` com nome, nunca o token dos agentes. A pessoa vem do servidor (`req.pessoa`), nunca do corpo. Quem não pode não recebe o evento no stream e leva 403 ao avisar.
- **Estado:** só em memória, uma entrada por pessoa (nome sem diferenciar maiúscula). Duas abas da mesma pessoa viram um boneco só (vale o último aviso).
- **Limite de taxa:** o servidor recusa (429) avisos com menos de 80 ms de intervalo da mesma pessoa, valida andar, posição e direção (422) e aceita até 100 pessoas (503 depois). O cliente manda no máximo 5 avisos por segundo e só quando o boneco mudou.
- **Remoção:** fechar a última página da pessoa (conexão do stream cai) tira o boneco na hora; `sair` também; sem aviso por 8 s ele some (varredura a cada 2 s).
- **Aparência:** a lista não leva aparência. O cliente pega o personagem editado de cada um em `/api/equipe` (a mesma fonte da barra da equipe) e atualiza quando alguém novo aparece ou `equipe:salvo` dispara.
- **Escala para o escritório hospedado:** a chave da pessoa é o nome dela dentro de um escritório. Num servidor hospedado com login por escritório, basta uma instância de `criarPresenca` por escritório e o stream filtrado por ele; o formato da lista não muda.
- **Celular:** `/api/presenca` e `/api/presenca/sair` entram em `PHONE_WRITES` (o boneco do celular anda mesmo sem `V2_CELULAR_ESCRITA`). O token do QR code é o "dono" do celular e aparece com o nome `celular`.
