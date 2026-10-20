// Retorno automático: quando um agente de terminal termina um pedido que um agente do Escritório mandou (ex.: Maestro Dev),
// a resposta final volta sozinha ao remetente como nova mensagem e o acorda (novo turno). Respostas longas vão como resumo +
// caminho do arquivo com o texto completo. Cada entrega fica em data/cli-retorno-log.jsonl. Para impedir laço infinito e
// custo sem fim há dois limites de despertares, contados POR AGENTE (um agente que acorda muito não gasta a vez dos outros):
//  - rajada: no máximo 5 em 10 minutos (V2_RETORNO_RAJADA); é o freio contra repetição (pedir, receber, pedir de novo);
//  - noite: no máximo 100 (V2_RETORNO_LIMITE; "noite" = das 06:00 às 06:00), teto de custo.
// Acima de um limite o retorno é entregue ao histórico mas não acorda ninguém, e o log diz qual limite barrou e para quem.
// Os limites são contados a partir do próprio log, então reiniciar o app não zera. Só variável de ambiente os muda.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { redact } from './transcript.mjs';

const MAX_AGE_MS = 12 * 3600_000; // sem resposta em 12 h: desiste
const INLINE_CHARS = 3000; // até aqui a resposta vai inteira na mensagem
const SUMMARY_CHARS = 1200;
const IDLE_POLLS = 2; // o terminal precisa ser visto ocioso em verificações seguidas (evita pegar pausa entre ferramentas)

const envInt = (name, def) => { const n = Number(process.env[name]); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def; };
export const limitPerNight = () => envInt('V2_RETORNO_LIMITE', 100);
export const limitBurst = () => envInt('V2_RETORNO_RAJADA', 5);
export const BURST_MS = 10 * 60_000;
const pad = (n) => String(n).padStart(2, '0');
export const nightKey = (ms) => { const d = new Date(ms - 6 * 3600_000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const logFile = () => path.join(config.data, 'cli-retorno-log.jsonl');
export const filesDir = () => path.join(config.data, 'run', 'respostas');

export function readLog() {
  try { return fs.readFileSync(logFile(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
/** Despertares da noite atual; com `para`, só os desse agente. */
export function wakesTonight(nowMs, para) {
  const k = nightKey(nowMs);
  return readLog().filter((e) => e.acordou && (para === undefined || e.para === para) && nightKey(Date.parse(e.at)) === k).length;
}
/** Despertares desse agente nos últimos `janelaMs` (padrão 10 min). */
export function wakesRecent(nowMs, para, janelaMs = BURST_MS) {
  return readLog().filter((e) => { const t = Date.parse(e.at); return e.acordou && e.para === para && t > nowMs - janelaMs && t <= nowMs; }).length;
}
/**
 * Pode acordar `para` agora? { wake: true } ou { wake: false, limite: 'noite' | 'rajada', max, motivo }.
 * `limites` ({ noite, rajada }) só existe para teste; o padrão vem das variáveis de ambiente. Valor 0 bloqueia tudo.
 */
export function wakeDecision(para, nowMs, limites = {}) {
  const noite = limites.noite ?? limitPerNight(), rajada = limites.rajada ?? limitBurst();
  if (wakesTonight(nowMs, para) >= noite) return { wake: false, limite: 'noite', max: noite, motivo: `limite de ${noite} despertares por noite atingido para ${para}` };
  if (wakesRecent(nowMs, para) >= rajada) return { wake: false, limite: 'rajada', max: rajada, motivo: `limite de ${rajada} despertares em ${BURST_MS / 60_000} min atingido para ${para} (freio contra repetição)` };
  return { wake: true };
}
function logReturn(entry) {
  fs.mkdirSync(path.dirname(logFile()), { recursive: true });
  fs.appendFileSync(logFile(), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

/** Corte em fronteira de parágrafo/linha/frase (nunca no meio de palavra). */
function summarize(text) {
  if (text.length <= SUMMARY_CHARS) return text;
  const head = text.slice(0, SUMMARY_CHARS);
  const at = Math.max(head.lastIndexOf('\n\n'), head.lastIndexOf('\n'), head.lastIndexOf('. '));
  return (at > SUMMARY_CHARS / 2 ? head.slice(0, at + 1) : head.slice(0, head.lastIndexOf(' '))).trimEnd() + ' […]';
}

/** Texto da mensagem entregue ao remetente. A resposta é conteúdo de outro agente: vem rotulada, sem valer como ordem. */
export function buildMessage({ item, text, file }) {
  const head = `[Retorno automático · pedido ${item.id} · terminal ${item.agentName}]`;
  if (text.length <= INLINE_CHARS) return `${head}\n${text}`;
  return `${head}\nA resposta é longa (${text.length} caracteres). Resumo:\n${summarize(text)}\n\nTexto completo em: ${file}\n(Também dá para ler com ler_resposta_agente_cli, agente "${item.agentId}".)`;
}

function saveFull(item, text) {
  fs.mkdirSync(filesDir(), { recursive: true });
  const file = path.join(filesDir(), `retorno-${item.id}.md`).split(path.sep).join('/');
  fs.writeFileSync(file, `# Resposta do terminal ${item.agentName} ao pedido ${item.id}\n\nPedido de: ${item.from}\n\n---\n\n${text}\n`);
  return file;
}

/** Marca o pedido recém-entregue ao terminal para acompanhar a resposta (só se quem pediu é agente do Escritório). */
export function track(item, isOfficeAgent) {
  if (item.state === 'sent' && isOfficeAgent(item.from)) { item.retorno = 'aguardando'; item.sentAt = Date.now(); }
}

const idleSeen = new Map(); // pedido -> verificações ociosas seguidas
let running = false;

/**
 * Uma verificação. Injeção de dependências para teste:
 *  requests: lista (cliRequests); agents: agentes de terminal do snapshot; read(sessionId, desde, ate) -> lastReplySince;
 *  deliver(to, text, meta, wake) -> entrega ao remetente; save(); now() em ms.
 */
export async function tick({ requests, agents, read, deliver, save, now = Date.now, limites }) {
  if (running) return; running = true;
  try {
    const waiting = requests.filter((r) => r.retorno === 'aguardando').sort((a, b) => a.sentAt - b.sentAt);
    for (const item of waiting) {
      if (now() - item.sentAt > MAX_AGE_MS) { item.retorno = 'sem_retorno'; save(); logReturn({ pedidoId: item.id, de: item.agentName, para: item.from, resultado: 'sem_retorno (12 h)' }); continue; }
      if (waiting.some((o) => o !== item && o.agentId === item.agentId && o.sentAt < item.sentAt)) continue; // um pedido por terminal de cada vez
      const a = agents.find((x) => x.id === item.agentId);
      if (!a || a.status !== 'idle' || !a.sessionId) { idleSeen.delete(item.id); continue; }
      const n = (idleSeen.get(item.id) || 0) + 1; idleSeen.set(item.id, n);
      if (n < IDLE_POLLS) continue;
      const next = waiting.find((o) => o !== item && o.agentId === item.agentId && o.sentAt > item.sentAt);
      const r = read(a.sessionId, item.sentAt - 1000, next ? next.sentAt - 1000 : null);
      if (!r.ok || !r.texto || !r.concluido) continue;
      const text = redact(r.texto).text;
      const file = text.length > INLINE_CHARS ? saveFull(item, text) : '';
      const d = wakeDecision(item.from, now(), limites), wake = d.wake;
      const res = deliver(item.from, buildMessage({ item, text, file }), { pedidoId: item.id, agente: item.agentName, ...(wake ? {} : { motivo: d.motivo }) }, wake);
      idleSeen.delete(item.id);
      item.retorno = res.ok ? (wake ? 'entregue' : 'entregue_sem_acordar') : 'falhou';
      item.retornoAt = now(); save();
      logReturn({ pedidoId: item.id, de: item.agentName, para: item.from, chars: text.length, ...(file ? { arquivo: file } : {}), acordou: !!(res.ok && wake), resultado: item.retorno,
        ...(!wake ? { limite: d.limite, max: d.max, motivo: d.motivo } : {}) });
    }
  } finally { running = false; }
}
