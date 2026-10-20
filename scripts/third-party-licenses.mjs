// Gera o texto de THIRD-PARTY-LICENSES.txt: aviso de copyright e licença de cada pacote de produção do package-lock.json
// (mais o que vai dentro do bundle do cliente). Lê só node_modules e o lockfile; não usa rede.
import fs from 'node:fs';
import path from 'node:path';

// Pacotes de desenvolvimento cujo código acaba dentro de dist/client.
const BUNDLED_DEV = ['node_modules/@xterm/xterm'];
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i;

const MIT = (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const authorOf = (pkg) => {
  const a = pkg.author;
  const name = typeof a === 'string' ? a.replace(/\s*[<(].*$/, '') : a?.name;
  return name || `${pkg.name} contributors`;
};

/** Devolve { text, missing } para a pasta `root` do projeto. `missing` lista pacotes de produção sem pasta em node_modules. */
export function buildThirdPartyNotices(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const entries = Object.entries(lock.packages).filter(([k, v]) => k.startsWith('node_modules/') && (!v.dev || BUNDLED_DEV.includes(k)));
  entries.sort(([a], [b]) => a.localeCompare(b));
  const missing = [];
  const blocks = [];
  for (const [key, meta] of entries) {
    const dir = path.join(root, key);
    if (!fs.existsSync(path.join(dir, 'package.json'))) { missing.push(key); continue; }
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const file = fs.readdirSync(dir).find((f) => LICENSE_FILE.test(f));
    const license = meta.license || (typeof pkg.license === 'string' ? pkg.license : 'ver texto abaixo');
    let body;
    if (file) body = fs.readFileSync(path.join(dir, file), 'utf8').trim();
    else if (license === 'MIT') body = `${MIT(authorOf(pkg))}\n\n(O pacote não traz arquivo de licença; texto padrão da MIT com o autor declarado no package.json.)`;
    else body = `Licença declarada: ${license}. O pacote não traz arquivo de licença.`;
    blocks.push(`${'='.repeat(78)}\n${pkg.name}@${pkg.version} (${license})${meta.optional ? ' [opcional]' : ''}\n${pkg.homepage || pkg.repository?.url || ''}\n${'-'.repeat(78)}\n${body}\n`);
  }
  const head = `Avisos de software de terceiros (Claubbo)\n\nEste produto inclui os pacotes abaixo, distribuídos sob as licenças indicadas. O texto de cada licença foi mantido como no pacote.\nO aviso do Habblaud (MIT) está em LICENSE e NOTICE.md; a licença da fonte Pixelify Sans (OFL-1.1) está em licenses/.\n\n`;
  return { text: head + blocks.join('\n'), count: blocks.length, missing };
}
