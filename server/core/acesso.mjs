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
import { personByToken } from './equipe.mjs';

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
/** `lanHost` (IP da rede local, só no modo celular) também é aceito. */
export const hostAllowed = (host, port, lanHost = '') => [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, ...(lanHost ? [`${lanHost}:${port}`] : [])].includes(String(host || '').toLowerCase());

// ---------------------------------------------------------------- modo celular
// V2_LAN_HOST=<IP do computador no Wi-Fi> abre o servidor para a rede local, SÓ para leitura: quem vem de fora do computador precisa
// do token do celular (nasce a cada subida, vai no QR code), nunca recebe o token da página e não consegue escrever nada.
export const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
export const isLoopback = (addr) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(addr || ''));
export const phoneCookieName = (port) => `v2_cel_${port}`;
export const newPhoneToken = () => crypto.randomBytes(24).toString('hex');

/** Única escrita que o celular faz: aprovar ou recusar (tarefas, pedidos de terminal, propostas e chamadas de agentes, permissões). */
export const PHONE_WRITES = /^\/api\/(?:ops\/tasks|cli\/requests|agent-proposals|agent-calls)\/[^/]+\/(?:approve|reject)$|^\/api\/permissions\/[^/]+\/decision$|^\/api\/pendencias\/aprovar-seguros$|^\/api\/agentes\/[^/]+\/(?:modelo|obrigado|btw)$|^\/api\/jogos\/(?:desafio|[\w-]+\/jogada)$|^\/api\/equipe\/[^/]+\/personagem$|^\/api\/presenca(?:\/sair)?$/;

const CELULAR = { nome: 'celular', papel: 'dono' };

/** Decide uma requisição que veio da rede: 'deny' (com motivo), 'redirect' (primeira visita, grava o cookie e tira o token da URL) ou 'allow'. */
export function phoneGate(req, url, token, port, team) {
  const read = req.method === 'GET' || req.method === 'HEAD';
  const writeAll = process.env.V2_CELULAR_ESCRITA === '1'; // opt-in: o celular escreve como a página (só aprovar e recusar dispensam o "sim" no computador)
  const soAprovar = req.method === 'POST' && PHONE_WRITES.test(url.pathname);
  if (!read && !writeAll && !soAprovar) return { action: 'deny', status: 403, error: 'celular: só aprovar e recusar; o resto é somente leitura' };
  const given = read ? url.searchParams.get('t') : null; // escrita só vale com o cookie, nunca com o token na URL
  const who = (t) => (t && token && same(t, token) ? CELULAR : personByToken(team, t)); // o token do QR code vale como dono; o de uma pessoa, com o papel dela
  if (who(given)) {
    url.searchParams.delete('t');
    const clean = url.pathname + (url.search || '');
    return { action: 'redirect', location: clean, cookie: `${phoneCookieName(port)}=${given}; HttpOnly; SameSite=Strict; Path=/` };
  }
  const cookie = readCookie(req, phoneCookieName(port));
  const person = who(cookie);
  if (person && !read && !soAprovar && person.papel !== 'dono') return { action: 'deny', status: 403, error: 'celular: só o dono escreve fora de aprovar e recusar' }; // writeAll vale só para o token do dono
  if (person) return { action: 'allow', person };
  return { action: 'deny', status: 403, error: 'celular: abra o endereço pelo QR code mostrado no computador' };
}

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
