// Contas do Escritório v2: várias contas do Claude Code e do Codex. Guardamos só { id, nome, provedor, pasta }:
// o login fica na pasta da conta (CLAUDE_CONFIG_DIR ou CODEX_HOME), gerenciado pela própria ferramenta. Nunca lemos
// nem gravamos token; o estado "conectado" vem só da existência do arquivo de credenciais.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

const PROVIDERS = {
  claude: { label: 'Claude', defaultDir: () => path.join(config.home, '.claude'), officeDir: () => path.join(config.home, '.claude-office'), env: 'CLAUDE_CONFIG_DIR', credentials: '.credentials.json', login: () => `${config.claudeBin} auth login --claudeai`, color: '#7cc8ff' },
  codex: { label: 'Codex', defaultDir: () => path.join(config.home, '.codex'), officeDir: () => path.join(config.home, '.codex-office'), env: 'CODEX_HOME', credentials: 'auth.json', login: () => `${config.codexBin} login`, color: '#10a37f' },
};
const PALETTE = ['#e8a33d', '#d96ba0', '#9b7be8', '#46c2a8', '#e0654f', '#6aa8ff', '#b5c95a', '#f08a3c'];
const ID = /^[a-z0-9][a-z0-9-]{0,30}$/;
const MAX_EXTRA = 8;

const file = () => path.join(config.data, 'accounts.json');
/** Contas padrão: o login que já existe na máquina, uma por ferramenta. Nunca ficam no arquivo. */
const DEFAULTS = [
  { id: 'principal', name: 'Principal', provider: 'claude', letter: 'P', color: PROVIDERS.claude.color, configDir: '', principal: true },
  { id: 'codex', name: 'Codex', provider: 'codex', letter: 'X', color: PROVIDERS.codex.color, configDir: '', principal: true },
];

const extras = () => (readJson(file(), { accounts: [] }).accounts || []).filter((a) => ID.test(a.id) && PROVIDERS[a.provider]);

export function listAccounts() {
  return [...DEFAULTS, ...extras()].map((a) => {
    const cli = a.provider === 'codex' ? codexCli.get(dirOf(a)) : undefined;
    if (a.provider === 'codex' && Date.now() - (cli?.at ?? 0) > CODEX_TTL) void codexStatus(a).catch(() => {});
    return { ...a, state: stateOf(a), dir: dirOf(a), ...(cli ? { cli: { installed: cli.installed, loggedIn: cli.loggedIn } } : {}) };
  });
}

// ---------------------------------------------------------------- estado do Codex pelo próprio CLI
const CODEX_TTL = 30_000;
const codexCli = new Map(); // pasta da conta -> { at, installed, loggedIn }
const codexInflight = new Map();

/**
 * Pergunta ao Codex (`codex login status`) se há login, sem ler credencial nenhuma: só o código de saída conta e a saída é
 * descartada. Cobre também login guardado fora do auth.json (chaveiro do sistema). Nunca lança.
 */
export function codexStatus(a, force = false) {
  const dir = dirOf(a);
  const cached = codexCli.get(dir);
  if (!force && cached && Date.now() - cached.at < CODEX_TTL) return Promise.resolve(cached);
  if (codexInflight.has(dir)) return codexInflight.get(dir);
  const bin = config.codexBin;
  const p = new Promise((resolve) => {
    let out = '';
    let child;
    const done = (installed, loggedIn) => { clearTimeout(timer); resolve({ at: Date.now(), installed, loggedIn }); };
    const timer = setTimeout(() => { child?.kill(); done(true, false); }, 10_000);
    try {
      child = spawn(bin, [...config.codexPre, 'login', 'status'], { env: { ...process.env, CODEX_HOME: dir }, windowsHide: true, shell: process.platform === 'win32' && !path.isAbsolute(bin) });
    } catch { return done(false, false); }
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => done(e.code !== 'ENOENT', false));
    // no Windows com shell, "não encontrado" vira código 1 + mensagem do cmd.exe
    child.on('close', (code) => done(!(code !== 0 && /not recognized|n[ãa]o [ée] reconhecido|not found/i.test(out)), code === 0 && !/not logged|n[ãa]o est[áa] logado/i.test(out)));
  }).then((r) => { codexCli.set(dir, r); codexInflight.delete(dir); return r; });
  codexInflight.set(dir, p);
  return p;
}

/** Pasta do login da conta (a padrão da ferramenta quando a conta não tem pasta própria). */
export const dirOf = (a) => a.configDir || PROVIDERS[a.provider].defaultDir();

export const getAccount = (id) => listAccounts().find((a) => a.id === (id || 'principal'));

/** connected = a pasta tem o arquivo de credenciais da ferramenta (o conteúdo nunca é lido). */
export function stateOf(a) {
  const p = PROVIDERS[a.provider];
  if (a.provider === 'codex' && codexCli.get(dirOf(a))?.loggedIn) return 'connected';
  return fs.existsSync(path.join(dirOf(a), p.credentials)) ? 'connected' : 'disconnected';
}

/** Variáveis de ambiente que apontam o processo para o login da conta (vazio = login padrão). */
export function envFor(a) {
  if (!a?.configDir) return {};
  return { [PROVIDERS[a.provider].env]: a.configDir };
}

export function createAccount({ name, provider }) {
  const errors = [];
  const prov = PROVIDERS[provider];
  if (!prov) errors.push('provedor: use claude ou codex');
  const label = String(name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 24);
  if (!label) errors.push('dê um nome à conta');
  const list = extras();
  if (prov && list.filter((a) => a.provider === provider).length >= MAX_EXTRA) errors.push(`no máximo ${MAX_EXTRA} contas extras por ferramenta`);
  if (errors.length) return { ok: false, errors };
  const base = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'conta';
  let id = `${provider === 'codex' ? 'codex-' : ''}${base}`.slice(0, 31);
  const taken = new Set([...DEFAULTS, ...list].map((a) => a.id));
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`.slice(0, 31);
  const configDir = path.join(prov.officeDir(), id);
  fs.mkdirSync(configDir, { recursive: true });
  const account = { id, name: label, provider, letter: label[0].toUpperCase(), color: PALETTE[list.length % PALETTE.length], configDir };
  writeJson(file(), { accounts: [...list, account] });
  return { ok: true, account: { ...account, state: stateOf(account) } };
}

/** Só tira da lista: nunca apaga a pasta nem o login. `inUse` = ids de conta usados por agentes. */
export function removeAccount(id, inUse = []) {
  if (DEFAULTS.some((a) => a.id === id)) return { ok: false, status: 400, error: 'a conta padrão não pode ser removida' };
  const list = extras();
  if (!list.some((a) => a.id === id)) return { ok: false, status: 404, error: 'conta não encontrada' };
  if (inUse.includes(id)) return { ok: false, status: 409, error: 'há agentes usando esta conta: troque a conta deles antes' };
  writeJson(file(), { accounts: list.filter((a) => a.id !== id) });
  return { ok: true };
}

/**
 * Como abrir a janela de login de uma conta do Claude: cmd.exe direto (`start` cria a janela nova), sem PowerShell.
 * A pasta da conta vai por variável de ambiente (nada de caminho dentro da linha de comando) e só para contas extras:
 * a Principal nunca recebe CLAUDE_CONFIG_DIR. O PowerShell com `detached` nunca chegava a executar o comando.
 */
export function claudeLoginSpawn(a) {
  const bin = config.claudeBin;
  if (!/^[\w.:\\/-]+$/.test(bin)) return null;
  const env = { ...process.env, V2_LOGIN_DIR: dirOf(a), ...envFor(a) };
  const inner = `echo Pasta da conta: !V2_LOGIN_DIR! & ${[bin, ...config.claudePre.map(String)].join(' ')} auth login --claudeai`;
  return { file: 'cmd.exe', args: ['/d', '/c', `start "Login Claude" cmd.exe /v:on /k "${inner}"`], options: { env, detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true } };
}

/** Abre uma janela de terminal para o login da conta (a ferramenta abre o navegador). Windows apenas. */
export function startLogin(id) {
  const a = getAccount(id);
  if (!a) return { ok: false, status: 404, error: 'conta não encontrada' };
  if (process.platform !== 'win32') return { ok: false, status: 501, error: `abra um terminal e rode: ${a.configDir ? `${PROVIDERS[a.provider].env}="${a.configDir}" ` : ''}${PROVIDERS[a.provider].login()}` };
  if (a.provider === 'claude') {
    const l = claudeLoginSpawn(a);
    if (!l) return { ok: false, status: 500, error: 'o caminho do programa claude tem espaço ou símbolo: use um caminho simples em V2_CLAUDE_BIN' };
    const child = spawn(l.file, l.args, l.options);
    child.on('error', () => {});
    child.unref();
    return { ok: true, dir: dirOf(a) };
  }
  const set =a.configDir ? `set "${PROVIDERS[a.provider].env}=${a.configDir}"&& ` : '';
  const line = `${set}${PROVIDERS[a.provider].login()}`.replace(/'/g, "''");
  const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process cmd.exe -ArgumentList @('/k', '${line}')`], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
  return { ok: true };
}

/** Abre uma janela do cmd com o Claude Code na pasta dada (validada pelo chamador). Windows apenas. */
export function openClaudeTerminal(dir) {
  if (process.platform !== 'win32') return { ok: false, error: 'só no Windows' };
  const child = spawn('cmd.exe', ['/c', 'start', 'Claude', '/D', dir, 'cmd.exe', '/k', 'claude'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
  return { ok: true };
}
