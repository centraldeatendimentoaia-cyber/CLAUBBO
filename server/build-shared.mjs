// Gera server/core/vendor/daystats.mjs e vendor/timeline.mjs a partir de shared/daystats.ts e shared/timeline.ts (o mesmo código
// que o navegador usa), porque o Node não resolve os imports sem extensão do shared/. Roda em `npm run build` e antes do `npm run check`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['daystats', 'timeline']) {
  await build({
    entryPoints: [path.join(root, 'shared', `${name}.ts`)],
    outfile: path.join(root, 'server', 'core', 'vendor', `${name}.mjs`),
    bundle: true, format: 'esm', platform: 'node', target: 'node22', logLevel: 'warning',
    banner: { js: `// GERADO por server/build-shared.mjs a partir de shared/${name}.ts: não edite.` },
  });
}
