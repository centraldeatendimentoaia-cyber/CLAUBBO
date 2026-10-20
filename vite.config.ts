import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildThirdPartyNotices } from './scripts/third-party-licenses.mjs';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// A licença MIT do Habblaud, os avisos, a licença OFL da fonte e os avisos de terceiros acompanham o build (dist/client/LICENSE, NOTICE.md, licenses/ e THIRD-PARTY-LICENSES.txt).
const licenseFiles = () => ({
  name: 'claubbo-license-files',
  generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
    const files: Array<[string, string]> = [
      ['LICENSE', './LICENSE'],
      ['NOTICE.md', './NOTICE.md'],
      ['licenses/OFL-Pixelify-Sans.txt', './node_modules/@fontsource/pixelify-sans/LICENSE'],
    ];
    for (const [fileName, from] of files) this.emitFile({ type: 'asset', fileName, source: readFileSync(r(from), 'utf8') });
    const notices = buildThirdPartyNotices(r('.'));
    if (notices.missing.length) throw new Error(`THIRD-PARTY-LICENSES.txt: pacotes sem pasta em node_modules (rode npm install): ${notices.missing.join(', ')}`);
    this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-LICENSES.txt', source: notices.text });
  },
});

// Cliente do Claubbo. Em `npm run dev` o servidor usa este config em middleware mode;
// `npm run dev:client` sobe só o Vite (use ?mock=1 para dados simulados no navegador).
export default defineConfig({
  root: r('./client'),
  plugins: [licenseFiles()],
  // No navegador vai só o dicionário do idioma ativo (client/src/main.ts), não os três: ver shared/locales/all.ts.
  resolve: { alias: [{ find: /^\.\/locales\/all$/, replacement: r('./shared/locales/none.ts') }] },
  publicDir: r('./client/public'),
  build: {
    outDir: r('./dist/client'),
    emptyOutDir: true,
    // Arquivos gerados com hash vão para /bundle/ (cache immutable no servidor); /assets/ fica só
    // para client/public (nomes fixos, revalidados a cada acesso). Ver server/http/static.ts.
    assetsDir: 'bundle',
    assetsInlineLimit: 0,
    rollupOptions: { input: { main: r('./client/index.html') } },
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.CLAUBBO_PORT ?? 4747}` },
    },
  },
});
