// Controle de acesso do servidor do Escritório: token por instalação, checagem de Host e confirmação humana.
//
//  - Dois tokens aleatórios nascem na primeira execução e ficam em data/acesso.json (fora dos backups, nunca no código nem em log):
//    `pagina` (a página do Escritório: cookie HttpOnly + SameSite=Strict, ou cabeçalho x-v2-token) vale para toda escrita;
//    `agentes` (cabeçalho x-v2-agente, lido pelo servidor MCP cli-agents) vale só para criar pedidos e propostas, que esperam aprovação.
//  - Host: só 127.0.0.1, localhost e [::1] com a porta configurada (barra o "DNS rebinding").
//  - Confirmação humana: aprovar algo que leva a código rodando na máquina abre uma janela do Windows no computador do servidor.
//    Um agente com o navegador (ferramenta chrome) consegue clicar na página, mas não nessa janela. O texto da janela é montado pelo
//    servidor a partir do estado dele, nunca do que veio na requisição.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const ACCESS_FILE = 'acesso.json';
const TOKEN = /^[0-9a-f]{64}$/;

/** Lê os tokens de data/acesso.json; sem arquivo (ou estragado) gera novos e grava de forma atômica. */
export function loadAccess(dataDir) {
  const file = path.join(dataDir, ACCESS_FILE);
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (TOKEN.test(j?.pagina) && TOKEN.test(j?.agentes)) return { pagina: j.pagina, agentes: j.agentes };
  } catch { /* primeira execução ou arquivo estragado */ }
  const t = { pagina: crypto.randomBytes(32).toString('hex'), agentes: crypto.randomBytes(32).toString('hex') };
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...t, criadoEm: new Date().toISOString() }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return t;
}

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
/** O nome leva a porta: cookies não são isolados por porta, e outro Escritório em 127.0.0.1 não pode sobrescrever o deste. */
export const cookieName = (port) => `v2_token_${port}`;
export const sessionCookie = (access, port) => `${cookieName(port)}=${access.pagina}; HttpOnly; SameSite=Strict; Path=/`;

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

/** Quem está chamando: 'pagina', 'agentes' ou null (sem token válido). */
export function roleOf(req, access, port) {
  const page = req.headers['x-v2-token'] || readCookie(req, cookieName(port));
  if (page && same(page, access.pagina)) return 'pagina';
  const agent = req.headers['x-v2-agente'];
  if (agent && same(agent, access.agentes)) return 'agentes';
  return null;
}

/** Host aceito: só o próprio computador, com a porta do servidor. */
export const hostAllowed = (host, port) => [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(String(host || '').toLowerCase());

// ---------------------------------------------------------------- confirmação humana
let open = false, lockedUntil = 0;
const LOCK_MS = 20_000;

/** Janela do Windows (WScript.Shell.Popup, sempre no topo, "Não" como padrão). Só "Sim" (6) vale; recusar ou deixar expirar vale como não. */
function popup(text, timeoutS) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$r=(New-Object -ComObject WScript.Shell).Popup($env:V2_DLG_TEXT,${timeoutS},'Claubbo: confirmar ação',4+48+256+4096); exit $r`],
      { windowsHide: true, env: { ...process.env, V2_DLG_TEXT: text }, timeout: (timeoutS + 15) * 1000 }, (err) => resolve(err?.code === 6));
  });
}

/**
 * Pede o "sim" de uma pessoa diante do computador. Devolve { ok: true } ou { ok: false, status, error }.
 * V2_CONFIRMACAO: `dialogo` (padrão), `sim` (SEM confirmação, só para testes) ou `nao`. `run` e `now` existem para teste.
 * Uma janela por vez; depois de um "não" (ou de expirar) o servidor espera 20 s antes de abrir outra, para uma página
 * insistente não virar enxurrada de janelas.
 */
export async function confirmHuman(text, { mode = process.env.V2_CONFIRMACAO || 'dialogo', timeoutS = 60, run = popup, now = Date.now, platform = process.platform } = {}) {
  if (mode === 'sim') return { ok: true };
  if (mode === 'nao') return { ok: false, status: 403, error: 'confirmação recusada (V2_CONFIRMACAO=nao)' };
  if (run === popup && platform !== 'win32') return { ok: false, status: 501, error: 'a confirmação por janela só existe no Windows; não há como aprovar neste sistema' };
  if (open) return { ok: false, status: 409, error: 'já há uma confirmação aberta no computador do servidor: responda a ela primeiro' };
  if (now() < lockedUntil) return { ok: false, status: 429, error: 'a última confirmação foi recusada ou expirou: espere alguns segundos antes de tentar de novo' };
  open = true;
  try {
    if (await run(String(text).slice(0, 900), timeoutS)) return { ok: true };
    lockedUntil = now() + LOCK_MS;
    return { ok: false, status: 403, error: 'a confirmação no computador foi recusada ou não foi respondida a tempo' };
  } finally { open = false; }
}

/** Só para teste: zera a trava depois de um "não". */
export const resetConfirm = () => { open = false; lockedUntil = 0; };

/** Aprovação que leva a código rodando, por um canal sem janela própria (Telegram): só segue se a pessoa disser "sim" na janela do Windows. Recusa devolve {ok:false,status,error}. */
export const humanGated = (approve, textOf, { confirm = confirmHuman, audit = () => {} } = {}) => async (id) => {
  const h = await confirm(textOf(id));
  audit(id, h);
  return h.ok ? approve(id) : { ok: false, status: h.status, error: h.error };
};
