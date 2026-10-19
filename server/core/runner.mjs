// Executa um turno de um agente: `claude -p` ou `codex exec`, com a conta do agente, as ferramentas liberadas para ele
// e nada além disso. O prompt vai pelo stdin; a resposta volta como texto.
//
// Segurança dos agentes "pensadores": sem Bash, sem leitura/edição de arquivos e sem subagentes. Só as ferramentas
// MCP e da web que o agente tem em `tools`, e mesmo nelas as de escrita listadas em data/tool-rules.json ficam
// bloqueadas (criar, ativar, pausar, excluir, mudar orçamento). O que precisa sair da máquina passa por aprovação.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './config.mjs';
import { codexStatus, envFor, getAccount } from './accounts.mjs';
import { readJson } from './store.mjs';
import { recordUsage } from './usage.mjs';
import { budgetLeft, recordCost } from './costs.mjs';

const MODELS = new Set(['sonnet', 'opus', 'fable', 'haiku']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const SAFE_ARG = /^[\w.:/-]{1,64}$/;
/** Ferramentas do próprio Claude Code que os agentes pensadores nunca recebem. */
const BUILTIN_DENY = ['Bash', 'Edit', 'Write', 'NotebookEdit', 'Read', 'Glob', 'Grep', 'Agent', 'Task'];
/** Escritas conhecidas do MCP do Meta Ads (em qualquer servidor cujo nome comece com "meta-ads"): bloqueadas por padrão (data/tool-rules.json acrescenta ou tira). */
const META_WRITES = ['create_meta_campaign', 'activate_campaign', 'pause_campaign', 'delete_campaign', 'bulk_update_campaign_status', 'update_daily_budget', 'upload_ad_image'];
/** Pedido de envio pelo CRM: bloqueado em qualquer servidor e só liberado por tarefa (`allowOnce`), nunca por data/tool-rules.json. */
const SEND_TOOL = 'solicitar_envio';
const sendTool = (id) => `mcp__${id}__${SEND_TOOL}`;
const DEFAULT_DENY = [...META_WRITES.map((t) => `mcp__meta-ads__${t}`), sendTool('saiae-crm')];

export const toolId = (name) => String(name).replace(/[^A-Za-z0-9_-]+/g, '_');
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
/** Qualquer servidor cujo nome tenha "meta" e "ads" (meta-ads-lavi, ads-meta, Meta_Ads, "claude.ai Meta Ads"). */
const isMetaAds = (s) => { const k = norm(s.name ?? s.id); return k.includes('meta') && k.includes('ads'); };

/** O que o processo mostra na tela quando a execução falha, sem despejar a saída inteira. */
const tail = (s, n = 400) => String(s || '').trim().slice(-n);

// ---------------------------------------------------------------- servidores MCP conectados
let mcpCache = { at: 0, servers: [] };

let mcpRefresh = null;

/**
 * Servidores MCP do Claude Code (`claude mcp list`, que leva vários segundos porque confere cada servidor). Com cache, devolve
 * na hora o que já sabe e atualiza em segundo plano depois de um minuto; só espera quando não há nada guardado ou com `force`.
 */
export async function listMcpServers(force = false) {
  const fresh = Date.now() - mcpCache.at < 60_000;
  if (!force && fresh) return mcpCache.servers;
  if (!force && mcpCache.servers.length) {
    mcpRefresh ??= fetchMcp().finally(() => { mcpRefresh = null; });
    return mcpCache.servers;
  }
  return fetchMcp();
}

async function fetchMcp() {
  const out = await new Promise((resolve) => {
    let s = '';
    const p = spawn(config.claudeBin, [...config.claudePre, 'mcp', 'list'], { windowsHide: true });
    const t = setTimeout(() => p.kill(), 40_000);
    p.stdout.on('data', (d) => (s += d));
    p.on('close', () => { clearTimeout(t); resolve(s); });
    p.on('error', () => { clearTimeout(t); resolve(''); });
  });
  const servers = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^(.+?):\s+(\S.*?)\s+-\s+(.*)$/.exec(line.trim());
    if (m) servers.push({ name: m[1], id: toolId(m[1]), key: norm(m[1]), status: /connected|conectad/i.test(m[3]) && !/fail|need|auth/i.test(m[3]) ? 'connected' : 'unavailable' });
  }
  if (servers.length) mcpCache = { at: Date.now(), servers };
  return mcpCache.servers;
}

/** Ferramentas liberadas e bloqueadas para um agente, a partir de `agent.tools`. */
export function toolsFor(agent, servers, rules = readJson(path.join(config.data, 'tool-rules.json'), {})) {
  const allowed = [];
  const matched = [];
  let chrome = false;
  let web = false;
  for (const raw of agent.tools || []) {
    const t = norm(raw);
    if (!t) continue;
    if (t === 'web') { web = true; allowed.push('WebSearch', 'WebFetch'); continue; }
    if (['chrome', 'browser', 'claudeinchrome'].includes(t)) { chrome = true; allowed.push('mcp__claude-in-chrome__*'); continue; }
    // nome exato do servidor (o prefixo "claude.ai" dos conectores da conta é ignorado: "notion" = "claude.ai Notion")
    for (const s of servers) if (s.key === t || s.key === `claudeai${t}`) { allowed.push(`mcp__${s.id}__*`); matched.push(s.name); }
  }
  const perServer = servers.flatMap((s) => [sendTool(s.id), ...(isMetaAds(s) ? META_WRITES.map((t) => `mcp__${s.id}__${t}`) : [])]);
  const deny = [...BUILTIN_DENY, ...DEFAULT_DENY, ...perServer, ...(Array.isArray(rules.deny) ? rules.deny : [])]
    .filter((d) => d.endsWith(`__${SEND_TOOL}`) || !(Array.isArray(rules.allow) && rules.allow.includes(d)));
  if (allowed.some((t) => t.startsWith('mcp__'))) allowed.push('ToolSearch'); // ferramentas MCP chegam adiadas: o agente precisa carregá-las
  return { allowed: [...new Set(allowed)], denied: [...new Set(deny)], chrome, web, servers: [...new Set(matched)] };
}

/**
 * Arquivo temporário só com os servidores MCP do agente, tirados da configuração de usuário do Claude Code. Com
 * `--strict-mcp-config` o Claude carrega apenas esses (rápido e sem as corridas de conexão de todos os outros). O arquivo leva
 * as variáveis de ambiente dos servidores, então fica em pasta temporária e é apagado ao fim da execução. Devolve null
 * quando algum servidor do agente não está nesse arquivo (conectores da conta, como Notion): aí o Claude carrega tudo.
 */
function mcpSubset(names, agentId) {
  const user = readJson(path.join(config.home, '.claude.json'), {}).mcpServers || {};
  const pick = {};
  for (const n of names) {
    if (!user[n]) return null;
    // o cli-agents precisa saber quem está pedindo (propor_agente, chamar_agente)
    pick[n] = n === 'cli-agents' ? { ...user[n], env: { ...user[n].env, AGENT_ID: agentId || '' } } : user[n];
  }
  const file = path.join(os.tmpdir(), `v2-mcp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);
  fs.writeFileSync(file, JSON.stringify({ mcpServers: pick }), { mode: 0o600 });
  return file;
}

// ---------------------------------------------------------------- execução
const runDir = () => { const d = path.join(config.data, 'run'); fs.mkdirSync(d, { recursive: true }); return d; };

/**
 * Roda um turno. `agent` = { provider?, account?, model?, effort?, tools? }. Devolve { text, model, costUSD, denials }.
 * Lança Error com mensagem em português (conta sem login, tempo esgotado, erro da ferramenta).
 */
export async function runTurn({ agent, system, prompt, signal, timeoutMs = config.timeoutMs, dev, allowOnce, images }) {
  let account = getAccount(agent.account);
  if (!account) throw new Error(`conta "${agent.account}" não existe`);
  if (account.provider === 'codex' && account.state !== 'connected') {
    // o login pode estar fora do auth.json (chaveiro do sistema): quem decide é o próprio `codex login status`
    const st = await codexStatus(account, true);
    if (!st.installed) throw new Error('O Codex não está instalado neste computador. Instale com `npm i -g @openai/codex` (ou aponte CLAUBBO_CODEX_BIN para o programa) e depois rode `codex login` no terminal.');
    account = getAccount(agent.account);
  }
  if (account.state !== 'connected') throw new Error(`A conta ${account.name} (${account.provider === 'codex' ? 'Codex' : 'Claude'}) não está conectada. ${account.provider === 'codex' ? 'Rode `codex login` no terminal (entre com sua conta ChatGPT) ou clique em Conectar' : 'Conecte'} em Operações > Contas.`);
  const left = agent.id ? budgetLeft(agent.id) : null;
  if (left !== null && left <= 0) throw new Error('O limite de gasto de hoje deste agente foi atingido. Ele volta amanhã, ou aumente o limite em Operações > Empresa.');
  const provider = account.provider;
  const env = { ...process.env, ...envFor(account) };
  const cwd = dev ? dev.cwd : runDir();
  if (provider === 'codex') {
    if (dev) throw new Error('agentes que mexem em código precisam de uma conta do Claude (o Codex ainda não faz esse fluxo)');
    return runCodex({ agent, system, prompt, env, cwd, signal, timeoutMs, images });
  }
  let allowed, denied, chrome, names;
  if (dev) {
    // agente que mexe em código: só a pasta do projeto (cwd), sem web, sem Chrome, sem MCP; nunca commita nem sobe nada
    allowed = dev.stage === 'plan' ? DEV_READ : DEV_WRITE;
    denied = DEV_DENY;
    chrome = false;
    names = [];
  } else {
    const servers = await listMcpServers();
    ({ allowed, denied, chrome, servers: names } = toolsFor(agent, servers));
    // ferramentas que o dono liberou só para esta execução (depois de o agente pedir)
    if (allowOnce?.length) {
      allowed = [...allowed, ...allowOnce];
      denied = denied.filter((d) => !allowOnce.includes(d));
    }
  }
  const mcpFile = mcpSubset(names, agent.id);
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--setting-sources', 'project,local', chrome ? '--chrome' : '--no-chrome'];
  if (dev && dev.stage !== 'plan') args.push('--permission-mode', 'acceptEdits');
  if (MODELS.has(agent.model)) args.push('--model', agent.model);
  args.push('--effort', EFFORTS.has(agent.effort) ? agent.effort : 'low');
  if (system) args.push('--append-system-prompt', system);
  // com imagens, o texto e as figuras seguem juntos como uma mensagem em JSON no stdin
  const input = images?.length
    ? `${JSON.stringify({ type: 'user', message: { role: 'user', content: [...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } })), { type: 'text', text: prompt }] } })}\n`
    : prompt;
  if (images?.length) args.push('--input-format', 'stream-json');
  if (mcpFile) args.push('--strict-mcp-config', '--mcp-config', mcpFile);
  if (allowed.length) args.push('--allowedTools', ...allowed);
  if (denied.length) args.push('--disallowedTools', ...denied);
  let out;
  try {
    out = await exec(config.claudeBin, [...config.claudePre, ...args], { env, cwd, input, signal, timeoutMs, shell: false });
  } finally {
    if (mcpFile) fs.rm(mcpFile, { force: true }, () => {});
  }
  const { result: j, rate } = parseStream(out);
  if (rate) recordUsage(account.id, rate);
  if (!j) throw new Error(`resposta do Claude em formato inesperado: ${tail(out, 200)}`);
  if (j.is_error) throw new Error(String(j.result || 'o Claude devolveu um erro').slice(0, 300));
  recordCost(agent.id, j.total_cost_usd);
  return { text: String(j.result ?? '').trim(), model: Object.keys(j.modelUsage || {})[0] || agent.model || '', costUSD: j.total_cost_usd, denials: (j.permission_denials || []).map((d) => d.tool_name).filter(Boolean) };
}

/** Saída stream-json: uma linha JSON por evento. Interessam o `result` final e o último evento de limite de uso. */
export function parseStream(out) {
  let result = null;
  let rate = null;
  for (const line of String(out).split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (j.type === 'result') result = j;
    else if (j.type === 'rate_limit_event') rate = j.rate_limit_info?.unifiedWindows || rate;
  }
  return { result, rate };
}

/** Ferramentas dos agentes que mexem em código, por etapa. O commit é feito pelo escritório, só depois da aprovação. */
const DEV_READ = ['Read', 'Glob', 'Grep', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)'];
const DEV_WRITE = [...DEV_READ, 'Edit', 'Write', 'Bash(npm test:*)', 'Bash(npm run test:*)', 'Bash(npm run build:*)', 'Bash(npm run lint:*)', 'Bash(npm run check:*)', 'Bash(npx tsc:*)', 'Bash(npx vitest:*)', 'Bash(npx jest:*)'];
const DEV_DENY = [
  'Bash(git push:*)', 'Bash(git commit:*)', 'Bash(git reset:*)', 'Bash(git checkout:*)', 'Bash(git clean:*)', 'Bash(git stash:*)', 'Bash(rm:*)', 'Bash(del:*)', 'Bash(rd:*)', 'Bash(rmdir:*)',
  'Bash(curl:*)', 'Bash(wget:*)', 'Bash(ssh:*)', 'Bash(scp:*)', 'Bash(npm publish:*)', 'Bash(npx vercel:*)', 'Bash(vercel:*)', 'Bash(supabase:*)', 'WebFetch', 'WebSearch', 'Agent', 'Task',
];

async function runCodex({ agent, system, prompt, env, cwd, signal, timeoutMs, images }) {
  const outFile = path.join(os.tmpdir(), `v2-codex-${process.pid}-${Date.now()}.txt`);
  const args = ['exec', ...(images || []).flatMap((i) => ['-i', i.path]), '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-C', cwd, '-o', outFile];
  if (agent.model && SAFE_ARG.test(agent.model) && !MODELS.has(agent.model)) args.push('-m', agent.model);
  if (EFFORTS.has(agent.effort)) args.push('-c', `model_reasoning_effort="${agent.effort === 'xhigh' || agent.effort === 'max' ? 'high' : agent.effort}"`);
  args.push('-');
  const text = (system ? `${system}\n\n---\n\n` : '') + prompt;
  try {
    const out = await exec(config.codexBin, [...config.codexPre, ...args], { env, cwd, input: text, signal, timeoutMs, shell: process.platform === 'win32' && !path.isAbsolute(config.codexBin) });
    let reply = '';
    try { reply = fs.readFileSync(outFile, 'utf8').trim(); } catch { reply = tail(out, 4000); }
    return { text: reply, model: agent.model || 'codex', costUSD: undefined, denials: [] };
  } finally {
    fs.rm(outFile, { force: true }, () => {});
  }
}

function exec(bin, args, { env, cwd, input, signal, timeoutMs, shell }) {
  return new Promise((resolve, reject) => {
    // `codex` no Windows é um atalho .cmd do npm e precisa do cmd.exe. Todos os argumentos são montados aqui (nenhum texto
    // do usuário: o prompt vai pelo stdin).
    const quote = (a) => (/^[\w.:/\\=-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
    const p = shell
      ? spawn('cmd.exe', ['/d', '/s', '/c', `"${[bin, ...args].map(quote).join(' ')}"`], { env, cwd, windowsHide: true, windowsVerbatimArguments: true })
      : spawn(bin, args, { env, cwd, windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { p.kill(); reject(new Error('tempo esgotado: o agente não respondeu a tempo')); }, timeoutMs);
    const onAbort = () => { p.kill(); reject(new Error('cancelado')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(e.code === 'ENOENT' ? `não achei o programa "${bin}" no PATH${bin === config.codexBin ? ' (Codex: `npm i -g @openai/codex` ou defina CLAUBBO_CODEX_BIN)' : ''}` : e.message)); });
    p.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (code === 0) resolve(out);
      else reject(new Error(/login|log in|auth|credential|unauthorized|401/i.test(err + out) ? 'a conta pediu login: reconecte em Operações > Contas (Codex: rode `codex login` no terminal)' : `a ferramenta saiu com erro ${code}: ${tail(err || out)}`));
    });
    p.stdin.on('error', () => {});
    p.stdin.end(input);
  });
}
