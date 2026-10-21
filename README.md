# Escritório v2

Escritório local de agentes de IA, só seu, com o visual e a vida dos personagens do Claubbo. Você cria agentes, dá tarefas, faz reuniões e monta as salas como quiser. Cada agente usa a conta (Claude Code ou Codex) que você escolher.

Instalação em máquina nova com um único prompt: veja [`INSTALAR.md`](INSTALAR.md).

Atualização de uma instalação existente com um único prompt: veja [`ATUALIZAR.md`](ATUALIZAR.md).

Ver o escritório no celular, no mesmo Wi-Fi, para ver e aprovar (`V2_LAN_HOST`): veja [`CELULAR.md`](CELULAR.md).

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
- **Auditoria:** toda rota que apaga ou sobrescreve dados (PUT, DELETE, restaurar backup, aprovar ou recusar proposta, tarefa, pedido a terminal ou chamada, decidir permissão de terminal, repetir tarefa, renomear sala, enviar arquivo) registra uma linha em `data/auditoria.jsonl` e no console: quando, quem, método, caminho e status. Sem corpo nem tokens.
- **Cabeçalhos:** toda resposta leva `Content-Security-Policy` (com `frame-ancestors 'none'`) e `X-Frame-Options: DENY`; a página não abre dentro de outra.
- A variável `V2_CONFIRMACAO=sim|nao` serve só para testes; nunca use em uso real. `sim` pula a janela. `nao` recusa toda janela, mas desde o painel da holding não bloqueia os itens que não precisam de janela (plano de tarefa de código e chamada entre agentes): esses seguem sendo aprovados.

## Painel da holding

Uma página só com o que espera decisão e o que merece avaliação. Abre pelo botão da barra superior ou pela tecla `H` (fecha com `Esc` ou `H`). De cima para baixo: "Esperando você" (tarefas, pedidos a terminais, propostas e chamadas de agentes, com o risco de cada item), "Para você avaliar", os indicadores do dia (rotinas que rodaram, falhas, XP, moedas do escritório), rotinas e elenco, e o que acabou de acontecer.

- **Atalhos:** `1`, `2` e `3` agem no cartão da mesma posição e `A` aprova todos os itens seguros de uma vez. Só item seguro (reversível, sem custo, sem envio de mensagem e sem confirmação no computador) aprova por tecla; nos demais a tecla apenas abre a revisão, e aprovar ou recusar exige clicar no botão.
- **Papéis:** o dono (quem usa o computador do servidor) decide tudo e dá o "ficou bom". A equipe vê o painel e decide só o que não é exclusivo do dono; o resto aparece como "aguarda o dono" e uma tentativa direta pela API recebe 403. Se duas pessoas decidem o mesmo item, a segunda recebe 409 com o nome de quem decidiu primeiro, e a auditoria registra o nome de cada pessoa.
- **Cadastrar pessoas:** `node scripts/equipe.mjs add <nome> [equipe|dono]` (o papel padrão é `equipe`; `list` mostra quem existe, sem tokens). O endereço com o token aparece uma única vez e `data/equipe.json` guarda só o hash. A pessoa abre o endereço no aparelho dela, na mesma rede, e o token vira cookie. Isso usa o modo celular: suba o servidor com `V2_LAN_HOST=<IP do computador no Wi-Fi>` (veja [`CELULAR.md`](CELULAR.md)) e rode o `add` com a mesma variável para o endereço sair com o IP certo. Pelo celular só se aprova e recusa; o resto é somente leitura (mesmo com `V2_CELULAR_ESCRITA=1`, só o token do QR code, que é do dono, escreve além disso).
- **Trocar o modelo:** a equipe cadastrada (e o dono) pode subir ou descer o modelo de um agente, um degrau por vez, inclusive pelo celular; cada troca fica na auditoria com o nome de quem fez.
- **Cuidado com o token da equipe:** quem tem o endereço lê pela rede tudo o que o dono lê (conversas, entregas, painel), o token não expira e vale em qualquer aparelho da rede. Para revogar: `node scripts/equipe.mjs remove <nome>` (tira só essa pessoa de `data/equipe.json`; o token dela para de valer no próximo pedido, sem reiniciar). Cadastre só quem você confia e retire quem saiu.
- **Janela do Windows:** aprovar item perigoso (implementação e testes de agente de código, pedidos a terminais, propostas de agentes) continua abrindo a janela de confirmação no computador do servidor, como em "Token de acesso e confirmação". Item seguro não abre janela. Pelo celular, só o dono (token do QR code) dispensa a janela nas rotas de aprovar e recusar; a equipe não libera permissões de terminal, não libera chamada "para sempre" e não repete tarefa com ferramentas liberadas.
- **XP:** só por resultado verificado: o dono clica em "Ficou bom" numa tarefa concluída sem erro, ou uma rotina termina sem erro. Cada evento conta uma única vez (repetir o clique não soma) e volume de mensagens ou tokens nunca dá XP. O celular e a equipe não conseguem avaliar.

## Boneco e auras

Você tem um boneco no mapa e anda até os agentes em vez de só clicar neles.

- **Teclas:** setas ou `WASD` movem o boneco, `Shift` corre, `E` interage com o agente mais próximo, `1` a `6` escolhem uma ação do menu e `Esc` fecha.
- **Menu do agente:** conversar, desafiar (os jogos chegam no projeto 4), `/btw` (pergunta avulsa de até 500 caracteres), agradecer (só vale quando há um resultado novo), puxar a orelha e baixar o modelo.
- **Escada de modelos:** subir e descer andam um degrau por vez. No Claude: haiku, sonnet, opus, fable. No Codex: gpt-5.1-codex-mini, gpt-5.2-codex, gpt-5.3-codex. O pedido leva o modelo que a pessoa viu na tela (`de`); se o agente já mudou, o servidor responde 409 e nada é gravado.
- **Auras:** o modelo aparece em volta do agente. Só o `fable` tem a chama dourada; o `opus` tem um brilho intermediário; `haiku` e `sonnet` têm um brilho sutil. Com `prefers-reduced-motion` ativo, a aura fica parada.
- **Equipe:** a equipe cadastrada (veja "Painel da holding") pode as mesmas ações do dono, inclusive pelo celular. O servidor audita cada ação com o nome de quem fez; pedido sem nome ou feito por agente recebe 403.

## O que mudou em relação ao Habblaud

`shared/types.ts` (RoomInfo.build e floor), `client/src/world/sim/sim.ts` e `world/layout/custom-room.ts` (salas montadas, um andar por vez), `world/api.ts` (sem tema sazonal), `ui/` (construtor, operações, conversa, pedidos aos terminais, botão de andar) e `floor.ts`. O `server/` é novo; só `server/core/vendor/` é gerado a partir de `shared/` do Habblaud.

## Créditos e licença

Este projeto é uma obra derivada do [Habblaud](https://github.com/marmottajr/habblaud), de Márcio Junior, distribuído sob a licença MIT (© 2026 Márcio Junior). O `client/` e o `shared/` partem do código dele, modificado como descrito acima ("Claubbo" é o nome que este projeto dá ao cliente derivado). O texto da licença MIT está em [`LICENSE`](LICENSE) e os demais avisos (fonte Pixelify Sans, sob SIL OFL 1.1) em [`NOTICE.md`](NOTICE.md). Ambos acompanham o build em `dist/client/` e são citados na seção "Sobre" das configurações do app.
