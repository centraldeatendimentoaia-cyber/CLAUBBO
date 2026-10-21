# Abrir o Claubbo no celular

Mostra o escritório no celular, no mesmo Wi-Fi, para ver e para **aprovar ou recusar** pedidos (tarefas, pedidos de terminal, propostas e chamadas de agentes, permissões). Mandar mensagens e mexer em agentes continuam só no computador, por segurança.

1. Abra o terminal e digite `claude` (ou `codex`) na pasta onde o Claubbo foi instalado.
2. Copie o prompt abaixo (o bloco inteiro) e cole. Aperte Enter.
3. Aprove o que ele pedir (firewall e reinício do servidor) e escaneie o QR code com a câmera do celular.

Para voltar ao normal, peça: "desligue o Claubbo no celular".

## Como funciona

- O servidor continua em `127.0.0.1` por padrão. Com `V2_LAN_HOST=<IP do computador no Wi-Fi>`, ele passa a aceitar a rede local.
- Quem vem de fora do computador precisa do token do QR code (novo a cada vez que o servidor sobe) e nunca recebe o token da página. Só lê (GET) e aprova ou recusa (POST nas rotas de aprovação); qualquer outra escrita é recusada.
- Aprovar pelo celular dispensa a janela de confirmação do Windows: quem tem o celular com o QR code decide. Fica no registro de auditoria como `celular`. Por isso, quem tiver o endereço de `data/celular.txt` aprova; não compartilhe o QR code.
- O endereço com o token fica em `data/celular.txt` (permissão 0600) e some quando o servidor para.
- O tráfego é HTTP, sem criptografia: use só em Wi-Fi de confiança e desligue quando terminar.

## Prompt

````text
Libere o Claubbo instalado na minha máquina para eu abrir no celular, no mesmo Wi-Fi, para ver e para aprovar ou recusar pedidos.

Regras:
- Este prompt vale igual no Claude Code e no Codex.
- Faça tudo sozinho, um passo por vez, e me diga em uma linha o que está fazendo. Só me interrompa para pedir permissão.
- Se o sandbox ou as permissões bloquearem algo (rede, firewall, processos, pastas fora deste projeto), peça a minha aprovação para rodar fora dele. Nunca pule um passo por isso.
- Não mude nenhum arquivo do projeto. O modo celular é só uma variável de ambiente na hora de subir o servidor.
- Nunca escreva o token do celular em arquivos, mensagens de commit ou na conversa em texto: ele só pode aparecer dentro do QR code e do endereço que eu vou abrir.

0. Descubra o sistema e a pasta
- Detecte o sistema (`uname -sm`; no Windows, `$env:OS`) e adapte os comandos (PowerShell no Windows).
- A pasta do Claubbo é a que tem `server/bridge.mjs`: confira a pasta atual e, se não for, procure em `~/Claubbo` e nas pastas do usuário. Se não achar, me pergunte.

1. Descubra o IP do computador no Wi-Fi
- macOS: `ipconfig getifaddr en0` (ou `en1`, se vier vazio). Linux: `hostname -I`. Windows: o IPv4 do adaptador Wi-Fi em `ipconfig`.
- Se houver mais de um IP possível, escolha o do Wi-Fi e me diga qual.

2. Libere a porta 4530 no firewall, só na rede privada
- Windows (PowerShell como administrador): `New-NetFirewallRule -DisplayName "Claubbo celular" -Direction Inbound -LocalPort 4530 -Protocol TCP -Action Allow -Profile Private`.
- Linux: `sudo ufw allow from 192.168.0.0/16 to any port 4530 proto tcp` (ou o equivalente da distribuição, limitado à rede local). macOS: permita conexões de entrada para o Node em Ajustes > Rede > Firewall.

3. Reinicie o servidor no modo celular
- Descubra quem escuta a porta 4530 (Windows: `Get-NetTCPConnection -LocalPort 4530`; Mac e Linux: `lsof -i :4530`), confirme que é o Claubbo e peça a minha aprovação antes de encerrar.
- Suba de novo na pasta do Claubbo, em segundo plano e desanexado do terminal, com a variável `V2_LAN_HOST` igual ao IP do passo 1: Windows, `$env:V2_LAN_HOST="<IP>"; Start-Process -WindowStyle Hidden -FilePath npm.cmd -ArgumentList "start"`; Mac e Linux, `V2_LAN_HOST=<IP> nohup npm start >/dev/null 2>&1 &`.
- Espere o arquivo `data/celular.txt` aparecer (até 30 segundos). Ele guarda o endereço com o token.

4. Confira e mostre o QR code
- Teste com `curl -i` no endereço de `data/celular.txt`: tem de responder `302`. Sem o token, a mesma URL tem de responder `403`.
- Mostre o QR code no terminal com esse endereço (por exemplo, `npx qrcode-terminal "<endereço>"`), sem repetir o token em outro lugar.

Quando terminar, responda assim:
1. Pronto: o QR code e o endereço (sem o token escrito à parte).
2. Sua vez (só se sobrou algo que só eu posso fazer, como autorizar o firewall): passos numerados. Se não sobrou nada, pule.
3. Atenção: o celular vê e aprova ou recusa pedidos, sem a janela de confirmação do computador; quem tiver o QR code aprova. Mandar mensagem e editar continuam só no computador. O tráfego é HTTP sem criptografia: use só em Wi-Fi de confiança. Para voltar ao normal é só me pedir "desligue o Claubbo no celular": você encerra o servidor, sobe de novo sem `V2_LAN_HOST` e remove a regra "Claubbo celular" do firewall.

Seja curto e direto.
````
