// Codex falso: `login status` confere o auth.json da pasta (CODEX_HOME); `exec` lê o prompt do stdin e grava a resposta no arquivo de -o.
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
if (args[0] === 'login' && args[1] === 'status') {
  const logged = fs.existsSync(path.join(process.env.CODEX_HOME || '', 'auth.json'));
  console.log(logged ? 'Logged in using ChatGPT' : 'Not logged in');
  process.exit(logged ? 0 : 1);
}
if (process.env.FAKE_CODEX_AUTH_FAIL) { console.error('401 Unauthorized: please log in again'); process.exit(1); }
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const out = args[args.indexOf('-o') + 1];
  const first = input.split('\n').find((l) => l.trim()) || '';
  fs.writeFileSync(out, `[codex] ${first.slice(0, 80)} | home=${process.env.CODEX_HOME || 'padrão'}`);
});
