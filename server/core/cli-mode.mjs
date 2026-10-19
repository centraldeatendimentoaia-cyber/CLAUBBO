// Modo de aprovação dos "Pedidos aos terminais": MANUAL (padrão) ou AUTOMÁTICO.
// O modo fica em data/cli-mode.json e sobrevive a recarregar a página e a reiniciar o servidor. Sem o arquivo (ou com
// qualquer coisa diferente de "auto" nele) o modo é MANUAL. Quem troca é o João, pelo botão da página: a rota exige a
// origem da página (bridge.mjs) e os agentes pensadores não têm ferramenta de arquivo.
// Mesmo no automático, pedidos que mencionam deploy, publicação, pagamento ou apagar/destruir dados continuam
// esperando o clique. A detecção é por palavras (melhor esforço): na dúvida, vai para o manual.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';
import { redact } from './transcript.mjs';

const modeFile = () => path.join(config.data, 'cli-mode.json');
let state = null; // { mode, since }, lido do arquivo na primeira vez que alguém pergunta
const current = () => {
  if (!state) {
    const saved = readJson(modeFile(), {});
    state = { mode: saved.mode === 'auto' ? 'auto' : 'manual', since: Number.isFinite(saved.since) ? saved.since : Date.now() };
  }
  return state;
};

export const getMode = () => ({ ...current() });
/** `who` = de onde veio a troca (ex.: "página, 127.0.0.1"): vai para o registro de trocas. */
export function setMode(next, who = '') {
  if (next !== 'manual' && next !== 'auto') return { ok: false, status: 400, error: 'modo inválido (use manual ou auto)' };
  const cur = current();
  if (next !== cur.mode) {
    const updated = { mode: next, since: Date.now() };
    try { writeJson(modeFile(), updated); } catch (e) { return { ok: false, status: 500, error: `não consegui salvar o modo: ${e.message}` }; }
    state = updated;
    logModeChange({ from: cur.mode, to: next, who });
  }
  return { ok: true, ...state };
}

const modeLogFile = () => path.join(config.data, 'cli-mode-log.jsonl');
/** Registro de cada troca de modo (só acrescenta): quem ligou ou desligou o automático e quando. */
function logModeChange(entry) {
  try {
    fs.mkdirSync(path.dirname(modeLogFile()), { recursive: true });
    fs.appendFileSync(modeLogFile(), JSON.stringify({ at: new Date().toISOString(), ...entry, who: String(entry.who || '').slice(0, 120) }) + '\n');
  } catch { /* o registro nunca impede a troca */ }
}

/** Últimas trocas de modo, da mais nova para a mais antiga. */
export function modeLog(limit = 50) {
  try {
    return fs.readFileSync(modeLogFile(), 'utf8').split('\n').filter(Boolean).slice(-limit).reverse().map((l) => JSON.parse(l));
  } catch { return []; }
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// "apagar" só conta com um alvo destrutivo (arquivo, pasta, banco, dados…) ou comando de shell: tarefas de código dizem
// "remova o conceito de limite" ou "salvando e excluindo" o tempo todo e isso não é apagar dados.
const SENSITIVE = [
  ['deploy / publicação', /\b(deploy\w*|depl[oi]y\w*|publicar|publique\w*|publicacao|publicando|publicad[oa]s?|publish\w*|go[- ]?live|lancar|lancamento|subir (?:para|pra|em|no|na) (?:producao|prod|o ar|site)|producao|production|prod\b|release|git\s+push|push\b|vercel|netlify)\b/],
  ['pagamento', /\b(pagament\w*|pagar|pague\w*|pgto|payment\w*|\bpay\b|cobranc\w*|cobrar|fatur\w*|boleto\w*|pix\b|cartao|credit card|checkout|stripe|paypal|transferenc\w*|comprar|compre\b|assinatura|reembols\w*|estorn\w*)\b/],
  ['apagar arquivos/dados', /\b((?:apag\w*|delet\w*|exclu\w*|remov\w*|remova\w*|destru\w*|limp(?:a|e|ar|ando)|zerar|zere|sobrescrev\w*|overwrite|wipe|purg\w*)\s+(?:[^\s,.;:!?()\n]+\s+){0,3}?(?:arquivos?|pastas?|diretorios?|bancos?|dados|repositorios?|branch(?:es)?|disco|backups?|historico|tabelas?|projetos?|logs?|tudo|node_modules|dist|data)|truncate|drop\s+table|drop\s+database|rm\s+-|rmdir|rimraf|unlink|del\s+\/|format(?:ar|e)\s+(?:o\s+)?(?:disco|hd|ssd|pc|drive)|reset\s+--hard|--force|force-push)\b/],
];
// Proibições ("Limites: não publicar, não fazer deploy, não apagar arquivos") não são pedido de ação e o Maestro as escreve
// em toda tarefa. Tira só o trecho "negador + até 2 palavras (sem vírgula/ponto) + termo sensível". Folga curta de propósito:
// "não deixe de fazer deploy" (3 palavras) NÃO é removido e continua indo para o manual.
// A proibição vale também para a lista que vem logo depois ("não faça push/deploy", "não publicar, deploy ou pagamento"),
// mas só para substantivos e infinitivos: "não faça deploy e pague o boleto" continua retido (pague é uma ordem).
const NEG = '(?:nao|nunca|jamais|sem|nem|proibido|evite|evitar)';
const LISTED = '(?:deploy\\w*|depl[oi]y\\w*|git\\s+push|push|publicacao|publicar|publicando|publish\\w*|producao|release|lancamento|lancar|pagamento\\w*|pagar|cobrar|apagar|deletar|excluir|remover|destruir)';
const LIST_TAIL = `(?:\\s*(?:[/,]|\\b(?:ou|e|nem)\\b)\\s*${LISTED}\\b)*`;
const NEGATED = SENSITIVE.map(([, re]) => new RegExp(`\\b${NEG}\\s+(?:[^\\s,.;:!?()\\n]+\\s+){0,2}?(?:${re.source})${LIST_TAIL}`, 'g'));
const withoutNegated = (t) => NEGATED.reduce((s, re) => s.replace(re, ' '), t);

/** Se o pedido exige clique do João mesmo no automático: { why, trecho } (o trecho que acionou o filtro); senão null. */
export function manualHit(text) {
  const t = withoutNegated(norm(text));
  for (const [why, re] of SENSITIVE) {
    const m = re.exec(t);
    if (m) return { why, trecho: m[0].trim().slice(0, 60) };
  }
  return null;
}

/** Devolve o motivo (string) se o pedido exige clique do João mesmo no automático; senão null. */
export const manualReason = (text) => manualHit(text)?.why ?? null;

const logFile = () => path.join(config.data, 'cli-auto-log.jsonl');
/** Registro de cada pedido entregue sem clique (só acrescenta; segredos óbvios omitidos). */
export function logAuto(entry) {
  const line = JSON.stringify({ ...entry, text: redact(entry.text).text, at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(logFile()), { recursive: true });
  fs.appendFileSync(logFile(), line + '\n');
}
