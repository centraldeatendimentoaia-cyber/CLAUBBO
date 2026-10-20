// Cérebro (cofre Obsidian): contexto enviado aos agentes, skills, lições e notas escritas pelo escritório.
// Orçamento de contexto fixo (config.context): poucas notas e poucos caracteres por execução; nota longa entra pelo resumo.
// Nada é apagado aqui: só se lê e se acrescentam notas novas.
import fs from 'node:fs';
import path from 'node:path';
import { companyContext } from './company.mjs';
import { config } from './config.mjs';

const RULES = [
  'Responda sempre em português, com a conclusão primeiro e sem inventar números, datas ou citações.',
  'Leia à vontade; só envie, publique, pague, apague ou altere algo fora desta máquina quando a tarefa pedir exatamente essa ação.',
  'Se faltar uma informação, diga o que falta em vez de supor.',
  'Ferramentas bloqueadas ou sem permissão: diga qual foi bloqueada e siga com o que for possível.',
];

/** Pasta do escritório dentro do cofre (skills, lições). */
export const BRAIN_DIR = 'Escritorio de Agentes';

const SKIP_DIR = new Set(['.obsidian', '.git', 'node_modules', 'Arquivo', 'chats', BRAIN_DIR]);
const meta = (name) => path.join(config.brain, '00-Meta', name);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const words = (s) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g) || []);

// ---------------------------------------------------------------- arquivos do cofre
let listCache = { at: 0, files: [] };

/** Notas .md do cofre (sem as pastas internas), em cache por 30 s. */
export function brainFiles() {
  if (Date.now() - listCache.at < 30_000) return listCache.files;
  const files = [];
  const walk = (dir, depth) => {
    if (files.length >= 600 || depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, depth + 1); } else if (/\.md$/i.test(e.name)) files.push(p);
    }
  };
  walk(config.brain, 0);
  listCache = { at: Date.now(), files };
  return files;
}

const read = (p, max = 20_000) => { try { return fs.readFileSync(p, 'utf8').slice(0, max); } catch { return ''; } };

/** Resumo de uma nota: o bloco "## Resumo" se houver; senão o começo (sem o front matter). */
function summary(text) {
  const m = /^##\s*Resumo\s*\n([\s\S]*?)(?=\n##\s|\s*$)/im.exec(text);
  if (m) return m[1].trim();
  return text.replace(/^---[\s\S]*?---\s*/, '').trim();
}

// ---------------------------------------------------------------- skills
const skillDirs = () => [path.join(config.brain, BRAIN_DIR, 'skills'), path.join(config.root, 'skills')];

/** Front matter simples: `chave: valor` e `chave: [a, b]`. */
export function parseSkill(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const meta = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([\w-]+):\s*(.*)$/.exec(line);
      if (!kv) continue;
      const v = kv[2].trim();
      meta[kv[1]] = v.startsWith('[') ? v.slice(1, v.lastIndexOf(']')).split(',').map((s) => s.trim()).filter(Boolean) : v;
    }
  }
  return { meta, body: (m ? m[2] : text).trim() };
}

export function listSkills() {
  const out = new Map();
  for (const dir of skillDirs()) {
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of names) {
      const f = e.isDirectory() ? path.join(dir, e.name, 'SKILL.md') : /\.md$/i.test(e.name) ? path.join(dir, e.name) : '';
      if (!f || !fs.existsSync(f)) continue;
      const { meta, body } = parseSkill(read(f, 12_000));
      const name = String(meta.name || e.name.replace(/\.md$/i, ''));
      if (!out.has(name)) out.set(name, { name, description: String(meta.description || ''), agents: Array.isArray(meta.agents) ? meta.agents : [], body });
    }
  }
  return [...out.values()];
}

/** Skills de um agente: as marcadas nele e as que citam o id dele em `agents`. */
export const skillsFor = (agent) => listSkills().filter((s) => (agent.skills || []).includes(s.name) || s.agents.includes(agent.id));

// ---------------------------------------------------------------- lições
const lessonFile = (id) => path.join(config.brain, BRAIN_DIR, 'feedback', `${id}.md`);

/** Regras aprendidas com os "revise:" do dono: uma linha cada, só as marcadas [regra] entram no contexto. */
export function lessonsFor(id, max = 10) {
  return read(lessonFile(id), 8000).split(/\r?\n/).filter((l) => /\[regra\]/i.test(l)).slice(-max).map((l) => l.replace(/^[-*]\s*/, ''));
}

export function addLesson(id, text, kind = 'regra') {
  const line = `- [${kind === 'pontual' ? 'pontual' : 'regra'}] ${String(text).replace(/\s+/g, ' ').trim().slice(0, 300)}\n`;
  fs.mkdirSync(path.dirname(lessonFile(id)), { recursive: true });
  fs.appendFileSync(lessonFile(id), line);
}

// ---------------------------------------------------------------- contexto de uma execução
/** System prompt do agente: regras fixas, identidade, brief, skills, regras aprendidas e notas relevantes. */
export function systemFor(agent, query = '') {
  const budget = config.context.maxChars;
  const parts = [`# Regras fixas\n${RULES.map((r) => `- ${r}`).join('\n')}`];
  parts.push(`# Quem você é\nVocê é ${agent.name}${agent.role ? `, ${agent.role}` : ''}.${agent.does ? ` ${agent.does}` : ''}`);
  const company = companyContext();
  if (company) parts.push(company);
  if (agent.brief) parts.push(`# Instruções fixas\n${agent.brief}`);
  for (const s of skillsFor(agent)) parts.push(`# Skill: ${s.name}\n${clip(s.body, 4000)}`);
  const lessons = lessonsFor(agent.id);
  if (lessons.length) parts.push(`# O que o dono já corrigiu\n${lessons.map((l) => `- ${l}`).join('\n')}`);
  let used = parts.join('\n\n').length;
  const notes = [];
  const index = read(meta('index.md'), 1500);
  const who = read(path.join(config.brain, 'CLAUDE.md'), 1500);
  const q = words(`${query} ${agent.role} ${agent.does}`);
  // passo 1: o MOC cuja linha no índice mais combina com o pedido; passo 2: só as notas linkadas por ele
  const mocs = [...index.matchAll(/\[\[(MOC-[^\]|#]+)\]\](?:\s*—\s*([^\n]*))?/g)]
    .map((m) => ({ name: m[1], score: [...words(`${m[1]} ${m[2] || ''}`)].filter((w) => q.has(w)).length }))
    .sort((a, b) => b.score - a.score);
  const mocName = mocs[0]?.score > 0 ? mocs[0].name : '';
  const byName = new Map(brainFiles().map((f) => [path.basename(f, '.md'), f]));
  const mocText = mocName && byName.has(mocName) ? read(byName.get(mocName), 1200) : '';
  const linked = [...mocText.matchAll(/\[\[([^\]|#]+)\]\]/g)].map((m) => byName.get(m[1])).filter(Boolean);
  const ledger = read(meta('numbers-ledger.md'), 800);
  for (const [title, text] of [['Mapa do cérebro', index], [mocName ? `Área: ${mocName}` : '', mocText], ['Números oficiais', ledger], ['Sobre o dono e o negócio', who]]) if (title && text.trim() && used + text.length < budget) { notes.push(`## ${title}\n${text.trim()}`); used += text.length; }
  const scored = (mocText ? linked : brainFiles())
    .map((f) => ({ f, score: [...words(path.basename(f, '.md') + ' ' + read(f, 3000))].filter((w) => q.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.context.maxNotes);
  for (const { f } of scored) {
    const text = clip(summary(read(f)), 1200);
    if (used + text.length > budget) break;
    notes.push(`## Nota: ${path.basename(f, '.md')}\n${text}`);
    used += text.length;
  }
  if (notes.length) parts.push(`# Cérebro (notas do dono)\n${notes.join('\n\n')}`);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------- notas novas
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'nota';
const today = () => new Date().toISOString().slice(0, 10);

function writeNote(dir, name, body) {
  const d = path.join(config.brain, dir);
  fs.mkdirSync(d, { recursive: true });
  let file = path.join(d, `${name}.md`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(d, `${name}-${i}.md`);
  fs.writeFileSync(file, body);
  listCache.at = 0;
  return file;
}

/** Tira chaves e tokens óbvios antes de gravar qualquer coisa no cofre. */
const mask = (s) => String(s).replace(/\b(?:sk|pk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{16,}/g, '[segredo]').replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [segredo]').replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[segredo]');
const oneLine = (s, n) => clip(mask(s).replace(/\s+/g, ' ').trim(), n);

/** Linha curta no 00-Meta/log.md (só acrescenta; guarda as últimas 300). */
function logLine(line) {
  const f = meta('log.md');
  const lines = read(f, 60_000).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) lines.push('# Registro');
  lines.push(`- ${today()} — ${line}`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${[lines[0], ...lines.slice(1).slice(-300)].join('\n')}\n`);
}

/** Link da nota nova na seção "## Recentes" de um MOC (mais nova primeiro, no máximo 12, sem repetir). */
function mocRecent(rel, line) {
  const f = path.join(config.brain, rel);
  if (!fs.existsSync(f)) return;
  const [head, rest = ''] = read(f, 20_000).split('\n## Recentes');
  const items = [line, ...rest.split(/\r?\n/).filter((l) => l.startsWith('- ') && l !== line)].slice(0, 12);
  fs.writeFileSync(f, `${head.trimEnd()}\n\n## Recentes\n${items.join('\n')}\n`);
}

const stem = (file) => path.basename(file, '.md');

/** Entrega de uma tarefa como nota atômica em Entregas/, com resumo no topo, e uma linha no log e no MOC de entrega. */
export function writeDelivery({ agent, title, text }) {
  const body = mask(text);
  const resumo = oneLine(body, 280);
  const file = writeNote('Entregas', `${today()}-${slug(title)}`, `---\nagente: ${agent.id}\ndata: ${today()}\n---\n# ${title}\n\n## Resumo\n${resumo}\n\n## Detalhes\n${body}\n\nFeito por [[${agent.name}]].\n`);
  logLine(`[[${stem(file)}]] — ${agent.name}: ${oneLine(title, 80)}`);
  mocRecent('70-Delivery/MOC-Delivery.md', `- [[${stem(file)}]] — ${oneLine(title, 80)}`);
  return file;
}

/** Ata de reunião em Reunioes/, com links para os participantes, e uma linha no log e no MOC de operações. */
export function writeMinutes({ objective, participants, text }) {
  const body = mask(text);
  const file = writeNote('Reunioes', `${today()}-${slug(objective)}`, `---\ndata: ${today()}\nparticipantes: [${participants.map((p) => p.id).join(', ')}]\n---\n# ${objective}\n\n## Resumo\n${oneLine(body, 280)}\n\n## Detalhes\nParticipantes: ${participants.map((p) => `[[${p.name}]]`).join(', ')}\n\n${body}\n`);
  logLine(`[[${stem(file)}]] — reunião: ${oneLine(objective, 80)}`);
  mocRecent('90-Operations/MOC-Operations.md', `- [[${stem(file)}]] — reunião: ${oneLine(objective, 80)}`);
  return file;
}
