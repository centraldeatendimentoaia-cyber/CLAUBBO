import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Confere o comando FINAL que o runner entrega ao Codex: o MCP cli-agents só sobe para quem tem a ferramenta, com o id do agente.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-codex-mcp-'));
const home = path.join(tmp, 'home');
const argsFile = path.join(tmp, 'args.json');
const recorder = path.join(tmp, 'codex-recorder.mjs');

let runTurn: (o: Record<string, unknown>) => Promise<unknown>;

beforeAll(async () => {
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex', 'auth.json'), '{}'); // só precisa existir (conteúdo nunca é lido)
  // Codex falso: `login status` confere o auth.json; `exec` grava os argumentos recebidos e a resposta no arquivo de -o.
  fs.writeFileSync(recorder, `import fs from 'node:fs';
const a = process.argv.slice(2);
if (a[0] === 'login') process.exit(fs.existsSync(process.env.CODEX_HOME + '/auth.json') ? 0 : 1);
fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(a));
process.stdin.resume();
process.stdin.on('end', () => { fs.writeFileSync(a[a.indexOf('-o') + 1], 'ok'); });
`);
  Object.assign(process.env, { V2_DATA: path.join(tmp, 'data'), V2_HOME: home, V2_CODEX_BIN: process.execPath, V2_CODEX_PRE: JSON.stringify([recorder]) });
  // @ts-expect-error módulo .mjs sem tipos
  ({ runTurn } = await import('./runner.mjs'));
});

async function run(agent: Record<string, unknown>): Promise<string[]> {
  fs.rmSync(argsFile, { force: true });
  await runTurn({ agent: { account: 'codex', ...agent }, prompt: 'oi' });
  return JSON.parse(fs.readFileSync(argsFile, 'utf8'));
}

describe('comando final do Codex: servidor MCP cli-agents', () => {
  it('com a ferramenta cli-agents: sobe o servidor deste repositório, com o id do agente e aprovação para o exec não travar', async () => {
    const args = await run({ id: 'jmal', tools: ['cli-agents', 'web'] });
    const cfg = args.filter((_, i) => args[i - 1] === '-c');
    expect(cfg).toContain('mcp_servers.cli-agents.command="node"');
    expect(cfg.some((c) => c.startsWith('mcp_servers.cli-agents.args=[') && c.endsWith('mcp-cli-agents.mjs\']'))).toBe(true);
    expect(cfg.some((c) => c.startsWith('mcp_servers.cli-agents.env=') && c.includes('AGENT_ID="jmal"'))).toBe(true);
    expect(cfg).toContain('mcp_servers.cli-agents.default_tools_approval_mode="approve"');
    expect(args).toContain('read-only'); // o sandbox continua só de leitura
  });

  it('id fora do padrão seguro vira "agente" (nada vindo do cadastro entra cru na configuração)', async () => {
    const args = await run({ id: 'x"}; rm', tools: ['cli-agents'] });
    expect(args.join(' ')).toContain('AGENT_ID="agente"');
    expect(args.join(' ')).not.toContain('rm');
  });

  it('sem a ferramenta cli-agents: nenhum servidor MCP é configurado', async () => {
    const args = await run({ id: 'ana', tools: ['web'] });
    expect(args.join(' ')).not.toContain('mcp_servers');
    expect(args).toContain('read-only');
  });
});
