import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// config.mjs lê o ambiente ao carregar: as pastas temporárias precisam existir antes do import do runner.
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-mcp-test-'));
const home = path.join(base, 'home'), data = path.join(base, 'data');
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'cli-agents': { command: 'node', env: { SEGREDO: 'abc' } } } }));
process.env.V2_HOME = home;
process.env.V2_DATA = data;
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

describe('mcpSubset: onde o arquivo com variáveis de ambiente dos servidores é gravado', () => {
  it('grava em data/run/mcp/, não em %TEMP%, com o AGENT_ID do agente', async () => {
    // @ts-expect-error módulo .mjs sem tipos
    const { mcpSubset } = await import('./runner.mjs');
    const file: string = mcpSubset(['cli-agents'], 'ana');
    expect(path.dirname(file)).toBe(path.join(data, 'run', 'mcp'));
    expect(path.basename(file)).toMatch(/^v2-mcp-\d+-\d+-\w+\.json$/);
    expect(path.dirname(file)).not.toBe(os.tmpdir());
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers['cli-agents'].env).toEqual({ SEGREDO: 'abc', AGENT_ID: 'ana' });
  });

  it('servidor que não está na configuração do usuário: devolve null e não cria arquivo', async () => {
    // @ts-expect-error módulo .mjs sem tipos
    const { mcpSubset } = await import('./runner.mjs');
    const before = fs.readdirSync(path.join(data, 'run', 'mcp')).length;
    expect(mcpSubset(['nao-existe'], 'ana')).toBeNull();
    expect(fs.readdirSync(path.join(data, 'run', 'mcp')).length).toBe(before);
  });
});

describe('data/run/mcp fica fora do git e do backup', () => {
  it('backup.mjs pula run/ inteiro', async () => {
    // @ts-expect-error módulo .mjs sem tipos
    const { createBackup } = await import('./backup.mjs');
    const b = createBackup(data, Date.parse('2026-10-19T12:00:00'));
    expect(fs.existsSync(path.join(data, 'backups', b.name, 'run'))).toBe(false);
  });

  it('.gitignore cobre data/', () => {
    expect(fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8').split(/\r?\n/)).toContain('data/');
  });
});
