# Instalar o Claubbo com um único prompt

1. Abra o terminal e digite `claude` (ou `codex`).
2. Copie o prompt abaixo (o bloco inteiro) e cole. Aperte Enter.
3. Aprove o que ele pedir e espere (de 3 a 10 minutos). Ele pode pedir a senha do computador.
4. Abra http://127.0.0.1:4530. Em *Operações > Contas*, conecte a sua conta Claude (e a do Codex, se usar).

O repositório precisa estar acessível para quem instala: público, ou o usuário precisa ter login no GitHub (`gh auth login`).

## Prompt

````text
Instala o Claubbo (escritório de agentes de IA) na minha máquina e deixa tudo rodando. Repositório: https://github.com/centraldeatendimentoaia-cyber/CLAUBBO

Regras:
- Faça tudo você mesmo, um passo por vez, e me diga em uma linha o que está fazendo.
- Só me pergunte quando precisar de uma permissão, uma senha ou uma decisão que é minha.
- Se o sandbox ou as permissões bloquearem algo (rede, pastas fora deste projeto, Docker, `sudo`), peça a minha aprovação para rodar fora dele. Nunca pule um passo por isso.
- Nunca grave senhas, tokens ou chaves em arquivos do projeto, e nunca os repita na conversa.
- Não apague nada que já exista na minha máquina. Se a pasta de destino já existir, pare e me pergunte.
- Se algo der erro, leia o README do repositório e o INSTALAR.md, corrija e continue até tudo funcionar.

0. Descubra o sistema e os pré-requisitos
- Detecte o sistema operacional e a arquitetura (`uname -sm`; no Windows, `$env:OS` e `[Environment]::OSVersion`) e adapte os comandos (PowerShell no Windows, shell no Mac e no Linux).
- Confira: Node.js 22.12 ou mais novo (`node -v`), npm, git e o Claude Code (`claude --version`). O Docker (`docker info`) também é necessário: é ele que liga o andar 2, onde aparecem as sessões do Claude Code abertas em terminais.
- Se faltar Node ou git, instale pelo gerenciador de pacotes do sistema (winget no Windows, brew no Mac, apt/dnf no Linux) pedindo a minha aprovação. Se faltar o Claude Code, instale com `npm i -g @anthropic-ai/claude-code`. Depois recarregue o PATH.
- Se o Docker faltar, instale-o você mesmo, pedindo a minha aprovação: Windows, `winget install -e --id Docker.DockerDesktop`; Mac, `brew install --cask docker`; Linux, o Docker Engine pelo gerenciador de pacotes da distribuição (e `sudo systemctl enable --now docker`). No Windows, o Docker Desktop precisa do WSL2: se pedir para reiniciar o computador, pare, me explique que só preciso reiniciar e colar este mesmo prompt de novo.
- Depois de instalar, abra o Docker Desktop (Windows: `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`; Mac: `open -a Docker`), aceite os termos se ele pedir e espere o engine subir: repita `docker info` a cada 5 segundos, por até 3 minutos, até responder sem erro. Se ele pedir login, diga que dá para pular ("Skip") e que o login não é necessário.

1. Baixe o projeto
- Clone o repositório em uma pasta nova `Claubbo` dentro da minha pasta de usuário (`git clone https://github.com/centraldeatendimentoaia-cyber/CLAUBBO.git`). Se o clone pedir login, rode `gh auth login` (ou me peça para entrar no GitHub). Entre na pasta e use o caminho absoluto dela nos passos seguintes.

2. Instale e compile o escritório
- Na raiz: `npm ci` e depois `npm run build`. Se o `npm ci` falhar em pacotes opcionais (`node-pty`, `@xterm/*`), siga em frente: eles são opcionais.

3. Suba o Habblaud no Docker (é o que mostra o andar 2; não pule este passo)
- `cd habblaud`, `npm ci` e `npm run docker:up`. Espere o `/api/health` responder em http://127.0.0.1:4747.
- Confira com `docker ps` que o contêiner `habblaud` está de pé. Se o `docker:up` falhar, leia o erro, corrija (Docker parado, porta 4747 ocupada, falta de `npm ci` em `habblaud`) e rode de novo, até o `/api/health` responder.

4. Instale os plugins do Habblaud no Claude Code (precisa do Claude Code 2.1.287 ou mais novo)
- Em `habblaud`: `npm run mod:install` e depois `npm run mod:status`. Instale sempre a versão completa, sem `--sem-permissoes` nem `--sem-mensagens`.

5. Registre o servidor MCP dos agentes de terminal, no escopo de usuário
- `claude mcp add --scope user cli-agents -- node "<caminho absoluto>/server/mcp-cli-agents.mjs"`. Confira com `claude mcp list`.

6. Suba o servidor
- Rode `npm start` na raiz, em segundo plano.
- Confira se http://127.0.0.1:4530/api/health responde `ok`. Na primeira subida o servidor cria a pasta `data/` sozinho.
- No Windows, o `abrir-escritorio.cmd` da pasta instalada sobe o servidor e abre a página. Se eu quiser um atalho na área de trabalho, crie um que aponte para ele.

7. Verifique e me entregue
- Abra http://127.0.0.1:4530 no navegador. Confira que as salas aparecem e que o andar 2 lista as sessões do Claude Code (abra o `claude` em qualquer pasta e veja o personagem chegar; se a lista ficar vazia, revise os passos 3 e 4).
- Me diga, em poucas linhas: o que foi instalado, o que ficou de fora e por quê, a URL do escritório e o comando para iniciar de novo.
- Me lembre do último passo, que é meu: em *Operações > Contas*, conectar a conta Claude (e a do Codex, se eu usar). O login é feito por mim, nunca por você.
````
