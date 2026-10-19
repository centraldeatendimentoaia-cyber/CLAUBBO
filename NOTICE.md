# Avisos

`client/` e `shared/` vêm do Habblaud (https://github.com/marmottajr/habblaud), licença MIT, © 2026 Márcio Junior. O texto da licença está em `LICENSE`. Os arquivos copiados foram modificados nos pontos listados em `README.md` (seção "O que mudou em relação ao Habblaud").

`server/` é código deste projeto, escrito do zero: não contém código do Agents Office (https://github.com/ajsahni/agents-office) nem de outro produto com licença restritiva. Ele guarda os dados em `data/` e os agentes rodam por `claude -p` e `codex exec`. Exceção: `server/core/vendor/daystats.mjs` e `server/core/vendor/timeline.mjs` são gerados por `server/build-shared.mjs` a partir de `shared/daystats.ts`, `shared/timeline.ts` e `shared/locales/*`, que vêm do Habblaud. Esses dois arquivos são, portanto, obras derivadas do Habblaud e estão cobertos pela mesma licença MIT e pelo mesmo aviso de copyright acima.

A fonte Pixelify Sans (`@fontsource/pixelify-sans`) vai embutida no cliente e é licenciada pela SIL Open Font License 1.1, © 2021 The Pixelify Sans Project Authors. O texto da licença acompanha o build em `licenses/OFL-Pixelify-Sans.txt`.

O Habblaud World não é usado aqui: nenhum dado sai desta máquina.
