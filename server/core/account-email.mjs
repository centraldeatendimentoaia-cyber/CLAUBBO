// E-mail da conta do Claude em que um terminal está logado, para o painel de acompanhamento. Lê só o campo
// `oauthAccount.emailAddress` do `.claude.json` da conta; as credenciais (.credentials.json) nunca são abertas e nenhum
// outro campo sai daqui.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

/** Arquivo de configuração do Claude Code de uma pasta de conta: a padrão (~/.claude) usa ~/.claude.json. */
export function claudeJsonOf(configDir, home = os.homedir()) {
  // O Claubbo informa pastas no formato do WSL (/mnt/c/...); no Windows viram C:/...
  const dir = path.resolve(String(configDir).replace(/^\/mnt\/([a-z])\//i, (_, d) => (process.platform === 'win32' ? `${d.toUpperCase()}:/` : `/mnt/${d}/`)));
  return dir === path.join(home, '.claude') ? path.join(home, '.claude.json') : path.join(dir, '.claude.json');
}

/** E-mail da conta, ou null quando não dá para saber (arquivo ausente, ilegível ou sem o campo). */
export function accountEmail(configDir, home = os.homedir()) {
  if (!configDir) return null;
  try {
    const email = JSON.parse(fs.readFileSync(claudeJsonOf(configDir, home), 'utf8'))?.oauthAccount?.emailAddress;
    return typeof email === 'string' && EMAIL.test(email) ? email : null;
  } catch {
    return null;
  }
}
