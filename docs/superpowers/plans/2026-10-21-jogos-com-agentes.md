# Jogos com agentes, moedas, humor e carteira no servidor: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono e a equipe desafiam um agente ocioso para Pedra, Papel e Tesoura (melhor de 3, aposta 5/10/25 moedas), com carteiras guardadas no servidor e humor do agente que muda com o resultado.

**Architecture:** Três módulos puros novos em `server/core/` (`carteiras.mjs`, `humor.mjs`, `jogos.mjs`) no padrão do `xp.mjs` (JSON em `config.data`, leitura e gravação síncronas, objetos sem protótipo). Quatro rotas novas em `server/bridge.mjs` com o mesmo controle de acesso das ações do projeto 3. O cliente ganha um modelo puro (`jogo-model.ts`), um painel néon (`jogo.ts`), a chamada de API e liga a ação `desafiar` do menu de interação.

**Tech Stack:** Node 22 (`.mjs` + testes vitest `.test.ts` ao lado, com `// @ts-expect-error módulo .mjs sem tipos` nos imports), TypeScript + Vite no cliente (`h()` de `client/src/ui/dom.ts`, estilos em `neon.css`). `npm run check` = build-shared + checagens + vitest; `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-21-jogos-com-agentes-design.md`

## Global Constraints

- Texto de interface em português; código e commits em prosa normal. Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Só jogo: Pedra, Papel e Tesoura, melhor de 3, vence quem ganhar 2 rodadas; empate de rodada repete, no máximo 5 rodadas, depois a partida empata e as apostas voltam. Gestos: `pedra`, `papel`, `tesoura`.
- Apostas válidas: 5, 10, 25. Saldo inicial: 100 para cada pessoa e 100 para cada agente, concedido uma única vez.
- Moeda nunca é criada nem destruída por uma partida; saldo nunca negativo; as duas apostas são reservadas ao abrir.
- A jogada do agente é sorteada no servidor (`crypto.randomInt`, injetável como `sorteio` nos testes) só depois de receber a jogada da pessoa, e o cliente nunca a vê antes.
- Quem joga: papel `dono` ou `equipe` com `nome`. 403 para token sem nome, token inválido e agente (`x-v2-agente`). Todas as escritas em PHONE_WRITES e AUDITED, com `nome`.
- Uma partida aberta por agente e uma por pessoa; 10 s de intervalo por par pessoa-agente; partida sem jogada por 2 minutos expira e devolve as apostas sem mexer no humor. Agente precisa estar ocioso.
- Humor: `animado`, `neutro`, `chateado`; soma das 5 últimas partidas (vitória do agente +1, derrota −1, empate 0): ≥ 2 animado, ≤ −2 chateado; volta a neutro após 6 h. Só expressão: nunca altera aura, modelo, nível, tarefa, custo ou prioridade. Falas fixas, sem chamar modelo de linguagem.
- Texto vindo do servidor entra na página só por `textContent`/`h({text})`. `prefers-reduced-motion` desliga a animação de revelação. Painel operável por teclado (1, 2, 3 para os gestos).
- Nunca usar `D:\escritorio-v2\data` real em testes: diretório de dados temporário, porta própria, `V2_CONFIRMACAO=nao`, `V2_TELEGRAM=off`.
- Não copiar arte, nomes ou formatos de outro jogo.

## Review Focus

- Dois cliques/duas abas jogando o mesmo gesto na mesma rodada: a rodada conta uma vez só; a segunda chamada recebe 409.
- Pessoa sem saldo para a aposta, agente sem saldo, agente que ficou ocupado entre abrir e jogar: 422/409 sem mexer em moeda.
- Soma de todas as carteiras antes e depois de qualquer sequência de partidas (inclusive expiradas e empatadas) é a mesma.
- Id de agente ou nome de pessoa hostil (`__proto__`, `constructor`, maiúsculas, espaços): vira chave comum e não quebra a carteira.
- Partida lida por outra pessoa: 404/403 (só quem abriu lê e joga).
- Recarregar a página no meio da partida: `GET /api/jogos/:id` devolve o estado e o painel retoma.

---

### Task 1: Carteiras no servidor

**Files:**
- Create: `server/core/carteiras.mjs`, `server/core/carteiras.test.ts`

**Interfaces:**
- Produces:
  - `chavePessoa(nome: string): string` → `pessoa:<nome minúsculo, trim>`; `chaveAgente(id: string): string` → `agente:<id>`.
  - `SALDO_INICIAL = 100`.
  - `saldoDe(chave): number` (cria a conta com o saldo inicial na primeira consulta, uma única vez).
  - `extratoDe(chave): Array<{at, delta, texto}>` (até 20, mais recente primeiro).
  - `mover({ id, de, para, valor, texto }, now?): {ok:true, duplicado:boolean} | {ok:false, status:422, error}` — move `valor` de uma conta para outra de forma atômica; `id` é a chave de idempotência (mesmo `id` não move de novo); recusa se `de` ficaria negativa.
  - `totalGeral(): number` (soma de todas as contas, para testes de conservação).

- [x] **Step 1: Testes primeiro** em `carteiras.test.ts` com `V2_DATA` temporário (mesmo padrão de `xp.test.ts`): saldo inicial uma vez só; `mover` ok; `mover` repetido com o mesmo `id` devolve `duplicado` sem mover; saldo insuficiente devolve 422 sem alterar; `chavePessoa(' Ana ')` igual a `chavePessoa('ana')`; nomes `__proto__`/`constructor` viram contas comuns; extrato limitado a 20; `totalGeral` constante após várias movimentações.
- [x] **Step 2:** Rodar `npx vitest run server/core/carteiras.test.ts`; deve falhar (módulo não existe).
- [x] **Step 3: Implementar** `carteiras.mjs` em `data/carteiras.json` com `limpo()` como no `xp.mjs`; conferir e gravar sem `await` entre os dois passos; ids de movimentação guardados em `movimentos` e podados além dos últimos 500.
- [x] **Step 4:** Testes passam; `npm run check` verde.
- [x] **Step 5: Commit** `feat(jogos): carteiras de pessoas e agentes no servidor`.

---

### Task 2: Humor do agente

**Files:**
- Create: `server/core/humor.mjs`, `server/core/humor.test.ts`

**Interfaces:**
- Produces:
  - `registrarPartida(agentId: string, resultado: 'agente'|'pessoa'|'empate', now?): void` (guarda as 5 últimas em `data/humor.json`).
  - `humorDe(agentId: string, now?): 'animado'|'neutro'|'chateado'` (regra e prazo de 6 h das Global Constraints).
  - `falaDe(humor: string, resultado?: string): string` — textos curtos e fixos em português (pelo menos 2 variações por humor, escolha estável por `agentId` não necessária: aceitar `sorteio` opcional).

- [x] **Step 1: Testes primeiro:** sem partidas é `neutro`; duas vitórias do agente seguidas = `animado`; duas derrotas = `chateado`; vitória + derrota + empate = `neutro`; só as 5 últimas contam (seis partidas, a primeira cai fora); passadas 6 h volta a `neutro`; empate não altera a soma; `falaDe` nunca devolve string vazia para os três humores; id `__proto__` é comum.
- [x] **Step 2:** Rodar e ver falhar.
- [x] **Step 3: Implementar** `humor.mjs` no padrão do `xp.mjs`.
- [x] **Step 4:** Testes passam.
- [x] **Step 5: Commit** `feat(jogos): humor do agente a partir das partidas`.

---

### Task 3: Regras do jogo

**Files:**
- Create: `server/core/jogos.mjs`, `server/core/jogos.test.ts`

**Interfaces:**
- Consumes: `mover`, `saldoDe`, `chavePessoa`, `chaveAgente` (Task 1); `registrarPartida`, `humorDe` (Task 2).
- Produces: `criarJogos({ getAgent, agenteOcioso, sorteio = (n) => crypto.randomInt(n), agora = Date.now }): { desafiar, jogar, ler }` onde:
  - `desafiar({ pessoa, agentId, aposta }): {ok:true,status:200,id,rodada:1,placar:{pessoa:0,agente:0},saldo}` ou `{ok:false,status,error}` (400 aposta/corpo, 403 papel, 404 agente, 409 ocupado/ já em partida, 422 sem saldo da pessoa ou do agente, 429 intervalo). Reserva as duas apostas movendo-as para a conta `partida:<id>`.
  - `jogar({ pessoa, id, gesto }): {ok:true,status:200,rodada:{numero,gestoPessoa,gestoAgente,vencedor:'pessoa'|'agente'|'empate'},placar,fim:boolean,resultado?:'pessoa'|'agente'|'empate',saldo?,humor?,fala?}` ou erro (400 gesto, 403/404 se não for a pessoa que abriu, 409 partida encerrada, 410 partida expirada).
  - `ler({ pessoa, id }): estado da partida` (mesma pessoa que abriu, senão 404).
  - Expiração: ao qualquer chamada, partidas sem jogada há mais de 2 minutos são encerradas devolvendo as apostas, sem tocar no humor.
  - O pagamento final move as duas apostas de `partida:<id>` para o vencedor (ou devolve a cada um, no empate), com `id` de movimentação `<partida>:fim` para idempotência. `registrarPartida` só roda no fim normal.

- [x] **Step 1: Testes primeiro** (sorteio e relógio injetados): abre partida reservando as apostas (saldos caem, `totalGeral` constante); vitória por 2 a 0; vitória por 2 a 1; rodada empatada repete e não conta; cinco rodadas sem vencedor = partida empatada com apostas devolvidas; aposta 7 → 400; aposta maior que o saldo → 422 sem reservar nada; agente sem saldo → 422; agente não ocioso → 409; segunda partida da mesma pessoa aberta → 409; segunda partida no mesmo agente → 409; intervalo de 10 s → 429; gesto inválido → 400; jogar numa partida de outra pessoa → 404; jogar partida encerrada → 409; expiração devolve as apostas e não altera o humor; `jogar` com `rodada` diferente da rodada atual (clique duplo, duas abas) → 409 sem avançar; conservação de moedas após 50 partidas aleatórias.
- [x] **Step 2:** Rodar e ver falhar.
- [x] **Step 3: Implementar** `jogos.mjs`. A rodada atual vem do servidor; `jogar` recebe `rodada` (número esperado) e responde 409 se diferir. Tudo síncrono entre conferir e gravar. Estado das partidas em `data/jogos.json` (partidas abertas e as últimas 50 encerradas), objetos sem protótipo.
- [x] **Step 4:** Testes passam; `npm run check` verde.
- [x] **Step 5: Commit** `feat(jogos): partida de pedra, papel e tesoura com apostas reservadas`.

---

### Task 4: Rotas, acesso e auditoria

**Files:**
- Modify: `server/bridge.mjs`, `server/core/acesso.mjs` (PHONE_WRITES), `server/core/auditoria.mjs` (AUDITED), testes em `server/core/acesso.test.ts` e `server/core/auditoria.test.ts`
- Modify: onde o elenco do painel e a lista de agentes são montados em `server/bridge.mjs` (campo `humor`)

**Interfaces:**
- Consumes: `criarJogos` (Task 3), `humorDe` (Task 2), `saldoDe`/`extratoDe`/`chavePessoa` (Task 1). `agenteOcioso(id)`: o agente não tem tarefa em andamento (usar o mesmo critério que o menu usa para `ocioso`).
- Produces rotas (resposta `{ok, ...}` como nas rotas do projeto 3):
  - `GET /api/carteira` → `{saldo, extrato}` da pessoa logada (403 sem nome).
  - `POST /api/jogos/desafio` `{agente, aposta}`; `POST /api/jogos/:id/jogada` `{gesto, rodada}`; `GET /api/jogos/:id`.
  - Campo `humor` em cada item do elenco de `/api/holding`, `/api/xp` e na lista de agentes que o menu lê.

- [x] **Step 1: Testes primeiro:** PHONE_WRITES casa `POST /api/jogos/desafio` e `POST /api/jogos/<id>/jogada` e não casa GET nem variantes com `..`/`%2F`; AUDITED casa as duas escritas; agente (`x-v2-agente`) e token sem nome recebem 403 nas quatro rotas (teste de rota no estilo dos testes de rota já existentes em `server/`).
- [x] **Step 2:** Rodar e ver falhar.
- [x] **Step 3: Implementar** as rotas no `bridge.mjs` depois do bloco `/obrigado`, com a mesma ordem de checagens (origem, papel, agente, nome), `auditRecord` com `nome` e `path` terminando em `#<id da partida>` na abertura e no fim.
- [x] **Step 4:** Subir servidor isolado (`BRIDGE_PORT=4599`, dados temporários) e rodar uma partida inteira por `curl`: 200 no desafio, jogadas até o fim, saldos conferidos em `GET /api/carteira`, 403 para agente e para token sem nome, 409 ao repetir rodada, e `humor` visível no elenco. Registrar as chamadas e os códigos no relatório.
- [x] **Step 5:** `npm run check` verde. **Commit** `feat(jogos): rotas de carteira e desafio com acesso por pessoa`.

---

### Task 5: Painel do jogo no cliente

**Files:**
- Create: `client/src/ui/jogo-model.ts`, `client/src/ui/jogo-model.test.ts`, `client/src/ui/jogo.ts`
- Modify: `client/src/ui/interacao.ts` (ação `desafiar`), `client/src/ui/interacao-api.ts` (chamadas), `client/src/ui/interacao-model.ts` (habilitar `desafiar` só com saldo e agente ocioso; motivo), `client/src/ui/neon.css`, `client/src/ui/holding.ts` (carteira do servidor no lugar do total do navegador), testes dos modelos

**Interfaces:**
- Consumes: as rotas da Task 4.
- Produces:
  - `jogo-model.ts` (puro): `rotuloGesto(g)`, `resumoRodada(r)`, `textoResultado(fim, resultado, delta)`, `apostasPossiveis(saldoPessoa, saldoAgente): number[]`, `mensagemDaFalha(status, erro)` (mensagens em português para 403/404/409/410/422/429/0).
  - `jogo.ts`: `abrirJogo({ agente, aoFechar })` monta o painel (escolha da aposta, saldo, três botões com teclas 1, 2, 3, placar, revelação da jogada do agente, resultado, humor); fecha com Esc; guarda de clique único em voo (reaproveitar `criarGuarda` de `interacao-model.ts`); retoma partida aberta com `GET /api/jogos/:id`.
  - Em `interacao.ts`, a ação `desafiar` abre o painel no lugar do texto "Os jogos chegam no projeto 4".

- [x] **Step 1: Testes primeiro** dos modelos puros (apostas possíveis só até o menor saldo; mensagens por status; texto do resultado para vitória, derrota e empate) e do `interacao-model` (desafiar habilitado com agente ocioso e saldo ≥ 5; apagado com motivo "sem moedas" ou "só agente ocioso"; o teste existente com a ordem dos itens continua passando).
- [x] **Step 2:** Rodar e ver falhar.
- [x] **Step 3: Implementar** os modelos e a interface. Texto do servidor só por `h({text})`. `prefers-reduced-motion`: sem revelação animada. Estilos no sistema néon existente (variáveis de `neon.css`, sem cores soltas). No painel da holding, mostrar o saldo vindo de `GET /api/carteira`; se a chamada falhar, esconder o número em vez de mostrar o do navegador.
- [x] **Step 4:** `npm run check` e `npm run build` verdes.
- [x] **Step 5: Commit** `feat(jogos): painel de desafio no menu do agente`.

---

### Task 6: Documentação e teste de ponta a ponta

**Files:**
- Modify: `README.md` (seção "Jogos e moedas": regras, rotas, onde ficam os arquivos, como a equipe joga)

- [x] **Step 1 (feito por HTTP, `server/test/jogos-http.test.ts`):** Servidor isolado em outra porta com dados temporários, agentes de teste ociosos e uma pessoa da equipe cadastrada.
- [ ] **Step 2 (NÃO FEITO no navegador; cobertura só por HTTP e testes de modelo):** No navegador: abrir o menu do agente ocioso, desafiar, jogar uma partida inteira pelo teclado e pelo mouse, conferir saldo, humor e extrato; recarregar no meio da partida e conferir que ela retoma; tentar jogar com a equipe e com agente ocupado.
- [x] **Step 3 (README e CHANGELOG):** Escrever a seção do README e declarar o que não foi visto.
- [x] **Step 4:** `npm run check` e `npm run build` verdes. **Commit** `docs(jogos): README com regras, rotas e arquivos`.
