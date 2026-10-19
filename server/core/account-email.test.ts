import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { accountEmail, claudeJsonOf } from './account-email.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-accemail-'));
afterAll(() => fs.rmSync(home, { recursive: true, force: true }));
const write = (file: string, data: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data)); };

describe('e-mail da conta do terminal', () => {
  it('conta padrão lê ~/.claude.json; conta extra lê <pasta>/.claude.json', () => {
    expect(claudeJsonOf(path.join(home, '.claude'), home)).toBe(path.join(home, '.claude.json'));
    expect(claudeJsonOf(path.join(home, '.claude-b'), home)).toBe(path.join(home, '.claude-b', '.claude.json'));
    write(path.join(home, '.claude.json'), { oauthAccount: { emailAddress: 'dono@exemplo.com' }, outro: 'x' });
    write(path.join(home, '.claude-b', '.claude.json'), { oauthAccount: { emailAddress: 'b@exemplo.com' } });
    expect(accountEmail(path.join(home, '.claude'), home)).toBe('dono@exemplo.com');
    expect(accountEmail(path.join(home, '.claude-b'), home)).toBe('b@exemplo.com');
  });

  it('pasta no formato do WSL (/mnt/c/...) vira o caminho do Windows', () => {
    if (process.platform !== 'win32') return;
    const dir = `/mnt/${home[0]!.toLowerCase()}/${home.slice(3).replaceAll(path.sep, '/')}/.claude`;
    expect(claudeJsonOf(dir, home)).toBe(path.join(home, '.claude.json'));
  });

  it('sem arquivo, JSON quebrado, sem o campo ou valor estranho: null (nunca erro nem credencial)', () => {
    expect(accountEmail(path.join(home, '.claude-nada'), home)).toBeNull();
    write(path.join(home, '.claude-c', '.claude.json'), '{quebrado');
    expect(accountEmail(path.join(home, '.claude-c'), home)).toBeNull();
    write(path.join(home, '.claude-d', '.claude.json'), { oauthAccount: { accessToken: 'segredo' } });
    expect(accountEmail(path.join(home, '.claude-d'), home)).toBeNull();
    write(path.join(home, '.claude-e', '.claude.json'), { oauthAccount: { emailAddress: 'não é e-mail\nlinha' } });
    expect(accountEmail(path.join(home, '.claude-e'), home)).toBeNull();
    expect(accountEmail('', home)).toBeNull();
  });
});
