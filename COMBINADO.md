# Combinado entre agentes (Escritório v2)

Para ninguém subir build velho nem sobrescrever o trabalho do outro:

1. **Um dono por arquivo, por vez.** Antes de editar `server/bridge.mjs`, `client/src/ui/styles.css`, `sidebar.ts` ou `feed.ts`, veja a data de modificação (`ls -l --time-style=full-iso`). Se mudou nos últimos 30 minutos, outro agente está nele: mexa só no trecho do seu pedido e diga qual no relatório.
2. **Edite por trecho.** Use Edit/patch pontual; nunca reescreva o arquivo inteiro. Arquivos .mjs com regex: confira `node --check` depois (barras invertidas se perdem em heredoc).
3. **Quem entrega, sobe.** Quem termina um pedido roda `npm run check`, `npm run build` e reinicia só a 4530 (`data/` intacto). Se o check falhar por arquivo de outro agente em andamento, não suba: reporte arquivo e erro.
4. **Prove o build no ar.** Compare o hash de `dist/client/bundle/*` com o servido pela 4530 (`curl localhost:4530/bundle/<arquivo> | sha256sum`).
5. **Modo automático.** Toda troca fica em `data/cli-mode-log.jsonl` (`GET /api/cli/mode/log`): quando, de quê para quê e de onde veio.
6. **Portas de teste.** `cli-mode-check` escolhe portas livres; pode rodar junto com outro `npm run check`.
