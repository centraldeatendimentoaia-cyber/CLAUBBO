// Lê as respostas de um terminal do Claude Code direto do transcript da sessão (~/.claude/projects/*/<sessionId>.jsonl).
// Só leitura: nada é gravado nem copiado. Só o TEXTO que o agente escreveu (blocos "text" do assistente) e os pedidos
// digitados pelo usuário; resultados de ferramentas, raciocínio e arquivos lidos nunca saem daqui.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { listAccounts } from './accounts.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAIL_BYTES = 24 * 1024 * 1024; // transcripts enormes: lê só o final (a resposta mais recente está lá)
export const MAX_CHARS_LIMIT = 60_000;
export const DEFAULT_CHARS = 20_000;

/** Pastas de configuração do Claude onde procurar a sessão: a padrão e a de cada conta Claude extra. */
export function claudeDirs() {
  const dirs = [path.join(config.home, '.claude')];
  for (const a of listAccounts()) if (a.provider === 'claude' && a.configDir) dirs.push(a.configDir);
  return [...new Set(dirs)];
}

/** Caminho do .jsonl da sessão ou null. O id é validado como UUID (nada de ../ no caminho). */
export function findTranscript(sessionId, dirs = claudeDirs()) {
  if (!UUID.test(String(sessionId || ''))) return null;
  for (const d of dirs) {
    const proj = path.join(d, 'projects');
    let subs;
    try { subs = fs.readdirSync(proj); } catch { continue; }
    for (const s of subs) {
      const f = path.join(proj, s, `${sessionId}.jsonl`);
      if (fs.existsSync(f)) return f;
    }
  }
  return null;
}

function readTail(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size, start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1); // descarta a linha cortada
    return text;
  } finally { fs.closeSync(fd); }
}

// Segredos óbvios nunca são devolvidos (o texto de um terminal pode ter eco de .env, tokens, senhas).
const SECRETS = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g, /\bsk-[A-Za-z0-9]{20,}/g, /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}/g, /github_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g, /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, /\bAIza[0-9A-Za-z_-]{30,}/g, /\bEAA[A-Za-z0-9]{40,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g,
];
const KEYVAL = /\b((?:[A-Za-z0-9_]*(?:password|passwd|senha|secret|token|api[_-]?key))\s*[:=]\s*)(["']?)([^\s"']{6,})\2/gi;
export function redact(text) {
  let n = 0, out = String(text);
  for (const re of SECRETS) out = out.replace(re, () => { n++; return '[segredo omitido]'; });
  out = out.replace(KEYVAL, (_, k) => { n++; return `${k}[segredo omitido]`; });
  return { text: out, count: n };
}

/**
 * Mensagens do terminal em ordem cronológica: { papel: 'agente'|'pedido', at, texto }.
 * 'agente' = um bloco de texto escrito pelo assistente (o que aparece no terminal); 'pedido' = o que o usuário digitou.
 * `turnoConcluido` = a última coisa no transcript é texto do agente sem ferramenta pendente depois dele.
 */
export function parseTranscript(text) {
  const msgs = [];
  let pending = false; // houve tool_use depois do último texto do agente
  let lastKind = null;
  for (const line of text.split('\n')) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.isSidechain || (r.type !== 'assistant' && r.type !== 'user')) continue;
    const c = r.message?.content, at = r.timestamp ? Date.parse(r.timestamp) : null;
    if (r.type === 'user') {
      if (r.isMeta) continue;
      const t = typeof c === 'string' ? c : Array.isArray(c) && !c.some((b) => b.type === 'tool_result') ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
      if (t.trim() && !/^<(command-|local-command|system-reminder)/.test(t.trim())) { msgs.push({ papel: 'pedido', at, texto: t }); pending = false; lastKind = 'pedido'; }
      continue;
    }
    if (!Array.isArray(c)) continue;
    const t = c.filter((b) => b.type === 'text' && b.text?.trim()).map((b) => b.text).join('\n');
    if (t) { msgs.push({ papel: 'agente', at, texto: t }); pending = false; lastKind = 'agente'; }
    if (c.some((b) => b.type === 'tool_use')) pending = true;
  }
  return { msgs, turnoConcluido: lastKind === 'agente' && !pending };
}

/**
 * Lê respostas de uma sessão. `ultimas` mensagens do agente (padrão 1) depois de pular `pular` mais recentes.
 * `inicio` (só com ultimas=1) pagina por caracteres uma resposta grande; `maxChars` limita o total devolvido.
 */
export function readReplies(sessionId, { ultimas = 1, pular = 0, inicio = 0, maxChars = DEFAULT_CHARS, incluirPedidos = false } = {}, dirs) {
  const file = findTranscript(sessionId, dirs);
  if (!file) return { ok: false, status: 404, error: 'transcript da sessão não encontrado' };
  const n = Math.min(20, Math.max(1, Math.floor(Number(ultimas)) || 1));
  const skip = Math.max(0, Math.floor(Number(pular)) || 0);
  const budget = Math.min(MAX_CHARS_LIMIT, Math.max(500, Math.floor(Number(maxChars)) || DEFAULT_CHARS));
  const { msgs, turnoConcluido } = parseTranscript(readTail(file));
  const pool = incluirPedidos ? msgs : msgs.filter((m) => m.papel === 'agente');
  const end = pool.length - skip, sel = pool.slice(Math.max(0, end - n), Math.max(0, end));
  let left = budget, redigidos = 0, cortouPorOrcamento = false;
  const out = [];
  for (let i = sel.length - 1; i >= 0; i--) { // do mais recente para o mais antigo
    const { text, count } = redact(sel[i].texto);
    if (left <= 0) { cortouPorOrcamento = true; break; }
    const from = sel.length === 1 ? Math.max(0, Math.floor(Number(inicio)) || 0) : 0;
    const pedaco = text.slice(from, from + left);
    const fim = from + pedaco.length;
    left -= pedaco.length; redigidos += count;
    out.unshift({ papel: sel[i].papel, em: sel[i].at ? new Date(sel[i].at).toISOString() : null, texto: pedaco, total_chars: text.length, inicio: from, fim,
      truncado: fim < text.length, ...(fim < text.length ? { proximo_inicio: fim } : {}) });
  }
  return { ok: true, turno: turnoConcluido ? 'concluido' : 'em_andamento', total_mensagens: pool.length, mensagens: out,
    mais_antigas: end - sel.length > 0 || cortouPorOrcamento, ...(redigidos ? { segredos_omitidos: redigidos } : {}) };
}

/**
 * Última resposta escrita pelo agente numa janela [desdeMs, ateMs) — usada para devolver ao remetente o que o terminal
 * respondeu a um pedido. `concluido` = o turno terminou (sem ferramenta pendente; com `ateMs`, outro pedido já veio depois).
 */
export function lastReplySince(sessionId, desdeMs, ateMs = null, dirs) {
  const file = findTranscript(sessionId, dirs);
  if (!file) return { ok: false, error: 'transcript da sessão não encontrado' };
  const { msgs, turnoConcluido } = parseTranscript(readTail(file));
  const mine = msgs.filter((m) => m.papel === 'agente' && m.at && m.at >= desdeMs && (ateMs === null || m.at < ateMs));
  if (!mine.length) return { ok: true, texto: '', concluido: false };
  return { ok: true, texto: mine.at(-1).texto, concluido: ateMs !== null ? true : turnoConcluido, mensagens: mine.length };
}
