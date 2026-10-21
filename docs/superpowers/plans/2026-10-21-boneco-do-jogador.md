# Boneco do jogador, interação e auras por modelo: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono e a equipe cadastrada andam pelo escritório com um boneco próprio, interagem com agentes e elevador por um menu (`E`), mudam o modelo de IA de um agente em degraus, agradecem por resultados verificados, fazem perguntas `/btw`, e veem a aura do modelo em cada agente.

**Architecture:** Servidor ganha `server/core/modelos.mjs` (escada de modelos) e três rotas por agente (`modelo`, `obrigado`, `btw`) que seguem os padrões do painel da holding (papel por pessoa, auditoria com `nome`, XP com chave única). O cliente reaproveita o visitante da cena Visita (`client/src/world/sim/visitor.ts`) dentro do `Sim` do escritório, ganha um módulo puro de aura (`client/src/world/render/aura.ts`) desenhado junto de cada agente, e um menu de interação em `client/src/ui/`.

**Tech Stack:** Node 22 (`server/core/*.mjs`, testes vitest `.test.ts` ao lado importando `.mjs` com `// @ts-expect-error módulo .mjs sem tipos`), TypeScript + Vite + canvas no cliente (`h()` de `client/src/ui/dom.ts`), tipos em `shared/types.ts`. `npm run check` = build-shared + checagens + vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-boneco-do-jogador-design.md`

## Global Constraints

- Texto de interface e mensagens de commit em português; código, docs e commits em prosa normal, nunca estilo caveman. Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Escada de modelos do Claude, do mais fraco ao mais forte: `haiku`, `sonnet`, `opus`, `fable`.
- Auras: só o `fable` tem chama de energia (dourada, miolo branco, brasas, raios, ondas no chão, corpo tremendo); `opus` tem brilho intermediário sem fogo; `haiku` e `sonnet` têm aura singela, quase imperceptível. Agente Codex segue a mesma lógica com escada própria. Fantasia JMAL (rubi, dourado, coroa) é só do dono e não é reaproveitada. Referência visual: `.superpowers/brainstorm/1475-1792584630/content/auras-chama-v3.html` (git-ignorado; o boneco nele é bloco de teste).
- Acessibilidade: modelo nunca só por cor; o nome do modelo sempre em texto no menu e na dica; `prefers-reduced-motion` desliga a animação; menu operável por teclado.
- Ações (`modelo`, `obrigado`, `btw`) liberadas para papéis `dono` e `equipe` com nome; recusadas (403) para token sem nome, token inválido e agente (`x-v2-agente`). Nunca `ownerOnly`. Todas auditadas em `data/auditoria.jsonl` com o campo `nome`.
- Subir o modelo: sem janela do Windows; o servidor compara `de` com o modelo atual e responde 409 se diferir (impede clique repetido). A confirmação da tela é só passo de interface.
- Troca de modelo revalida o agente inteiro por `server/core/agents.mjs`; se falhar, nada é gravado.
- XP só por evento verificado, com chave única em `data/xp.json`. Chave nova: `obrigado:<id do resultado>`; se já existe `bom:<id>` para o mesmo resultado, não soma.
- `/btw`: pergunta até 500 caracteres, resposta até 1500, sem ferramentas, sessão separada, uma em andamento e intervalo mínimo de 20 s por agente, estado em memória; não entra na fila nem altera `data/` de tarefas.
- Texto vindo de agente só entra na página por `textContent`/`h()`.
- Nunca usar `D:\escritorio-v2\data` real em testes; usar diretório de dados temporário, porta própria, Telegram desligado, `V2_CONFIRMACAO=nao`.
- Não copiar arte, nomes ou formatos de outro jogo.

## Review Focus

- Agente removido ou renomeado enquanto o menu dele está aberto: o menu fecha ou mostra erro, sem acionar o agente errado.
- Modelo já no topo ou na base da escada, e modelo fora da tabela (Codex com id livre): subir/descer desabilitados com o motivo; a rota responde 409/400 sem gravar.
- Clique duplo em "Puxar a orelha": só um degrau (o segundo recebe 409 por `de` desatualizado).
- Agradecer sem resultado verificado, duas vezes no mesmo resultado, e por duas pessoas: XP no máximo uma vez; os outros recebem 409 com o nome de quem agradeceu primeiro.
- `/btw` com agente trabalhando em tarefa, com pergunta vazia ou gigante, e em rajada: não toca na tarefa; vazia/gigante rejeitadas; rajada limitada por agente.
- Troca de andar com o menu aberto, andar sem elevador, e `prefers-reduced-motion`: sem travar, sem aura animada.

---

### Task 1: Escada de modelos (servidor)

**Files:**
- Create: `server/core/modelos.mjs`, `server/core/modelos.test.ts`

**Interfaces:**
- Produces:
  - `export const ESCADAS: Record<'claude'|'codex', string[]>` (Claude: `['haiku','sonnet','opus','fable']`; Codex: ids lidos do que o runner de Codex aceita, `server/core/runner.mjs` argumento `-m`, em ordem do mais fraco ao mais forte; se nenhum id estiver fixo no código, uma lista curta documentada no próprio arquivo).
  - `export function providerDe(agent): 'claude'|'codex'` (usa o mesmo critério que o runner usa hoje para escolher o runner).
  - `export function degrau(agent): { escada: string[]; indice: number; topo: boolean; base: boolean } | null` (`null` quando o modelo não está na escada).
  - `export function proximo(agent, direcao: 'subir'|'descer'): { ok: true; de: string; para: string } | { ok: false; status: 409; error: string }`.

- [ ] **Step 1: Write the failing test** em `modelos.test.ts` com estes casos exatos: `proximo({model:'haiku'},'subir')` → `{ok:true,de:'haiku',para:'sonnet'}`; `proximo({model:'fable'},'subir')` → `ok:false` status 409; `proximo({model:'haiku'},'descer')` → `ok:false` status 409; `degrau({model:'qualquer-coisa'})` → `null`; `proximo({model:'qualquer-coisa'},'subir')` → `ok:false` com `error` citando "fora da escada"; escada do Codex: um agente com o provider/modelo de Codex sobe um degrau dentro da escada do Codex e nunca para um modelo do Claude.
- [ ] **Step 2: Run** `npx vitest run server/core/modelos.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implement** as quatro exportações acima em `modelos.mjs`. Funções puras, sem I/O.
- [ ] **Step 4: Run** o mesmo comando → PASS.
- [ ] **Step 5: Commit** `git add server/core/modelos.mjs server/core/modelos.test.ts && git commit -m "Adiciona a escada de modelos dos agentes"` (mais o trailer).

---

### Task 2: Rota de troca de modelo, permissão e auditoria

**Files:**
- Modify: `server/bridge.mjs` (nova rota perto de `/api/xp/ficou-bom`, linha ~771), `server/core/acesso.mjs` (`PHONE_WRITES`, linha 69), `server/core/auditoria.mjs` (`AUDITED`, linha 10), `server/core/pendencias.mjs` (nada de `ownerOnly`; só documentar as novas ações em `RISCO` se a tabela for usada pelo painel), `README.md` (uma linha na seção da equipe)
- Test: `server/core/modelos-rota.test.ts` (testa uma função pura extraída, ver abaixo) e ajuste de `server/test/core-check.mjs` se necessário

**Interfaces:**
- Consumes: `proximo(agent, direcao)` e `degrau(agent)` (Task 1); `getAgent`, `updateAgent` de `server/core/agents.mjs`; `auditRecord` e `pageOrigin`/`req.pessoa` do `bridge.mjs` como usados na rota `aprovar-seguros`.
- Produces: `POST /api/agentes/:id/modelo` com corpo `{ direcao: 'subir'|'descer', de: string }`. Respostas: 200 `{ ok:true, de, para, agent }`; 403 sem pessoa com nome ou papel fora de `dono`/`equipe` ou fora da página; 404 agente inexistente; 409 `{ error }` quando `de` não é o modelo atual, topo/base ou fora da escada; 400 se `updateAgent` rejeitar. Exportar de `modelos.mjs` a função `trocarModelo({ pessoa, id, direcao, de, getAgent, updateAgent })` que contém toda a lógica e devolve `{ ok, status, ...}`; a rota só chama essa função e audita.

- [ ] **Step 1: Write the failing test** de `trocarModelo` com `getAgent`/`updateAgent` falsos: papel `dono` e `equipe` com nome sobem de `sonnet` para `opus`; pessoa sem `nome` → 403; papel `agente` → 403; `de:'haiku'` quando o modelo atual é `sonnet` → 409 e `updateAgent` não é chamado; `updateAgent` devolvendo `{ok:false, status:400, errors:['effort: ...']}` → resposta 400 e nada gravado; agente inexistente → 404; duas chamadas seguidas com o mesmo `de` → a segunda 409 (o fake atualiza o modelo na primeira).
- [ ] **Step 2: Run** `npx vitest run server/core/modelos-rota.test.ts` → FAIL.
- [ ] **Step 3: Implement** `trocarModelo` em `modelos.mjs` (síncrona de ponta a ponta, sem await entre conferir `de` e gravar) e a rota em `bridge.mjs`: confere `pageOrigin(req)` como as outras rotas de página; chama `trocarModelo`; em sucesso, `auditRecord(config.data, { who: fromNetwork(req) ? 'celular' : 'pagina', nome: req.pessoa.nome, method: 'POST', path: '/api/agentes/<id>/modelo#<de>-><para>', status: 200 })` e `pollSoon()`.
- [ ] **Step 4: Permissão da equipe na rede.** Em `PHONE_WRITES` acrescentar a alternativa `^/api/agentes/[^/]+/(?:modelo|obrigado|btw)$`; em `AUDITED` acrescentar `agentes/[^/]+/(modelo|obrigado|btw)$`. Em `phoneGate` a verificação da linha 88 (`person.papel !== 'dono'` nega fora de aprovar) continua valendo para outras rotas; as três rotas novas entram pelo caminho `soAprovar`, então a equipe cadastrada passa. Teste em `server/core/acesso.test.ts` (ou o arquivo de teste existente de `phoneGate`): `POST /api/agentes/x/modelo` com cookie de pessoa `equipe` → `allow`; com token inválido → `deny` 403; `PUT /api/agentes/x` com cookie de `equipe` → continua `deny`.
- [ ] **Step 5: Run** `npx vitest run server/core` → PASS.
- [ ] **Step 6: Commit** `git commit -m "Adiciona a troca de modelo do agente em degraus"`.

---

### Task 3: Agradecer por resultado verificado

**Files:**
- Modify: `server/core/xp.mjs`, `server/bridge.mjs`
- Test: `server/core/xp.test.ts` (acrescentar casos)

**Interfaces:**
- Consumes: `award(key, agent, pontos)`, `avaliada(taskId)`, `XP_ROTINA` e o histórico de rotinas já usado em `server/core/routines-xp.test.ts` / hook de rotina.
- Produces:
  - `export const XP_OBRIGADO = 10`.
  - `export function resultadoPendente(agentId, { tasks, rotinas }): { id: string; tipo: 'tarefa'|'rotina' } | null`: o resultado verificado mais recente do agente (tarefa `state:'done'` sem `error`, ou execução de rotina concluída sem erro) que não tem `bom:<id>` nem `obrigado:<id>` em `data/xp.json`.
  - `export function agradecer({ pessoa, agentId, tasks, rotinas, getAgent }): { ok:true, status:200, agent, xp, id } | { ok:false, status:403|404|409, error }`. 403 se a pessoa não tem nome ou o papel não é `dono`/`equipe`; 404 agente inexistente; 409 `"sem resultado novo para agradecer"` quando `resultadoPendente` é `null`; 409 `"já agradecido por <nome>"` quando outro já levou. Concede `award('obrigado:<id>', agentId, XP_OBRIGADO)`. Guardar quem agradeceu primeiro no evento (campo `por`) para a mensagem do 409.
  - `POST /api/agentes/:id/obrigado` (sem corpo útil; o resultado é escolhido no servidor, nunca vindo da página). Também expor `obrigadoPossivel: boolean` por agente no que o cliente já lê (`/api/xp` ou `/api/holding`) para a página habilitar o botão.

- [ ] **Step 1: Write the failing test**: sem tarefa concluída → 409; tarefa `done` sem erro → 200 e o XP do agente sobe `XP_OBRIGADO`; segunda chamada → 409 "sem resultado novo"; tarefa que já tem `bom:<id>` → 409 e XP não muda; tarefa `done` com `error` não conta; pessoa `equipe` com nome conta e a chave guarda o nome; segunda pessoa depois da primeira para o mesmo resultado → 409 citando o nome da primeira; agente `x-v2-agente`/pessoa sem nome → 403; agente inexistente → 404.
- [ ] **Step 2: Run** `npx vitest run server/core/xp.test.ts` → FAIL.
- [ ] **Step 3: Implement** `resultadoPendente`/`agradecer` em `xp.mjs` (síncronos de ponta a ponta, `award` já é síncrono) e a rota em `bridge.mjs` com `pageOrigin`, auditoria como na Task 2.
- [ ] **Step 4: Run** `npx vitest run server/core/xp.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Adiciona o agradecimento por resultado verificado"`.

---

### Task 4: Pergunta avulsa `/btw`

**Files:**
- Create: `server/core/btw.mjs`, `server/core/btw.test.ts`
- Modify: `server/bridge.mjs`

**Interfaces:**
- Consumes: `runTurn({ agent, system, prompt, signal, timeoutMs })` de `server/core/runner.mjs:128` (sem `dev`, sem ferramentas: passar um agente com `tools: []` e `skills: []`); prompt de sistema do agente via o helper que as reuniões usam (`systemFor`, em `server/core/meetings.mjs`) ou equivalente existente.
- Produces: `export function criarBtw({ runTurn, getAgent, agora })` devolvendo `async function btw({ pessoa, agentId, pergunta }): { ok:true, status:200, resposta } | { ok:false, status:400|403|404|409|429, error }`. Regras: 403 sem pessoa com nome/papel válido; 404 agente inexistente; 400 pergunta vazia ou com mais de 500 caracteres; 409 se já há um `/btw` em andamento naquele agente; 429 se faz menos de 20 s do último naquele agente; a resposta é cortada em 1500 caracteres; o agente passado ao `runTurn` é uma cópia com `tools: []`, `skills: []`, sem `dev`, e uma sessão nova (sem `sessionId` do agente); estado do intervalo em `Map` na memória. `POST /api/agentes/:id/btw` com corpo `{ pergunta }`, auditoria com o caminho sem o texto da pergunta.

- [ ] **Step 1: Write the failing test** com `runTurn` falso: pergunta válida → 200 e `runTurn` recebe `tools: []` e `skills: []`; vazia e de 501 caracteres → 400 sem chamar `runTurn`; segunda chamada antes de 20 s (relógio injetado) → 429; chamada enquanto a primeira não terminou (promessa pendente) → 409; resposta de 3000 caracteres volta com 1500; agente trabalhando (o fake de `getAgent` marca tarefa em curso) não é tocado: o teste confere que nenhuma função de tarefa é chamada (`btw` não importa o módulo de tarefas); `runTurn` rejeitando → `{ok:false,status:502}` sem travar o estado "em andamento" (a próxima chamada, depois dos 20 s, funciona).
- [ ] **Step 2: Run** `npx vitest run server/core/btw.test.ts` → FAIL.
- [ ] **Step 3: Implement** `btw.mjs` e a rota (papel `dono`/`equipe` com nome, `pageOrigin`, `PHONE_WRITES` e `AUDITED` já cobertos na Task 2).
- [ ] **Step 4: Run** `npx vitest run server/core/btw.test.ts` → PASS; depois `npm run check` → exit 0.
- [ ] **Step 5: Commit** `git commit -m "Adiciona a pergunta avulsa /btw ao agente"`.

---

### Task 5: Aura por modelo (cliente, módulo puro e desenho)

**Files:**
- Create: `client/src/world/render/aura.ts`, `client/src/world/render/aura.test.ts`
- Modify: `client/src/world/render/renderer.ts` (desenhar a aura junto da cabeça/pés de cada agente; `heads` em `renderer.ts:84`), `shared/types.ts` (só se `AgentInfo.model` não chegar ao cliente; ele já existe como `model?: string` na linha 168), `client/src/art/api.ts` se for preciso passar dados ao desenho

**Interfaces:**
- Consumes: `AgentInfo.model` e `AgentInfo.provider`.
- Produces:
  - `export type AuraNivel = 'singela' | 'intermediaria' | 'chama'`.
  - `export interface AuraSpec { nivel: AuraNivel; cor: string; camadas: number; brasas: number; raios: number; ondas: number; treme: boolean; rotulo: string }`.
  - `export function auraDe(model: string|undefined, provider?: string): AuraSpec | null` (`null` para modelo vazio ou desconhecido sem degrau: sem aura). Mapeamento exato: `haiku` e `sonnet` → `singela` (cores turquesa `#3ad3d0` e lima `#7cff6b`, `camadas:1`, `brasas:0`, `raios:0`, `ondas:0`); `opus` → `intermediaria` (rosa `#ff4fa3`, `camadas:2`, brilho maior, sem brasas/raios/ondas, `treme:false`); `fable` → `chama` (dourado `#ffd23f`, `camadas:4`, `brasas:18`, `raios:5`, `ondas:2`, `treme:true`). `rotulo` é o nome do modelo em texto. Codex: a mesma regra pela posição do modelo na escada de `ESCADAS.codex` (os dois degraus de cima = `intermediaria` e `chama`).
  - `export function desenharAura(ctx: CanvasRenderingContext2D, spec: AuraSpec, x: number, feetY: number, now: number, opts: { reduzirMovimento: boolean; escala: number }): void`: com `reduzirMovimento` desenha a mesma forma parada (sem brasas em movimento, sem raios, sem tremor).

- [ ] **Step 1: Write the failing test** de `auraDe`: os quatro modelos do Claude produzem exatamente os níveis acima; `auraDe(undefined)` e `auraDe('xyz')` → `null`; `fable` tem `treme:true` e os outros `false`; só `fable` tem `raios > 0`; `rotulo` igual ao modelo; o `fable` difere dos demais em pelo menos camadas, brasas e raios (acessibilidade: forma, não só cor); `desenharAura` com `reduzirMovimento:true` chamado com um `ctx` falso não desenha raios nem brasas (contar chamadas de `stroke`/`fillRect` de raio).
- [ ] **Step 2: Run** `npx vitest run client/src/world/render/aura.test.ts` → FAIL.
- [ ] **Step 3: Implement** `aura.ts`. Desenho em canvas 2D: chama como silhueta recortada em camadas com gradiente do chão à ponta, balançando em escala e inclinação com `now`; brasas como quadradinhos subindo; raios como polilinhas piscando; ondas como elipses crescentes no chão; brilho singela/intermediária como elipse suave no chão e halo leve. Tudo derivado de `now` e de uma semente estável por agente (`ch.info.seed`), sem estado por frame.
- [ ] **Step 4: Integrar** em `renderer.ts`: para cada personagem visível que seja agente (não o visitante), `desenharAura` antes do sprite; `reduzirMovimento` vem de `matchMedia('(prefers-reduced-motion: reduce)')` lido uma vez e atualizado no evento `change`. Não desenhar para agentes fora da tela (usar o mesmo teste de visibilidade de `heads`).
- [ ] **Step 5: Run** `npx vitest run client/src/world/render` → PASS e `npm run build` → exit 0.
- [ ] **Step 6: Commit** `git commit -m "Adiciona a aura por modelo nos agentes"`.

---

### Task 6: Boneco do jogador no escritório (cliente)

**Files:**
- Modify: `client/src/world/sim/sim.ts` (permitir o jogador local fora do modo visita), `client/src/world/index.ts` (API do jogador e câmera), `client/src/world/api.ts` (tipo `PlayerWorld`), `client/src/world/city/input.ts` se o teclado puder ser reaproveitado
- Create: `client/src/world/player.ts`, `client/src/world/player.test.ts`

**Interfaces:**
- Consumes: `visitor.ts` (`stepFree`, `canStand`, `NO_INTENT`, `EXIT_RADIUS`, `VISITOR_ID`, `visitorInfo`), `Sim.setVisitor`/`visitorIntent`/`runVisitor`, `camera.follow`.
- Produces:
  - `export interface Alvo { tipo: 'agente'|'elevador'; id: string; distancia: number }`.
  - `export function alvoMaisPerto(pos: {x:number;y:number}, dir: Dir, candidatos: {tipo:'agente'|'elevador'; id:string; x:number; y:number}[], raioTiles = 1.5): Alvo | null` (puro; devolve o mais perto dentro do raio, só entre os que estão na frente do boneco quando `dir` aponta para eles, ou o mais perto se estiver a menos de 0,6 tile; sem candidato no raio → `null`).
  - No objeto do mundo (`index.ts`): `player: { ligar(me:{name:string;look:'f'|'m';parts?}): void; desligar(): void; setIntent(i: VisitorIntent): void; alvo(): Alvo | null; alvoNaTela(): {x:number;y:number}|null; irParaAndar(andar:number): boolean }`. Só existe fora de `visitMode`. O boneco nasce no elevador do andar 1 e não guarda posição entre sessões. A simulação de cada andar segue como hoje; trocar de andar só troca qual é desenhada (`setFloor`) e o boneco aparece no elevador do andar de destino.
  - Teclado (setas e WASD, Shift corre) lido na página do escritório, ignorado enquanto um campo de texto ou o menu estiver focado, e ignorado no timelapse.

- [ ] **Step 1: Write the failing test** de `alvoMaisPerto`: um agente a 1 tile e outro a 3 → devolve o primeiro; nenhum no raio → `null`; empate de distância → o de menor `id` (determinístico); elevador a 1,4 tile e agente a 1,0 → agente; agente atrás do boneco a 1,2 tile (fora da frente) e a mais de 0,6 → `null`.
- [ ] **Step 2: Run** `npx vitest run client/src/world/player.test.ts` → FAIL.
- [ ] **Step 3: Implement** `player.ts` e a integração em `sim.ts`/`index.ts`, reaproveitando `runVisitor` e a colisão do visitante; a câmera segue o boneco quando ele anda (como `followVisitor`). O boneco usa a aparência já existente do dono (a mesma fonte que a cena Visita usa para `me`); nada de arte nova.
- [ ] **Step 4: Run** `npx vitest run client/src/world` → PASS; `npm run build` → exit 0.
- [ ] **Step 5: Commit** `git commit -m "Leva o boneco do jogador para dentro do escritório"`.

---

### Task 7: Menu de interação, ações e elevador (cliente)

**Files:**
- Create: `client/src/ui/interacao-model.ts`, `client/src/ui/interacao-model.test.ts`, `client/src/ui/interacao.ts`
- Modify: `client/src/main.ts` (ou o arquivo que monta a página; seguir como `holding.ts` foi plugado e como a tecla `H` abre o painel), `client/src/net/` (funções de chamada às rotas das Tasks 2–4), `client/src/ui/neon.css`

**Interfaces:**
- Consumes: `world.player.alvo()`, `alvoNaTela()`, `irParaAndar()`; as rotas `POST /api/agentes/:id/modelo`, `/obrigado`, `/btw`; o painel de terminal/gaveta do agente existente em `client/src/ui/drawer.ts` (a seleção de agente já abre a gaveta, ver `setSelection` em `world/index.ts:214`); `/api/xp` para `obrigadoPossivel`; `AgentInfo` para `model`, `status`.
- Produces (puro, em `interacao-model.ts`):
  - `export type Acao = 'conversar'|'desafiar'|'btw'|'agradecer'|'subir'|'descer'`.
  - `export interface ItemMenu { acao: Acao; rotulo: string; atalho: string; habilitado: boolean; motivo?: string }`.
  - `export function menuDoAgente(a: { model?: string; provider?: string; status: string; ocioso: boolean; obrigadoPossivel: boolean }): ItemMenu[]` na ordem do spec (1 conversar, 2 desafiar, 3 btw, 4 agradecer, 5 puxar a orelha, 6 baixar o modelo). `desafiar` só habilitado se `ocioso`, com `motivo` "só agente ocioso" caso contrário; `agradecer` só se `obrigadoPossivel`, motivo "sem resultado novo"; `subir`/`descer` com rótulo mostrando o modelo de origem e destino em texto ("opus → fable"), desabilitados no topo/base/fora da escada com o motivo.
  - `export function menuDoElevador(andares: {andar:number; nome:string; temElevador:boolean}[], atual:number): ItemMenu[]` (só andares com elevador; mensagem quando não há nenhum).
- Comportamento (em `interacao.ts`): `E` com alvo abre o menu; teclas 1–6 e setas/Enter escolhem; `Esc` fecha. Dica "E · Conversar com <nome>" ao lado do boneco usando `alvoNaTela()`. `conversar` seleciona o agente (abre a gaveta/terminal dele). `desafiar` abre um convite que diz que os jogos chegam no projeto 4. `btw` abre um campo de pergunta (500 caracteres) e mostra a resposta em balão, só com `textContent`. `agradecer` chama a rota e mostra o 409 com o nome. `subir` abre uma confirmação dentro do menu ("<de> → <para>: o custo sobe") e só então chama a rota com `{ direcao, de }`; em 409 mostra "já mudou" e recarrega o estado. `descer` não pede confirmação. O menu fecha se o agente some do snapshot.

- [ ] **Step 1: Write the failing test** de `menuDoAgente`: agente `sonnet` ocioso com `obrigadoPossivel:true` → seis itens na ordem do spec, todos habilitados; agente trabalhando → `desafiar` desabilitado com motivo; `obrigadoPossivel:false` → `agradecer` desabilitado; `fable` → `subir` desabilitado "já no topo"; `haiku` → `descer` desabilitado "já na base"; modelo fora da escada → `subir` e `descer` desabilitados com motivo "modelo fora da escada"; rótulo de `subir` para `opus` contém "opus" e "fable". `menuDoElevador` sem andar com elevador → lista vazia mais mensagem; andar atual marcado.
- [ ] **Step 2: Run** `npx vitest run client/src/ui/interacao-model.test.ts` → FAIL.
- [ ] **Step 3: Implement** `interacao-model.ts` e depois `interacao.ts` + estilos em `neon.css` com os tokens néon existentes (borda branca de 3px, sombra em degrau, sem blur). Plugar na página como o painel da holding; o `E` não faz nada sem alvo e é ignorado com campo de texto focado.
- [ ] **Step 4: Run** `npx vitest run client/src/ui` → PASS; `npm run build` → exit 0.
- [ ] **Step 5: Commit** `git commit -m "Adiciona o menu de interação do boneco"`.

---

### Task 8: Verificação de ponta a ponta e documentação

**Files:**
- Modify: `README.md` (seção curta "Boneco e auras": teclas, menu, escada de modelos, permissão da equipe)

- [ ] **Step 1: Rodar tudo.** `npm run check` → exit 0 (todos os testes) e `npm run build` → exit 0.
- [ ] **Step 2: Subir isolado.** Em diretório de dados temporário, porta própria (por exemplo 4599), `V2_CONFIRMACAO=nao`, Telegram desligado: criar dois agentes de teste (um `sonnet`, um `fable`) no diretório temporário. Conferir no navegador: o boneco anda com as setas e para na parede; a dica aparece perto de um agente; `E` abre o menu; o `fable` mostra chama, o `opus` brilho intermediário, `haiku` e `sonnet` quase nada; com `prefers-reduced-motion` emulado a aura fica parada.
- [ ] **Step 3: Rotas.** Com `curl` e os tokens do diretório temporário: subir `sonnet`→`opus` com `de:'sonnet'` → 200 e `data/agents.json` temporário mudou; repetir o mesmo corpo → 409; pessoa `equipe` criada só no diretório temporário via `node scripts/equipe.mjs add Ana equipe` (com `config.data` apontando para o temporário) sobe e desce pela origem de rede e aparece `nome` na auditoria; token inválido → 403; `agradecer` sem resultado → 409; `/btw` com pergunta de 501 caracteres → 400.
- [ ] **Step 4: Documentar** no `README.md` e commitar: `git add README.md && git commit -m "Documenta o boneco, o menu e as auras por modelo"`.
- [ ] **Step 5: Relatar** o que não foi testado em navegador (por exemplo `/btw` real com Claude e o Codex), sem afirmar o que não foi visto.
