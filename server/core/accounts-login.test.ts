import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Só monta o comando do login (nada é executado, nenhum login é feito).
const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'v2-login-')), 'home');
let claudeLoginSpawn: (a: Record<string, unknown>) => { file: string; args: string[]; options: Record<string, any> } | null;
let listAccounts: () => Array<Record<string, any>>;

beforeAll(async () => {
  Object.assign(process.env, { V2_HOME: home, V2_DATA: path.join(home, '..', 'data'), V2_CLAUDE_BIN: 'claude', V2_CLAUDE_PRE: '[]' });
  delete process.env.CLAUDE_CONFIG_DIR;
  // @ts-expect-error módulo .mjs sem tipos
  ({ claudeLoginSpawn, listAccounts } = await import('./accounts.mjs'));
});

describe('login das contas do Claude', () => {
  it('conta extra: cmd.exe direto, janela nova, pasta da conta no ambiente e caminho fora da linha de comando', () => {
    const dir = path.join(home, '.claude-office', 'secundaria');
    const l = claudeLoginSpawn({ id: 'secundaria', provider: 'claude', configDir: dir })!;
    expect(l.file).toBe('cmd.exe');
    expect(l.args.join(' ')).toContain('start "Login Claude" cmd.exe /v:on /k');
    expect(l.args.join(' ')).toContain('auth login --claudeai');
    expect(l.args.join(' ')).not.toContain(dir);
    expect(l.options.env.CLAUDE_CONFIG_DIR).toBe(dir);
    expect(l.options.env.V2_LOGIN_DIR).toBe(dir);
    expect(l.options.windowsVerbatimArguments).toBe(true);
  });

  it('Principal: nunca recebe CLAUDE_CONFIG_DIR', () => {
    const l = claudeLoginSpawn({ id: 'principal', provider: 'claude', configDir: '' })!;
    expect(l.options.env.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(l.options.env.V2_LOGIN_DIR).toBe(path.join(home, '.claude'));
  });

  it('a lista de contas mostra a pasta de cada uma', () => {
    const p = listAccounts().find((a) => a.id === 'principal')!;
    expect(p.dir).toBe(path.join(home, '.claude'));
  });
});
