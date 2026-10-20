# Escritório v2

Escritório local de agentes de IA, só seu, com o visual e a vida dos personagens do Claubbo. Você cria agentes, dá tarefas, faz reuniões e monta as salas como quiser. Cada agente usa a conta (Claude Code ou Codex) que você escolher.

## Rodar

```
npm install
npm run build     # compila o cliente (só quando mexer em client/)
npm start         # http://127.0.0.1:4530
npm run check     # núcleo (Claude e Codex falsos) + testes do cliente
```

Precisa de Node 22+ e do `claude` (e, para Codex, do `codex`) no PATH. Os dados ficam em `data/` (agentes, salas, tarefas, reuniões, conversas) e o cérebro (notas Obsidian) em `D:\escritorio\brain` (variável `V2_BRAIN`). Na primeira vez, agentes, contas e conversas do Escritório antigo são copiados (`V2_OLD_DATA`), sem alterar o antigo.

Opcional, para uso ao vivo e mensagens pelo escritório: `npm run mod:install` (confere com `npm run mod:status`, desfaz com `npm run mod:uninstall`). Registra o marketplace `habblaud` e instala os plugins `habblaud`, `habblaud-permissoes` e `habblaud-mensagens` (Claude Code 2.1.287+, escopo user, via `claude plugin`). Os plugins vêm do Habblaud, não deste repositório: por padrão `~/habblaud-mod` (o conteúdo do `mod/` e do `.claude-plugin/` de `habblaud/` serve de origem: `--origem habblaud`), ou outra pasta com `--origem <pasta>` / `HABBLAUD_MOD_DIR` (precisa de `.claude-plugin/marketplace.json` e `mod/`). `--sem-permissoes` e `--sem-mensagens` (só no install) deixam um plugin de fora. Plugins e marketplaces já existentes são mantidos; um marketplace `habblaud` com outra origem não é trocado.

## O que tem

- **Mapa** em pixel art com salas, móveis, luz e vida social. Agentes sentam, trabalham, vão à sala da tarefa e à sala de reunião.
- **Construtor** (botão de prédio): estilo, piso, paredes e os móveis do catálogo; tipo da sala (trabalho ou reunião); modelos prontos.
- **Operações** (botão de pasta): agentes (conta, modelo, esforço, ferramentas, skills), tarefas, reuniões sem limite fixo de participantes e contas Claude/Codex.
- **Conversa** na gaveta de cada agente; `revise: ...` vira regra durável no cérebro.
- **Andar 2**: sessões do Claude Code abertas em terminais (lidas pelo Habblaud em `CLAUBBO_URL`, padrão http://127.0.0.1:4747; serviço separado, em Docker (`npm run docker:up` na pasta `habblaud/` deste repositório) ou modo Node. Se ele não estiver no ar, a lista fica vazia e `/api/cli/agents` traz o campo `servico` com o aviso). Os agentes do escritório acionam esses terminais pelo MCP `server/mcp-cli-agents.mjs`; o envio só sai depois do clique em Aprovar.

## Segurança dos agentes

Sem Bash, sem ler ou escrever arquivos, sem subagentes. Só as ferramentas liberadas em cada agente (web, Chrome, servidores MCP), e as escritas do Meta Ads ficam bloqueadas (`data/tool-rules.json` ajusta). Ações que saem da máquina passam por aprovação. O escritório nunca lê nem guarda senha ou token: o login fica na pasta de cada conta.

## Token de acesso e confirmação

Na primeira subida o servidor cria `data/acesso.json` (permissão 0600, fora dos backups) com dois tokens aleatórios por instalação. Nunca coloque o conteúdo desse arquivo em código, log, commit ou mensagem.

- **Página:** ao servir o HTML, o servidor entrega o token da página num cookie `HttpOnly; SameSite=Strict` (o nome leva a porta). Toda rota que grava (POST, PUT, DELETE) exige esse cookie, ou o cabeçalho `x-v2-token` para quem chama por script (o valor está em `data/acesso.json`, campo `pagina`). Sem ele a resposta é 403; recarregue a página para receber o cookie. Rotas GET não pedem token.
- **Agentes:** o servidor MCP `cli-agents` lê o campo `agentes` do mesmo arquivo e o manda em `x-v2-agente`. Esse token só vale para criar pedidos, propostas e chamadas, que esperam o clique do João.
- **Confirmação humana:** aprovar algo que leva a código rodando (tarefas, pedidos a terminais, propostas, sistemas, pasta de projeto, backup) abre também uma janela do Windows no computador do servidor, com "Não" como padrão e 60 s de prazo. Vale igual para aprovar tarefa pelo Telegram. Fora do Windows essas aprovações são recusadas. O servidor precisa rodar na sessão do usuário para a janela aparecer.
- **Host:** o servidor só responde a `127.0.0.1`, `localhost` e `[::1]` com a porta configurada.
- **Comandos e pastas:** o comando de subir um sistema precisa estar na lista permitida (a variável `V2_COMANDOS_PERMITIDOS` acrescenta programas) e a pasta, ser um caminho absoluto existente.
- **Auditoria:** toda rota que apaga ou sobrescreve dados (PUT, DELETE, restaurar backup, aprovar proposta ou tarefa, renomear sala, enviar arquivo) registra uma linha em `data/auditoria.jsonl` e no console: quando, quem, método, caminho e status. Sem corpo nem tokens.
- **Cabeçalhos:** toda resposta leva `Content-Security-Policy` (com `frame-ancestors 'none'`) e `X-Frame-Options: DENY`; a página não abre dentro de outra.
- A variável `V2_CONFIRMACAO=sim|nao` pula a janela e serve só para testes; nunca use em uso real.

## O que mudou em relação ao Habblaud

`shared/types.ts` (RoomInfo.build e floor), `client/src/world/sim/sim.ts` e `world/layout/custom-room.ts` (salas montadas, um andar por vez), `world/api.ts` (sem tema sazonal), `ui/` (construtor, operações, conversa, pedidos aos terminais, botão de andar) e `floor.ts`. O `server/` é novo; só `server/core/vendor/` é gerado a partir de `shared/` do Habblaud.

## Créditos e licença

Este projeto é uma obra derivada do [Habblaud](https://github.com/marmottajr/habblaud), de Márcio Junior, distribuído sob a licença MIT (© 2026 Márcio Junior). O `client/` e o `shared/` partem do código dele, modificado como descrito acima ("Claubbo" é o nome que este projeto dá ao cliente derivado). O texto da licença MIT está em [`LICENSE`](LICENSE) e os demais avisos (fonte Pixelify Sans, sob SIL OFL 1.1) em [`NOTICE.md`](NOTICE.md). Ambos acompanham o build em `dist/client/` e são citados na seção "Sobre" das configurações do app.
