# Checklist de lançamento do Escritório v2 / Claubbo

Estado em 2026-10-20, commit `a2a336a`. Escopo: só `D:\escritorio-v2`. Nada foi publicado, comprado, enviado nem implantado.
Critérios de "pronto para publicar" que o João ainda não definiu estão marcados como **DECISÃO**.

## Concluído (com evidência)

- [x] **Árvore de trabalho sem mudanças soltas.** Dois commits locais separam o trabalho:
  `37799be` (instalador do mod e correção dos textos da interface) e `a2a336a` (trabalho pendente dos outros agentes, registrado como snapshot).
  Evidência: `git status` vazio; `git log`.
- [x] **`npm run check` completo verde.** Núcleo 20/20, transcript, cli-mode, retorno e vitest com 1412 testes em 140 arquivos. Repetido depois dos commits.
- [x] **Tipos.** `npx tsc -p . --noEmit` sem erros.
- [x] **Build atualizado.** `npm run build` em 2026-10-20 00:59. O hash de `dist/client/bundle/app-*.js` é igual no disco e na porta 4530 (`41c86807b977`).
- [x] **Revisão visual automatizada.** `server/test/visual-check.mjs` passou em instância isolada (porta 4598, dados temporários, já encerrada), em Chrome headless nas larguras 1920 e 800: barra de modo visível, sem sobreposição, sem rolagem horizontal, painel do terminal abre. Prints do mapa nas duas larguras vistos e sem defeito aparente (o print do painel foi gerado, não foi aberto por mim).
- [x] **Instalador do mod.** `npm run mod:install|mod:status|mod:uninstall` (`scripts/mod.mjs`), testado em config isolado do Claude Code, idempotente, preserva plugins e marketplaces existentes.
- [x] **Textos da interface sem comandos inexistentes.** Teste `client/src/ui/npm-scripts.test.ts` falha se a UI citar `npm run X` que não exista.
- [x] **Licenças no build.** `LICENSE`, `NOTICE.md` e `THIRD-PARTY-LICENSES.txt` estão em `dist/client`; a tela Sobre cita o Habblaud (MIT).
- [x] **Sem segredos nos diffs commitados.** Busca por padrões de chave/token nos diffs: nada. `data/`, `.env*` e `*.bak*` estão no `.gitignore` e fora dos commits.

## Pendências que dependem do João

- [ ] **Reiniciar a porta 4530.** O servidor atual subiu às 00:47; `server/core/vendor/daystats.mjs` foi regenerado às 00:58 (só textos). A interface já serve o build novo; só mensagens geradas pelo servidor ainda usam o texto antigo. Não reiniciei porque há agentes trabalhando (Joana, Cecília) e reiniciar interrompe tarefas. Como: `npm start` na pasta, com `data/` intacto (`COMBINADO.md`).
- [ ] **DECISÃO: revisão humana do commit `a2a336a`.** Ele reúne 88 arquivos de outros agentes, verificados por teste mas não lidos linha a linha. Se preferir, `git reset --soft HEAD~1` desfaz só esse commit.
- [ ] **DECISÃO: de onde sai o pacote público.** Existe um clone separado em `D:\escritorio-clone` (`_lancamento/` com inventário, licença, landing, Stripe, domínio). Os pendentes dele não foram tocados: estão fora de `D:\escritorio-v2` e envolvem conta, pagamento e publicação.
- [ ] **DECISÃO: identidade do pacote.** `package.json` ainda aponta `repository` e `homepage` para `github.com/marmottajr/habblaud`; nome `escritorio-v2` e versão `1.0.3`. Falta a URL, o nome e a versão públicos.
- [ ] **DECISÃO: arte da marca.** `client/public/assets/brand/*` são placeholders de poucas centenas de bytes. `og-image.png`, `illustrations/empty-office.png` e `escritorio.ico` têm origem não confirmada (apontado em `_lancamento/licenca.md`).
- [ ] **DECISÃO: endereços do Habblaud World.** `shared/world/*` e `client/src/ui/world/*` ainda citam `habblaud.com` (termos, privacidade, e-mail de contato). Manter, trocar ou desligar o recurso.
- [ ] **DECISÃO: de onde vêm os plugins do mod.** `mod:install` usa `~/habblaud-mod` (fora do repositório) ou `--origem`. Opções: copiar os plugins MIT para o repositório com crédito, ou documentar o pré-requisito.
- [ ] **DECISÃO: nome "Claubbo".** Não foi verificado se marca e domínio estão livres (não coberto por nenhuma licença).
- [ ] **DECISÃO: critérios de aceite do lançamento.** Nenhum critério (público-alvo, plataformas, suporte, preço) consta nos arquivos que consegui ler. Sem eles, "pronto" só vale para o que está acima.

## Pendências técnicas conhecidas (não bloqueiam o que foi testado)

- [ ] **Codex.** Esta instalação não traz entregador de mensagens nem hooks do Codex; a UI avisa. Não há script equivalente a `mod:install` para o Codex.
- [ ] **Chaves de tradução sem uso** de upstream (`hooks:install`, `docker:up`, `remote:*`): não aparecem na UI, ficam em `shared/locales/*` e no vendor.
- [ ] **Cobertura visual.** Só a barra de modo, rolagem horizontal e painel do terminal foram checados, em Chrome headless. Não foram percorridos construtor, pets, ajuda, Sobre, telas de Codex nem navegadores reais ou celular.
- [ ] **Auditoria de dependências.** `npm audit` não rodou (precisa de rede). `devDependencies` não entram em `THIRD-PARTY-LICENSES.txt`.
- [ ] **Plugins em sessão real.** Os plugins `habblaud-*` foram instalados e removidos em config isolado, mas não carregados numa sessão nova do Claude Code.
- [ ] **Fim de linha.** O Git avisa que LF vira CRLF nos arquivos tocados; sem efeito funcional, mas não há `.gitattributes`.
