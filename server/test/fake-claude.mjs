// Claude falso para os testes: `mcp list` imprime servidores; o resto responde em JSON como o `claude -p --output-format json`.
import fs from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'mcp') {
  if (process.env.FAKE_MCP_LIST) { console.log(process.env.FAKE_MCP_LIST); process.exit(0); }
  console.log('meta-ads: node x.mjs - ✓ Connected\nclaude.ai Notion: https://x - ✓ Connected');
  process.exit(0);
}
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  if (process.env.FAKE_DELAY_MS) await new Promise((r) => setTimeout(r, Number(process.env.FAKE_DELAY_MS))); // testes de cancelamento: resposta lenta
  if (process.env.FAKE_ARGS_FILE) fs.writeFileSync(process.env.FAKE_ARGS_FILE, JSON.stringify(args)); // os testes conferem o comando final
  if (process.env.FAKE_FAIL) { console.error('boom'); process.exit(3); }
  const sys = args[args.indexOf('--append-system-prompt') + 1] || '';
  const first = input.split('\n').find((l) => l.trim()) || '';
  const cfg = process.env.CLAUDE_CONFIG_DIR || 'padrão';
  // etapa que pode editar (agente dev): o falso deixa uma mudança no projeto
  if (args.includes('--permission-mode')) fs.appendFileSync('feature.txt', 'linha nova\n');
  console.log(JSON.stringify({ type: 'system', subtype: 'init' }));
  console.log(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { utilization: 0.1, resetsAt: Math.floor(Date.now() / 1000) + 86400 } } } }));
  console.log(JSON.stringify({ type: 'result', is_error: false, result: `[claude] ${first.slice(0, 80)} | sys=${sys.length} | cfg=${cfg} | cwd=${process.cwd()} | recusado=${/recusou/.test(input) ? input.split('pediu: ')[1] : 'não'}`, total_cost_usd: 0.001, modelUsage: { 'fake-claude': {} }, permission_denials: [], args }));
});
