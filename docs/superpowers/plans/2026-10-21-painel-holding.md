# Painel da holding e gamificação básica: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma tela de painel em que "Esperando você" aparece primeiro, com decisão direta por cartão, aprovação em lote só do que é seguro, identidade por pessoa para a equipe e XP por resultado verificado.

**Architecture:** O servidor ganha módulos puros e testáveis (`pendencias`, `equipe`, `xp`, `holding`) que juntam o que já existe (tarefas, pedidos de terminal, propostas, chamadas, rotinas, atividade) numa visão única servida em `GET /api/holding`. As rotas de aprovar e recusar que já existem continuam sendo o único caminho de decisão; ganham uma checagem de papel e um registro de "quem decidiu". O cliente ganha um painel novo, com modelo puro testado, estilizado com tokens néon.

**Tech Stack:** Node 22 (`.mjs`), vitest, TypeScript + Vite + DOM (`client/src/ui/dom.ts`, helper `h`), sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-21-painel-holding-design.md`. Protótipo visual: `.superpowers/brainstorm/20-1792555236/content/painel-holding-v2.html`.

## Global Constraints

- Português em textos de interface, comentários e mensagens de commit. Comentários só onde o porquê não é óbvio, no estilo dos arquivos vizinhos.
- Mensagens de commit terminam com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Trabalhar na branch `feature/painel-holding`; nunca em `main`.
- Itens que não estão na tabela de classificação são NÃO seguros e só o dono aprova.
- O agente que pede nunca declara a própria classificação; ela vem de `classify()` no servidor.
- Aprovar continua exigindo `pageOrigin(req)`. Decisão do dono: a janela do Windows (`confirmHuman`) fica só para o que é perigoso e sai do resto. Exigem a janela: tarefa de código nas etapas `implement` e `test`, pedido de terminal, criar ou excluir agente. Dispensam a janela: aprovar o plano (`plan`) de uma tarefa, chamadas entre agentes e o lote seguro. A decisão sai de `classify()` (campo `needsDialog`), nunca do que o cliente envia. `human()` (`server/bridge.mjs:365`) recebe o `pid` do item e só abre a janela quando `needsDialog` é verdadeiro. Quem chega pela rede, com token de pessoa, continua dispensando a janela como o modo celular já faz, mas só em itens que não são `ownerOnly`.
- XP só por evento verificado, uma vez por chave de evento. XP principal: 30 por "Ficou bom", clicado pelo dono. Rotina concluída sem erro: 5, sem clique. "Teste passou" fica fora.
- Estado do agente nunca só por cor: forma própria (trabalhando = quadrado lima, esperando = losango amarelo, shell = círculo turquesa, parado = quadrado lilás, erro = triângulo rosa).
- Tokens néon: Noite `#1a0f2e`, Roxo `#2a1452`, Profundo `#0d0620`, Rosa `#ff4fa3`, Turquesa `#3ad3d0`, Amarelo `#ffd23f`, Lima `#7cff6b`, Branco `#ffffff`, Lilás `#a99cc9`. Borda branca de 3px, sombra em degrau `0 4px 0` escura, sem blur. Títulos em Pixelify Sans, corpo em system-ui.
- Todo texto vindo de agente ou de dados entra no DOM só por `textContent`/`h()`; nunca `innerHTML`.
- "Hoje" usa o fuso `America/Sao_Paulo`.
- `npm run check` precisa passar ao fim de cada tarefa que mexe em código.

## Review Focus

1. Pessoa da equipe faz POST direto de aprovação num item só do dono: 403 e o item continua pendente.
2. Duas pessoas decidem o mesmo item: a segunda recebe 409 "já decidido por <nome>" e nada roda duas vezes.
3. "Aprovar os seguros" sem nenhum item seguro: 200 com lista vazia e nenhum item aprovado. Item que exige a janela do Windows nunca entra no lote.
4. Ids enviados pelo cliente no lote são ignorados; o servidor recalcula o conjunto seguro.
5. XP: "Ficou bom" repetido, histórico de rotina relido, tarefa com erro, ou clique da equipe não alteram o XP.

---

### Task 1: Classificação e lista de pendências

**Files:**
- Create: `server/core/pendencias.mjs`
- Test: `server/core/pendencias.test.ts` (mesmo padrão de `server/core/auditoria.test.ts`, com `// @ts-expect-error módulo .mjs sem tipos` nos imports)
- Modify: `.gitignore` (acrescentar `.superpowers/`)

**Interfaces:**
- Produces: `classify(kind: string, stage?: string) => { cost: boolean, reversible: boolean, sendsMessage: boolean, ownerOnly: boolean, needsDialog: boolean, safe: boolean }`. `needsDialog` é `true` para tarefa `implement`/`test`, terminal, proposta e tipo desconhecido; `false` para tarefa `plan` e chamada.
- Produces: `buildPending(src: { tasks: any[], cliRequests: any[], proposals: any[], calls: any[] }, now?: number) => Pending[]`, onde `Pending = { id: string, kind: 'tarefa'|'terminal'|'proposta'|'chamada', ref: string, stage?: string, agent: string, title: string, text: string, since: number, urgent: boolean } & ReturnType<typeof classify>`. `id` é `<kind>:<ref>`. Ordem: urgentes primeiro, depois o mais antigo primeiro. `urgent` = espera acima de 4 horas.
- Produces: `rememberDecision(pid: string, nome: string, now?: number) => void` e `decisionOf(pid: string) => { nome: string, at: number } | undefined` (Map em memória, no máximo 200 entradas).

- [ ] **Step 1: Criar a branch e preparar o repositório**

```bash
git checkout -b feature/painel-holding
```
Acrescentar `.superpowers/` ao `.gitignore`, e commitar `docs/superpowers/` e `DESIGN-SYSTEM.md` com `git add .gitignore docs DESIGN-SYSTEM.md`.

- [ ] **Step 2: Escrever os testes que falham**

Nomes e asserções:
- `classify('tarefa','plan')` → `{ safe: true, ownerOnly: false, cost: false, reversible: true, sendsMessage: false }`.
- `classify('tarefa','implement')` e `('tarefa','test')` → `safe: false, ownerOnly: true` (rodam código).
- `classify('terminal')` → `sendsMessage: true, ownerOnly: true, safe: false`.
- `classify('proposta')` → `ownerOnly: true, safe: false`.
- `classify('chamada')` → `cost: true, ownerOnly: false, safe: false`.
- `classify('qualquer-outra-coisa')` → `safe: false, ownerOnly: true, needsDialog: true`.
- `needsDialog`: `false` para `('tarefa','plan')` e `('chamada')`; `true` para `('tarefa','implement')`, `('tarefa','test')`, `('terminal')`, `('proposta')`.
- Invariante: todo item com `safe: true` tem `needsDialog: false`.
- `buildPending` com uma tarefa dev `{ state: 'waiting', dev: { awaiting: true, stage: 'plan' } }`, um pedido de terminal `state: 'pending'`, uma proposta `state: 'pending'` e uma chamada `state: 'pending'` devolve 4 itens; tarefa `running` e pedido `done` não entram.
- Ordenação: item com 5 h de espera vem antes de item com 40 min; `urgent` é `true` só no de 5 h.
- `rememberDecision('tarefa:t1','Ana')` → `decisionOf('tarefa:t1')?.nome === 'Ana'`; depois de 201 inserções a mais antiga some.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run server/core/pendencias.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 4: Implementar `server/core/pendencias.mjs`**

Tabela `RISCO` por tipo/etapa como acima. Campos de origem: tarefa dev esperando = `t.state === 'waiting' && t.dev?.awaiting`, etapa em `t.dev.stage`, desde `t.updatedAt ?? t.addedAt`; terminal = `r.state === 'pending'` com `r.agentName`, `r.text`; proposta = `r.state === 'pending'` (`r.delete` indica exclusão, título "Excluir agente X", senão "Criar agente <r.agent.name>"); chamada = `c.state === 'pending'` (`c.fromName` → `c.toName`, `c.text`). Para o instante de criação use o campo de data que cada registro já tem (`createdAt`/`at`/`addedAt`); confira nos arquivos `data/cli-requests.json`, `data/agent-proposals.json`, `data/agent-calls.json` e caia em `now` se faltar. Trunque `title` em 80 e `text` em 300 caracteres.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run server/core/pendencias.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/core/pendencias.mjs server/core/pendencias.test.ts
git commit -m "Adiciona a classificação de risco e a lista unificada de pendências"
```

---

### Task 2: Identidade por pessoa

**Files:**
- Create: `server/core/equipe.mjs`, `scripts/equipe.mjs`
- Modify: `server/core/acesso.mjs` (função `phoneGate`, linhas ~71-84), `server/bridge.mjs` (onde `phoneGate` é chamado, ~linha 1020, e onde `role` é calculado, ~linha 484)
- Test: `server/core/equipe.test.ts`; estender `server/core/acesso-celular.test.ts`

**Interfaces:**
- Produces: `loadTeam(dataDir: string) => { pessoas: { nome: string, papel: 'dono'|'equipe', hash: string }[] }` lendo `data/equipe.json` (arquivo ausente = lista vazia).
- Produces: `addPerson(dataDir: string, nome: string, papel: 'dono'|'equipe') => { token: string }`. O token tem 64 hex, é mostrado uma vez; o arquivo guarda só o `sha256` dele. Nome repetido (sem diferenciar maiúsculas) ou fora de `/^[\p{L}\p{N} ._-]{1,40}$/u` devolve erro.
- Produces: `personByToken(team, token: string) => { nome: string, papel: 'dono'|'equipe' } | null` (comparação em tempo constante, como `same()` em `acesso.mjs`).
- Produces: `phoneGate(req, url, token, port, team?)` passa a aceitar também o token de uma pessoa (cabeçalho `?t=` na primeira visita, depois cookie `v2_cel_<port>`) e devolve `{ action: 'allow', person }`. O token do QR code continua valendo e vira `{ nome: 'celular', papel: 'dono' }`. Requisição local (loopback com o token da página) é `{ nome: 'dono', papel: 'dono' }`.
- Produces: no `bridge.mjs`, `req.pessoa` preenchido para toda requisição autenticada; `auditRecord` passa a receber `nome: req.pessoa.nome`.

- [ ] **Step 1: Escrever os testes que falham**

- `addPerson` grava `data/equipe.json` sem o token em claro (o arquivo não contém a string do token) e devolve token de 64 hex.
- `personByToken` acerta o token certo, devolve `null` para token errado e para vazio.
- Nome repetido (`Ana` e `ana`) é recusado; nome com `<script>` é recusado.
- `phoneGate` com token de pessoa válido (cookie) → `allow` com `person.papel === 'equipe'`; token desconhecido → `deny` 403; o token do QR code continua `allow` como `dono`.
- Escrita que não seja aprovar/recusar continua `deny` 403 para pessoa da equipe (as regras de `PHONE_WRITES` e `V2_CELULAR_ESCRITA` não mudam).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/core/equipe.test.ts server/core/acesso-celular.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `equipe.mjs` e estender `phoneGate`**

Gravação atômica igual a `loadAccess` (arquivo temporário + `renameSync`, modo `0o600`). `phoneGate` ganha o parâmetro opcional `team` sem mudar o resultado para quem já o chama sem ele.

- [ ] **Step 4: `scripts/equipe.mjs`**

Comandos `node scripts/equipe.mjs add <nome> [equipe|dono]` (imprime o token uma vez e a URL `http://<V2_LAN_HOST>:<porta>/?t=<token>`) e `node scripts/equipe.mjs list` (nomes e papéis, nunca tokens). Usa `config.data` de `server/core/config.mjs`.

- [ ] **Step 5: Ligar no `bridge.mjs`**

Carregar a equipe na subida e recarregar quando `data/equipe.json` mudar (leitura a cada requisição de rede é aceitável; o arquivo é pequeno). Preencher `req.pessoa`. Passar `nome` na auditoria (linha ~487).

- [ ] **Step 6: Rodar tudo e commitar**

Run: `npm run check`
Expected: tudo passa.

```bash
git add server scripts
git commit -m "Adiciona identidade por pessoa para a equipe e o nome nas linhas de auditoria"
```

---

### Task 3: Visão do painel, decisão por papel e lote seguro

**Files:**
- Create: `server/core/holding.mjs`
- Modify: `server/bridge.mjs` (rotas de aprovar/recusar: tarefas ~736, terminal ~825, propostas ~880, chamadas ~912; novas rotas), `server/core/auditoria.mjs` (regex `AUDITED`), `server/core/acesso.mjs` (`PHONE_WRITES`)
- Test: `server/core/holding.test.ts`, `server/core/decisao-por-papel.test.ts`; estender `server/core/auditoria.test.ts`

**Interfaces:**
- Consumes: `buildPending`, `classify`, `rememberDecision`, `decisionOf` (Task 1); `req.pessoa` (Task 2); `listRoutines()` (cada rotina traz `history[]` com `{ ok, finishedAt }`, `paused`, `whenLabel`), `recentActivity(n)` de `activity.mjs`, `confirmHuman(text)` de `acesso.mjs`.
- Produces: `buildHolding(deps, now?) => HoldingView`, com `HoldingView = { pendencias: Pending[], avaliar: { task: string, agent: string, title: string, doneAt: number }[], rotinas: { rodaram: number, falharam: number, previstas: number, lista: { id: string, title: string, agent: string, whenLabel: string, estado: 'ok'|'falhou'|'aguarda'|'pausada', ultima?: number }[] }, elenco: { agent: string, nome: string, xp: number, nivel: number, progresso: number }[], xpHoje: number, ticker: { at: number, text: string }[] }`. `deps` injeta tarefas, listas de pendências, rotinas, atividade e XP para o teste. "Hoje" = dia em `America/Sao_Paulo`. `previstas` = rotinas ativas cujo horário de hoje ainda não passou, calculado com `lastSlot`/`isDue` de `when.mjs`. `avaliar` = tarefas `done` sem `error` nas últimas 24 h sem evento `bom:<id>` em XP.
- Produces: `GET /api/holding` → `HoldingView`. `POST /api/pendencias/aprovar-seguros` → `{ aprovados: string[] }`.
- Produces: helper do bridge `gatePending(req, res, pid): boolean` usado nas quatro rotas de decisão: responde 403 `só o dono pode decidir isto` se `req.pessoa.papel === 'equipe'` e `ownerOnly`; responde 409 `já decidido por <nome>` se `decisionOf(pid)` existe e o item não está mais pendente. Após decisão com sucesso, `rememberDecision(pid, req.pessoa.nome)`.

- [ ] **Step 1: Escrever os testes que falham**

Em `holding.test.ts`: dia em fuso de São Paulo (instante `2026-10-22T02:30:00Z` ainda é 21/10 no Brasil); `falharam` conta rotina cuja última execução do dia foi `ok: false`; rotina pausada não entra em `previstas`; sem nada pendente `pendencias` é `[]`; `avaliar` não lista tarefa com erro nem já avaliada.

Em `decisao-por-papel.test.ts`, contra funções exportadas de `holding.mjs` (`podeDecidir(pessoa, pending)` e `lotesSeguros(pendencias)`):
- `podeDecidir({papel:'equipe'}, {ownerOnly:true})` → `false`; `({papel:'dono'}, qualquer)` → `true`.
- `lotesSeguros` devolve só itens com `safe: true`; recebe a lista calculada no servidor, nunca ids do cliente.

Em `auditoria.test.ts`: `shouldAudit('POST','/api/cli/requests/r1/approve')`, `/api/agent-calls/c1/approve` e `/api/pendencias/aprovar-seguros` são auditados; `/reject` desses continuam não auditados.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/core/holding.test.ts server/core/decisao-por-papel.test.ts server/core/auditoria.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `holding.mjs` e ligar as rotas**

`gatePending` entra logo depois de `pageOrigin` nas quatro rotas, usando o `pid` `tarefa:<id>`, `terminal:<id>`, `proposta:<id>`, `chamada:<id>`. Para a rota de lote: calcular `buildPending` com o estado atual, filtrar `safe`, se vazio responder `200 { aprovados: [] }` sem abrir janela; senão aprovar item a item, sem janela (só entram itens com `needsDialog` falso) chamando `approve(id)` de `tasks.mjs`, conferindo antes de cada um que continua pendente. Acrescentar a nova rota em `PHONE_WRITES` e `AUDITED`, e `/api/holding` fica só leitura.

- [ ] **Step 4: Rodar tudo**

Run: `npm run check`
Expected: tudo passa.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "Adiciona a visão do painel, a decisão por papel e a aprovação em lote dos itens seguros"
```

---

### Task 4: XP e nível

**Files:**
- Create: `server/core/xp.mjs`
- Modify: `server/core/routines.mjs` (`recordHistory`, linha 31), `server/bridge.mjs` (rotas `GET /api/xp` e `POST /api/xp/ficou-bom`), `server/core/holding.mjs` (preencher `elenco`, `xpHoje`, `avaliar`)
- Test: `server/core/xp.test.ts`

**Interfaces:**
- Produces: `award(key: string, agent: string, pontos: number, now?: number) => { ok: true, duplicado: boolean }`; grava em `data/xp.json` com `{ agentes: Record<string, number>, eventos: Record<string, { agent: string, pontos: number, at: number }> }`.
- Produces: `levelOf(xp: number) => { nivel: number, progresso: number }`, com `nivel = floor(sqrt(xp / 50)) + 1` e `progresso` de 0 a 1 dentro do nível (curva escolhida pelo autor do plano; ajustável).
- Produces: `xpOf(agent: string) => number`, `xpHoje(now?: number) => number` (soma dos eventos do dia em São Paulo).
- Produces: `POST /api/xp/ficou-bom` com corpo `{ task: string }`, só papel `dono`; exige tarefa `done`, sem `error`, com agente existente.

- [ ] **Step 1: Escrever os testes que falham**

- `award('bom:t1','ana',30)` soma 30; repetir a mesma chave devolve `duplicado: true` e o total não muda.
- `levelOf(0)` → nível 1; `levelOf(50)` → nível 2; `levelOf(200)` → nível 3; `progresso` fica entre 0 e 1.
- `recordHistory` chamado duas vezes com a mesma tarefa de rotina concluída sem erro dá 5 XP uma vez só (chave `rotina:<task>`); tarefa de rotina com erro dá 0.
- Rota `ficou-bom`: papel `equipe` → 403 e XP inalterado; tarefa com erro → 409; tarefa inexistente → 404; segunda chamada para a mesma tarefa → 200 sem somar de novo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run server/core/xp.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `xp.mjs` e os ganchos**

Gravação com `writeJson` de `store.mjs`. Em `recordHistory`, depois de montar as linhas, chamar `award` para cada execução com `ok` (o `appendFileSync` já impede repetir a linha; a chave única é a segunda proteção). `xp.mjs` não importa `routines.mjs`, para evitar ciclo.

- [ ] **Step 4: Rodar tudo e commitar**

Run: `npm run check`
Expected: tudo passa.

```bash
git add server
git commit -m "Adiciona XP e nível por resultado verificado"
```

---

### Task 5: Modelo do painel no cliente

**Files:**
- Create: `client/src/ui/holding-model.ts`
- Modify: `shared/types.ts` (acrescentar `HoldingView` e `PendingItem` espelhando os formatos das Tasks 1 e 3)
- Test: `client/src/ui/holding-model.test.ts`

**Interfaces:**
- Consumes: `HoldingView`, `PendingItem` de `shared/types.ts`.
- Produces: `ageLabel(since: number, now: number) => string` ("40 min", "5 h", "2 d"); `tagsOf(p: PendingItem) => { text: string, tone: 'risco'|'neutra'|'aviso' }[]` ("sem custo"/"custa tokens", "reversível"/"irreversível", "envia mensagem" com tom `risco`); `canDecide(p: PendingItem, papel: 'dono'|'equipe') => boolean`; `shortcutFor(index: number) => '1'|'2'|'3'|null`; `emptyKind(v: HoldingView) => 'nada-esperando'|'sem-rotinas'|null`.

- [ ] **Step 1: Escrever os testes que falham**

Asserções com valores exatos: `ageLabel(0, 40*60_000)` → `'40 min'`; `ageLabel(0, 5*3_600_000)` → `'5 h'`; `canDecide({ownerOnly:true}, 'equipe')` → `false`; `shortcutFor(0)` → `'1'`, `shortcutFor(3)` → `null`; `tagsOf` de item com `sendsMessage: true` contém a etiqueta `envia mensagem` com tom `risco`; `emptyKind` com `pendencias: []` → `'nada-esperando'`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run client/src/ui/holding-model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar e rodar**

Run: `npx vitest run client/src/ui/holding-model.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/ui/holding-model.ts client/src/ui/holding-model.test.ts shared/types.ts
git commit -m "Adiciona o modelo puro do painel da holding no cliente"
```

---

### Task 6: Painel, tokens néon e entrada na interface

**Files:**
- Create: `client/src/ui/holding.ts`, `client/src/ui/neon.css`
- Modify: `client/src/ui/index.ts` (importar o CSS, criar o painel como os outros componentes de `UiComponent`), `client/src/ui/topbar.ts` (botão e atalho `H`), `client/src/ui/context.ts` se `PanelName` precisar do nome novo
- Test: `client/src/ui/holding.test.ts` (só a parte pura de renderização que não exige navegador, no padrão de `deliveries.test.ts`)

**Interfaces:**
- Consumes: `HoldingView`, `PendingItem` e o modelo da Task 5; endpoints `GET /api/holding`, `POST /api/pendencias/aprovar-seguros`, `POST /api/xp/ficou-bom` e as rotas existentes `POST /api/ops/tasks/:id/(approve|reject)`, `/api/cli/requests/:id/...`, `/api/agent-proposals/:id/...`, `/api/agent-calls/:id/...`; `h()` de `client/src/ui/dom.ts`.
- Produces: `class HoldingPanel implements UiComponent` com `open()`, `close()` e `toggle()`. Atualiza por `GET /api/holding` a cada 5 s enquanto aberto e quando a aba volta a ficar visível. Qual papel a página tem vem de um campo `papel` que o servidor passa a incluir em `GET /api/holding` (adicionar em `buildHolding`, `'dono'` para quem usa o computador).

- [ ] **Step 1: Escrever os testes que falham**

Com `h()` e um `HoldingView` de exemplo: o primeiro filho da página é a seção "Esperando você"; um título de agente contendo `<img src=x onerror=alert(1)>` aparece como texto (nenhum elemento `img` é criado); item `ownerOnly` visto como `equipe` mostra "aguarda o dono" e nenhum botão de ação; com `pendencias: []` aparece o estado vazio "Nada espera você".

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run client/src/ui/holding.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `neon.css` e `holding.ts`**

Ordem na tela: (1) "Esperando você" com borda `#ffd23f` e botão "Aprovar os seguros" (tecla `A`, escondido se não houver item seguro); cartão com avatar, título, descrição, etiquetas e botões, com borda rosa quando `urgent`; (2) "Para você avaliar" (`avaliar`), cada um com o botão "Ficou bom" visível só para o dono; (3) faixa de quatro indicadores (rotinas de hoje `rodaram/previstas`, falhas, `xpHoje`, carteira); (4) Rotinas e Elenco lado a lado; (5) ticker. A carteira vem do `localStorage` `claubbo.wallets.v1` pelo mesmo código de `client/src/world/social/wallet.ts` (reusar a função de leitura que ele exporta; se não houver, exportar uma de leitura). Atalhos `1`, `2`, `3` ativam o botão principal do cartão de mesma posição, só com o painel aberto e o foco fora de campos de texto. Falha de rotina usa o triângulo rosa e aparece no indicador e na lista. Em tela estreita (menos de 640 px) as duas colunas viram uma.

- [ ] **Step 4: Rodar tudo**

Run: `npm run check && npm run build`
Expected: tudo passa e o build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add client shared
git commit -m "Adiciona o painel da holding com tokens néon"
```

---

### Task 7: Verificação de ponta a ponta

**Files:**
- Modify: `README.md` (seção curta "Painel da holding" e como cadastrar pessoas com `scripts/equipe.mjs`)

- [ ] **Step 1: Subir o servidor e conferir à mão**

Run: `npm run build && V2_CONFIRMACAO=nao node server/bridge.mjs` e abrir a página local.
Expected: o painel abre com `H`; "Esperando você" é a primeira seção; com a confirmação recusada, aprovar devolve a mensagem de recusa e o item continua pendente; com nada pendente aparece o estado vazio.

- [ ] **Step 2: Conferir a equipe**

Com `V2_LAN_HOST=<IP do computador>`, `node scripts/equipe.mjs add Ana equipe`, abrir a URL impressa em outro aparelho.
Expected: Ana vê o painel; itens `ownerOnly` aparecem como "aguarda o dono"; um POST direto de aprovação desses itens responde 403; `data/auditoria.jsonl` registra o campo `nome`.

- [ ] **Step 3: Rodar a suíte completa e commitar**

Run: `npm run check`
Expected: tudo passa.

```bash
git add README.md
git commit -m "Documenta o painel da holding e o cadastro da equipe"
```
