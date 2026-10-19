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

## O que tem

- **Mapa** em pixel art com salas, móveis, luz e vida social. Agentes sentam, trabalham, vão à sala da tarefa e à sala de reunião.
- **Construtor** (botão de prédio): estilo, piso, paredes e os móveis do catálogo; tipo da sala (trabalho ou reunião); modelos prontos.
- **Operações** (botão de pasta): agentes (conta, modelo, esforço, ferramentas, skills), tarefas, reuniões sem limite fixo de participantes e contas Claude/Codex.
- **Conversa** na gaveta de cada agente; `revise: ...` vira regra durável no cérebro.
- **Andar 2**: sessões do Claude Code abertas em terminais (lidas pelo Claubbo original em `CLAUBBO_URL`, padrão http://127.0.0.1:4747). Os agentes do escritório acionam esses terminais pelo MCP `server/mcp-cli-agents.mjs`; o envio só sai depois do clique em Aprovar.

## Segurança dos agentes

Sem Bash, sem ler ou escrever arquivos, sem subagentes. Só as ferramentas liberadas em cada agente (web, Chrome, servidores MCP), e as escritas do Meta Ads ficam bloqueadas (`data/tool-rules.json` ajusta). Ações que saem da máquina passam por aprovação. O escritório nunca lê nem guarda senha ou token: o login fica na pasta de cada conta.

## O que mudou em relação ao Habblaud

`shared/types.ts` (RoomInfo.build e floor), `client/src/world/sim/sim.ts` e `world/layout/custom-room.ts` (salas montadas, um andar por vez), `world/api.ts` (sem tema sazonal), `ui/` (construtor, operações, conversa, pedidos aos terminais, botão de andar) e `floor.ts`. O `server/` é novo; só `server/core/vendor/` é gerado a partir de `shared/` do Habblaud.

## Créditos e licença

Este projeto é uma obra derivada do [Habblaud](https://github.com/marmottajr/habblaud), de Márcio Junior, distribuído sob a licença MIT (© 2026 Márcio Junior). O `client/` e o `shared/` partem do código dele, modificado como descrito acima ("Claubbo" é o nome que este projeto dá ao cliente derivado). O texto da licença MIT está em [`LICENSE`](LICENSE) e os demais avisos (fonte Pixelify Sans, sob SIL OFL 1.1) em [`NOTICE.md`](NOTICE.md). Ambos acompanham o build em `dist/client/` e são citados na seção "Sobre" das configurações do app.
