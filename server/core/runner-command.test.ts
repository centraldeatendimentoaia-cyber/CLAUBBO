import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Confere o comando FINAL que o runner entrega ao Claude (um Claude falso grava os argumentos recebidos).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-cmd-'));
const home = path.join(tmp, 'home');
const argsFile = path.join(tmp, 'args.json');
const fake = path.join(__dirname, '..', 'test', 'fake-claude.mjs');
const LIST = ['meta-ads', 'ads-meta', 'Meta_Ads', 'claude.ai Meta Ads', 'saiae-crm', 'google-ads', 'claude.ai Notion'].map((n) => `${n}: node x.mjs - ✓ Connected`).join('\n');

let runTurn: (o: Record<string, unknown>) => Promise<unknown>;
let listMcpServers: (force?: boolean) => Promise<unknown>;

beforeAll(async () => {
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', '.credentials.json'), '{}'); // só precisa existir (conteúdo nunca é lido)
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'saiae-crm': { command: 'x' }, 'meta-ads': { command: 'x' } } }));
  Object.assign(process.env, {
    V2_DATA: path.join(tmp, 'data'), V2_HOME: home, V2_CLAUDE_BIN: process.execPath, V2_CLAUDE_PRE: JSON.stringify([fake]),
    FAKE_MCP_LIST: LIST, FAKE_ARGS_FILE: argsFile,
  });
  // @ts-expect-error módulo .mjs sem tipos
  ({ runTurn, listMcpServers } = await import('./runner.mjs'));
  await listMcpServers(true);
});

/** Roda um turno e devolve os argumentos que o Claude recebeu, separados em flags. */
async function run(tools: string[], allowOnce?: string[]) {
  fs.rmSync(argsFile, { force: true });
  await runTurn({ agent: { id: 'ana', account: 'principal', tools }, prompt: 'oi', allowOnce });
  const args: string[] = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
  const after = (flag: string) => {
    const i = args.indexOf(flag);
    if (i < 0) return [];
    const out: string[] = [];
    for (const a of args.slice(i + 1)) { if (a.startsWith('--')) break; out.push(a); }
    return out;
  };
  return { args, denied: after('--disallowedTools'), allowed: after('--allowedTools') };
}

const WRITES = ['create_meta_campaign', 'activate_campaign', 'pause_campaign', 'delete_campaign', 'bulk_update_campaign_status', 'update_daily_budget', 'upload_ad_image'];
const META_IDS = ['meta-ads', 'ads-meta', 'Meta_Ads', 'claude_ai_Meta_Ads'];

function expectBlocked(denied: string[]) {
  expect(denied).toContain('mcp__saiae-crm__solicitar_envio');
  for (const id of META_IDS) for (const w of WRITES) expect(denied).toContain(`mcp__${id}__${w}`);
  expect(denied).not.toContain('mcp__google-ads__create_meta_campaign');
}

describe('comando final do Claude: --disallowedTools', () => {
  it('com --mcp-config (servidores do agente no .claude.json)', async () => {
    const r = await run(['saiae-crm']);
    expect(r.args).toContain('--strict-mcp-config');
    expect(r.allowed).toContain('mcp__saiae-crm__*');
    expectBlocked(r.denied);
  });

  it('com mcpSubset null (conector da conta fora do .claude.json): carrega tudo, mas o bloqueio segue', async () => {
    const r = await run(['notion', 'saiae-crm']);
    expect(r.args).not.toContain('--strict-mcp-config');
    expect(r.args).not.toContain('--mcp-config');
    expectBlocked(r.denied);
  });

  it('sem --mcp-config útil e sem --allowedTools (agente sem ferramentas)', async () => {
    const r = await run([]);
    expect(r.args).not.toContain('--allowedTools');
    expectBlocked(r.denied);
  });

  it('só web: sem MCP, o bloqueio continua indo', async () => {
    const r = await run(['web']);
    expect(r.allowed).toEqual(expect.arrayContaining(['WebSearch', 'WebFetch']));
    expectBlocked(r.denied);
  });

  it('allowOnce com o nome exato libera só o solicitar_envio; curinga não libera', async () => {
    const exact = await run(['saiae-crm'], ['mcp__saiae-crm__solicitar_envio']);
    expect(exact.denied).not.toContain('mcp__saiae-crm__solicitar_envio');
    expect(exact.allowed).toContain('mcp__saiae-crm__solicitar_envio');
    expect(exact.denied).toContain('mcp__meta-ads__create_meta_campaign');
    const wild = await run(['saiae-crm'], ['mcp__saiae-crm__*']);
    expect(wild.denied).toContain('mcp__saiae-crm__solicitar_envio');
  });
});
