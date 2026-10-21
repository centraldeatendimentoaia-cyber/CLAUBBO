# Atualizar o Claubbo com um único prompt

1. Abra o terminal e digite `claude` (ou `codex`) na pasta onde o Claubbo foi instalado.
2. Copie o prompt abaixo (o bloco inteiro) e cole. Aperte Enter.
3. Aprove o que ele pedir (reiniciar o servidor, Docker) e espere alguns minutos.

Seus dados (`data/`: salas, agentes, tarefas, tokens) não são apagados.

## Prompt

````text
Atualize e revise o Claubbo instalado na minha máquina e deixe tudo funcionando. Repositório: https://github.com/centraldeatendimentoaia-cyber/CLAUBBO

Regras:
- Este prompt vale igual no Claude Code e no Codex.
- Faça tudo sozinho, na ordem abaixo, um passo por vez, e me diga em uma linha o que está fazendo. Só me interrompa para pedir permissão.
- Se o sandbox ou as permissões bloquearem algo (rede, pastas fora deste projeto, Docker, processos, firewall), peça a minha aprovação para rodar fora dele. Nunca pule um passo por isso.
- Deixe sempre a versão completa: nada de `--sem-permissoes` nem `--sem-mensagens`.
- Nunca apague nem edite a pasta `data/`. Nunca escreva tokens (do celular, de acesso ou do Telegram) em arquivos, commits ou na conversa.
- Se algo der erro, leia o README e o CHANGELOG do repositório, corrija e continue até tudo funcionar.

0. Descubra o sistema e a pasta
- Detecte o sistema (`uname -sm`; no Windows, `$env:OS`) e adapte os comandos (PowerShell no Windows).
- A pasta do Claubbo é a que tem `server/bridge.mjs`: confira a pasta atual e, se não for, procure em `~/Claubbo` e nas pastas do usuário. Se não achar, me pergunte.
- Se `git status` mostrar alterações minhas nos arquivos do projeto, pare e me pergunte antes do pull.
- Veja se o modo celular está ligado: confira se `data/celular.txt` existe. Se existir, guarde o IP (o host do endereço, sem o token) para religar no passo 4.

1. Atualize o código
- Na raiz: `git pull` e depois `npm ci`. Se o pull parar por causa do `package-lock.json`, rode `git checkout -- package-lock.json` e repita. Se o `npm ci` falhar em pacotes opcionais (`node-pty`, `@xterm/*`), siga em frente.
- `npm run build`.

2. Suba o Habblaud no Docker (andar 2)
- `cd habblaud`, `npm ci` e `npm run docker:up`. Espere http://127.0.0.1:4747/api/health responder e confira com `docker ps` que o contêiner `claubbo` está de pé. Se o Docker estiver parado, abra-o e espere o engine subir.

3. Plugins do Claude Code (se eu uso)
- Em `habblaud`: `npm run mod:install`, sem flags (o `docker:up` atualiza o mod, mas não instala plugins novos), e `npm run mod:status`: o mod e os plugins de permissões e de mensagens instalados e ligados em todas as contas.
- Claude Code na 2.1.287 ou mais novo (`claude --version`); atualize se não estiver.
- Confira com `claude mcp list` que o servidor `cli-agents` está registrado. Se faltar: `claude mcp add --scope user cli-agents -- node "<caminho absoluto>/server/mcp-cli-agents.mjs"`.

4. Reinicie o servidor
- Descubra quem escuta a porta 4530 (Windows: `Get-NetTCPConnection -LocalPort 4530`; Mac e Linux: `lsof -i :4530`), confirme que é o Claubbo e peça a minha aprovação antes de encerrar.
- Suba de novo na raiz, em segundo plano e desanexado do terminal: `npm start`. Se o modo celular estava ligado (passo 0), suba com `V2_LAN_HOST=<IP guardado>` (Windows: `$env:V2_LAN_HOST="<IP>"; Start-Process -WindowStyle Hidden -FilePath npm.cmd -ArgumentList "start"`; Mac e Linux: `V2_LAN_HOST=<IP> nohup npm start >/dev/null 2>&1 &`) e espere o `data/celular.txt` aparecer. Se o IP do computador mudou, use o IP novo.

5. Confira
- `http://127.0.0.1:4530/api/health` responde `ok` e `http://127.0.0.1:4747/api/health` responde.
- Se o modo celular está ligado: `curl -i` no endereço de `data/celular.txt` responde `302` e a mesma URL sem o token responde `403`. Mostre o QR code no terminal só se eu pedir, sem repetir o token.
- Rode `npm test` na raiz e diga se algo falhou.

Quando terminar, responda assim:
1. Pronto: a versão nova (`package.json`), o que mudou desde a versão anterior em poucas linhas (`git log --oneline` do intervalo do pull) e o que foi reiniciado.
2. Sua vez (só se sobrou algo que só eu posso fazer, como autorizar o Docker ou o firewall): passos numerados, com o comando exato. Se não sobrou nada, pule.
3. Lembrete: rodar `/reload-plugins` nas sessões do Claude Code que já estavam abertas. Se o modo celular está ligado: o celular também aprova e recusa pedidos, e quem tem o QR code aprova.

Seja curto e direto.
````
