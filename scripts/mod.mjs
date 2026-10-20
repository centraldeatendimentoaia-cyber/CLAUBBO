// npm run mod:install | mod:status | mod:uninstall
// Instala, confere e remove os plugins do Habblaud para o Claude Code (marketplace "habblaud": habblaud,
// habblaud-permissoes, habblaud-mensagens). Os plugins não moram neste repositório: vêm do Habblaud
// (https://github.com/marmottajr/habblaud, pasta mod/ + .claude-plugin/marketplace.json). O script só usa o CLI
// documentado `claude plugin ...` (escopo user) e não toca em nenhuma outra configuração do Claude Code.
//
// Origem do marketplace: --origem <pasta>, senão HABBLAUD_MOD_DIR, senão ~/habblaud-mod.
// Opções: --sem-permissoes, --sem-mensagens (só no install).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MIN_CLAUDE = [2, 1, 287]; // mods (hooks em TypeScript) existem a partir daqui
const PLUGINS = ['habblaud', 'habblaud-permissoes', 'habblaud-mensagens'];
const OPTIONAL = { '--sem-permissoes': 'habblaud-permissoes', '--sem-mensagens': 'habblaud-mensagens' };

/** Roda `claude <args>`. Em Windows o claude pode ser .cmd, que só abre pelo cmd.exe: cita cada argumento. */
export function runClaude(args) {
  const win = process.platform === 'win32';
  const quoted = ['claude', ...args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))].join(' ');
  const r = win
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${quoted}"`], { encoding: 'utf8', windowsVerbatimArguments: true })
    : spawnSync('claude', args, { encoding: 'utf8' });
  if (r.error) return { status: null, stdout: '', stderr: r.error.message };
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const samePath = (a, b) => {
  const n = (p) => path.resolve(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
};

const versionOf = (text) => (/(\d+)\.(\d+)\.(\d+)/.exec(text) ?? []).slice(1).map(Number);
const atLeast = (v, min) => {
  for (let i = 0; i < 3; i++) if ((v[i] ?? 0) !== min[i]) return (v[i] ?? 0) > min[i];
  return true;
};

function parseArgs(argv) {
  const out = { cmd: argv[0], origem: process.env.HABBLAUD_MOD_DIR || path.join(os.homedir(), 'habblaud-mod'), skip: new Set(), unknown: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--origem') out.origem = argv[++i] ?? '';
    else if (OPTIONAL[a]) out.skip.add(OPTIONAL[a]);
    else out.unknown.push(a);
  }
  return out;
}

/** Lê o marketplace da pasta de origem e confere que os plugins existem nela. */
function readSource(dir) {
  const file = path.join(dir, '.claude-plugin', 'marketplace.json');
  if (!fs.existsSync(file)) throw new Error(`não achei ${file}. Aponte a pasta do Habblaud com --origem <pasta> ou HABBLAUD_MOD_DIR (ela precisa ter .claude-plugin/marketplace.json e mod/).`);
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const names = (m.plugins ?? []).map((p) => p.name);
  const missing = PLUGINS.filter((p) => !names.includes(p));
  if (!m.name || missing.length) throw new Error(`${file} não lista o marketplace com os plugins esperados (faltam: ${missing.join(', ') || 'nome do marketplace'}).`);
  return m.name;
}

function json(claude, args) {
  const r = claude(args);
  if (r.status !== 0) throw new Error(`claude ${args.join(' ')} falhou (${r.status}): ${(r.stderr || r.stdout).trim()}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`não entendi a resposta de claude ${args.join(' ')}`);
  }
}

const state = (claude, market) => ({
  marketplace: json(claude, ['plugin', 'marketplace', 'list', '--json']).find((m) => m.name === market),
  installed: new Map(json(claude, ['plugin', 'list', '--json']).filter((p) => p.id.endsWith(`@${market}`)).map((p) => [p.id.split('@')[0], p])),
});

/** Executa o comando; devolve o código de saída. `claude` e `log` são injetáveis para teste. */
export function main(argv, { claude = runClaude, log = console.log } = {}) {
  const opts = parseArgs(argv);
  if (!['install', 'status', 'uninstall'].includes(opts.cmd) || opts.unknown.length || (opts.cmd !== 'install' && opts.skip.size)) {
    log('uso: node scripts/mod.mjs install|status|uninstall [--origem <pasta>] [--sem-permissoes] [--sem-mensagens]  (as opções --sem-* só no install)');
    return 2;
  }
  try {
    const ver = claude(['--version']);
    if (ver.status !== 0) throw new Error('não achei o `claude` no PATH (ou ele não abriu). Instale o Claude Code e tente de novo.');
    if (!atLeast(versionOf(ver.stdout), MIN_CLAUDE)) throw new Error(`Claude Code ${ver.stdout.trim()} é antigo: o mod pede ${MIN_CLAUDE.join('.')} ou mais novo.`);
    const market = readSource(opts.origem);
    const { marketplace, installed } = state(claude, market);
    const wanted = PLUGINS.filter((p) => !opts.skip.has(p));
    const mine = marketplace && marketplace.source === 'directory' && samePath(marketplace.path ?? '', opts.origem);

    if (opts.cmd === 'status') {
      log(`Claude Code ${ver.stdout.trim()}`);
      log(!marketplace ? `marketplace ${market}: não registrado` : `marketplace ${market}: ${mine ? 'ok' : 'OUTRA origem'} (${marketplace.path ?? marketplace.repo ?? marketplace.url ?? marketplace.source})`);
      for (const p of PLUGINS) log(`${p}@${market}: ${installed.has(p) ? (installed.get(p).enabled ? `instalado ${installed.get(p).version}` : 'instalado, desligado') : 'não instalado'}`);
      return 0;
    }

    if (opts.cmd === 'install') {
      if (marketplace && !mine) throw new Error(`o marketplace ${market} já existe e aponta para outra origem (${marketplace.path ?? marketplace.repo ?? marketplace.source}); não vou trocá-lo. Para usar esta pasta: claude plugin marketplace remove ${market} e rode de novo.`);
      if (!marketplace) {
        const r = claude(['plugin', 'marketplace', 'add', opts.origem, '--scope', 'user']);
        if (r.status !== 0) throw new Error(`não consegui registrar o marketplace: ${(r.stderr || r.stdout).trim()}`);
        log(`marketplace ${market}: registrado (${opts.origem})`);
      }
      for (const p of wanted) {
        if (installed.has(p)) {
          log(`${p}@${market}: já instalado, mantido`);
          continue;
        }
        const r = claude(['plugin', 'install', `${p}@${market}`, '--scope', 'user']);
        if (r.status !== 0) throw new Error(`não consegui instalar ${p}@${market}: ${(r.stderr || r.stdout).trim()}`);
        log(`${p}@${market}: instalado`);
      }
      log('Pronto. Abra uma sessão nova do Claude Code para carregar os plugins. Conferir: npm run mod:status · Desfazer: npm run mod:uninstall');
      return 0;
    }

    // uninstall: só os plugins deste marketplace; o marketplace sai apenas se for o nosso e não sobrar plugin dele.
    for (const p of PLUGINS) {
      if (!installed.has(p)) continue;
      const r = claude(['plugin', 'uninstall', `${p}@${market}`, '--scope', 'user']);
      if (r.status !== 0) throw new Error(`não consegui remover ${p}@${market}: ${(r.stderr || r.stdout).trim()}`);
      log(`${p}@${market}: removido`);
    }
    if (marketplace && mine) {
      const r = claude(['plugin', 'marketplace', 'remove', market, '--scope', 'user']);
      if (r.status !== 0) throw new Error(`não consegui remover o marketplace ${market}: ${(r.stderr || r.stdout).trim()}`);
      log(`marketplace ${market}: removido`);
    } else if (marketplace) log(`marketplace ${market}: aponta para outra origem, mantido`);
    else log(`marketplace ${market}: não estava registrado`);
    return 0;
  } catch (e) {
    log(`mod:${opts.cmd}: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2));
