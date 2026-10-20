import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error script .mjs sem tipos
import { main } from '../../scripts/mod.mjs';

type Res = { status: number | null; stdout: string; stderr: string };
const ok = (stdout = ''): Res => ({ status: 0, stdout, stderr: '' });

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mod-test-'));
  fs.mkdirSync(path.join(dir, '.claude-plugin'));
  fs.writeFileSync(
    path.join(dir, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'habblaud', plugins: ['habblaud', 'habblaud-permissoes', 'habblaud-mensagens'].map((name) => ({ name })) }),
  );
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** `claude` falso com estado: marketplaces e plugins já existentes são preservados; cada chamada fica em `calls`. */
function fake(init: { markets?: object[]; plugins?: string[]; version?: string } = {}) {
  const markets = [...(init.markets ?? [])] as { name: string }[];
  const plugins = [...(init.plugins ?? [])];
  const calls: string[] = [];
  const claude = (args: string[]): Res => {
    const line = args.join(' ');
    calls.push(line);
    if (line === '--version') return ok(`${init.version ?? '2.1.304'} (Claude Code)\n`);
    if (line === 'plugin marketplace list --json') return ok(JSON.stringify(markets));
    if (line === 'plugin list --json') return ok(JSON.stringify(plugins.map((id) => ({ id, version: '1.0.3', enabled: true }))));
    if (args[2] === 'add') markets.push({ name: 'habblaud', source: 'directory', path: args[3] } as never);
    if (args[1] === 'install') plugins.push(args[2]);
    if (args[1] === 'uninstall') plugins.splice(plugins.indexOf(args[2]), 1);
    if (args[2] === 'remove') markets.splice(markets.findIndex((m) => m.name === args[3]), 1);
    return ok();
  };
  return { claude, calls, markets, plugins };
}
const run = (argv: string[], f: ReturnType<typeof fake>) => {
  const out: string[] = [];
  const code = main(argv, { claude: f.claude, log: (s: string) => out.push(s) }) as number;
  return { code, out: out.join('\n') };
};

describe('mod:install / status / uninstall', () => {
  it('instala marketplace e os três plugins, e uma segunda vez não repete nada', () => {
    const f = fake();
    expect(run(['install', '--origem', dir], f).code).toBe(0);
    expect(f.plugins).toEqual(['habblaud@habblaud', 'habblaud-permissoes@habblaud', 'habblaud-mensagens@habblaud']);
    const again = run(['install', '--origem', dir], f);
    expect(again.code).toBe(0);
    expect(f.calls.filter((c) => c.includes(' add ') || c.startsWith('plugin install'))).toHaveLength(4);
    expect(again.out).toContain('já instalado, mantido');
  });

  it('--sem-mensagens deixa o plugin de fora', () => {
    const f = fake();
    run(['install', '--origem', dir, '--sem-mensagens'], f);
    expect(f.plugins).not.toContain('habblaud-mensagens@habblaud');
  });

  it('preserva plugins e marketplaces de terceiros, e não troca marketplace com outra origem', () => {
    const other = { name: 'habblaud', source: 'directory', path: path.join(dir, 'outra') };
    const f = fake({ markets: [other, { name: 'caveman', source: 'github' }], plugins: ['caveman@caveman'] });
    const r = run(['install', '--origem', dir], f);
    expect(r.code).toBe(1);
    expect(r.out).toContain('outra origem');
    expect(f.calls.some((c) => c.startsWith('plugin install') || c.includes('remove'))).toBe(false);
    expect(f.plugins).toEqual(['caveman@caveman']);
  });

  it('status informa sem alterar nada', () => {
    const f = fake({ markets: [{ name: 'habblaud', source: 'directory', path: dir }], plugins: ['habblaud@habblaud'] });
    const r = run(['status', '--origem', dir], f);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/habblaud@habblaud: instalado 1\.0\.3/);
    expect(r.out).toMatch(/habblaud-mensagens@habblaud: não instalado/);
    expect(f.calls.every((c) => c === '--version' || c.endsWith('list --json'))).toBe(true);
  });

  it('uninstall remove só o que é do habblaud e deixa o resto', () => {
    const f = fake({ markets: [{ name: 'habblaud', source: 'directory', path: dir }, { name: 'caveman' }], plugins: ['caveman@caveman', 'habblaud@habblaud', 'habblaud-mensagens@habblaud'] });
    expect(run(['uninstall', '--origem', dir], f).code).toBe(0);
    expect(f.plugins).toEqual(['caveman@caveman']);
    expect(f.markets.map((m) => m.name)).toEqual(['caveman']);
  });

  it('uninstall não remove marketplace de outra origem', () => {
    const f = fake({ markets: [{ name: 'habblaud', source: 'directory', path: path.join(dir, 'outra') }] });
    expect(run(['uninstall', '--origem', dir], f).code).toBe(0);
    expect(f.markets).toHaveLength(1);
  });

  it('erros claros: origem sem marketplace, Claude Code antigo, comando inválido', () => {
    expect(run(['install', '--origem', path.join(dir, 'nada')], fake()).out).toContain('--origem');
    expect(run(['install', '--origem', dir], fake({ version: '2.1.200' })).out).toContain('antigo');
    expect(run(['status', '--sem-mensagens'], fake()).code).toBe(2);
    expect(run(['foo'], fake()).code).toBe(2);
  });
});
