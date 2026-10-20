# Adendo ao checklist de lançamento (2026-10-20, após o commit `a2a336a`)

Complementa `LANCAMENTO-CHECKLIST.md`, que outra sessão escreveu à 01:02 e continua sendo o dono daquele arquivo (regra 1 de `COMBINADO.md`); por isso este texto fica separado. Quando ela terminar, os itens abaixo podem ser fundidos lá. Nada foi publicado, enviado, reiniciado nem commitado.

## Reverificado nesta sessão (comandos executados)

- [x] **Árvore.** `git status --short` vazio antes de qualquer edição; depois, só o arquivo novo `server/core/runner-codex-mcp.test.ts` (e este adendo).
- [x] **`npm run check`.** Núcleo 20/20; transcript, cli-mode e retorno ok; vitest 1412 testes em 140 arquivos, todos verdes (01:03). O check não deixou diferença no Git.
- [x] **Build servido.** `curl 127.0.0.1:4530/` aponta `bundle/main-C_1IsGNU.js`; o SHA-256 dele servido e no disco (`dist/client/bundle/`) é igual (`29d23d1cafa3…`). Bate com o checklist principal, que cita o `app-*.js`.
- [x] **Tipos.** `npx tsc -p . --noEmit` sem erros.

## Item novo: Codex com a ferramenta `cli-agents`

- Estado: o `runCodex` já sobe o servidor `cli-agents` para agente Codex que tenha essa ferramenta (`server/core/runner.mjs`, linhas 219-221 no commit `a2a336a`; `AGENT_ID` com validação `SAFE_ID`). Isso estava no commit de snapshot, **sem teste**.
- Feito: `server/core/runner-codex-mcp.test.ts` (3 testes, passam): com a ferramenta, os `-c` do servidor, o `AGENT_ID` e `default_tools_approval_mode="approve"` entram e o sandbox continua `read-only`; id fora do padrão vira `agente`; sem a ferramenta, nenhum `mcp_servers` é configurado.
- Risco que continua: `approve` dispensa a pergunta do Codex para todas as ferramentas do servidor, inclusive as que criam pedidos. A trava real é o clique em Aprovar na página (e o modo automático, que a dispensa para pedidos fora de deploy, pagamento e apagar).
- Agente Codex do tipo `dev` continua recusado (`runner.mjs`: "o Codex ainda não faz esse fluxo").

## Continua pendente (não toquei)

- Reiniciar a 4530: o processo subiu às 00:47 e `server/core/vendor/*.mjs` foi regenerado às 00:58. Só mensagens geradas pelo servidor usam o texto antigo. Decisão do João (o checklist principal já registra).
- Todas as pendências marcadas **DECISÃO** em `LANCAMENTO-CHECKLIST.md` (revisão do `a2a336a`, origem do pacote, identidade, arte, Habblaud World, plugins do mod, nome, critérios de aceite).
- Entregador de mensagens e hooks do Codex: não existe script equivalente a `mod:install`. Fora do repositório, `npm run codex:install` do Habblaud existe; ele grava no `hooks.json` do Codex do usuário e exige a aprovação do usuário em `/hooks`.
- Documentação de instalação: este repositório não tem `INSTALAR.md`/`INSTALAR.bat`; eles estão no clone `D:\escritorio-clone` (fora do escopo desta árvore).

**Não está declarado "pronto para lançar".** Faltam as decisões acima, `npm audit` (precisa de rede) e a revisão humana.
