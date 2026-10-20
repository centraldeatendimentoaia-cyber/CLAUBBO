import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Todo `npm run <script>` mostrado ao usuário pela interface precisa existir no package.json.
const root = path.resolve(__dirname, '../../..');
const scripts = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts));

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : [];
  });
}

describe('comandos npm citados na interface', () => {
  it('só citam scripts que existem no package.json', () => {
    const bad: string[] = [];
    for (const f of sources(path.join(root, 'client/src/ui'))) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/npm run ([a-z][\w:-]*)/g)) {
        if (!scripts.has(m[1])) bad.push(`${path.relative(root, f)}: npm run ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
