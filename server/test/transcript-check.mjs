// Teste da leitura de respostas dos terminais (transcript .jsonl falso, só em pasta temporária).
// Roda com: node server/test/transcript-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-transcript-'));
Object.assign(process.env, { V2_HOME: tmp, V2_DATA: path.join(tmp, 'data') });
const { readReplies, findTranscript, redact } = await import('../core/transcript.mjs');

const SID = '11111111-2222-3333-4444-555555555555';
const dir = path.join(tmp, '.claude', 'projects', 'C--algum-lugar');
fs.mkdirSync(dir, { recursive: true });
const rec = (type, content, extra = {}) => JSON.stringify({ type, timestamp: '2026-10-18T10:00:00.000Z', message: { role: type, content }, ...extra });
const big = 'Linha longa. '.repeat(3000); // ~39 mil caracteres
const lines = [
  rec('user', 'faça a tarefa A'),
  rec('assistant', [{ type: 'thinking', thinking: 'segredo do raciocínio' }]),
  rec('assistant', [{ type: 'text', text: 'Vou olhar o arquivo.' }, { type: 'tool_use', id: 't1', name: 'Read', input: {} }]),
  rec('user', [{ type: 'tool_result', tool_use_id: 't1', content: 'CONTEÚDO DO ARQUIVO' }]),
  rec('assistant', [{ type: 'text', text: 'Resposta intermediária com token sk-ant-api03-ABCDEFGHIJKLMNOP e ANTHROPIC_API_KEY=abcdef123456.' }]),
  rec('assistant', [{ type: 'text', text: 'lado' }], { isSidechain: true }),
  rec('assistant', [{ type: 'text', text: big }]),
];
const file = path.join(dir, `${SID}.jsonl`);
fs.writeFileSync(file, lines.join('\n') + '\n');

// 1) terminal que terminou: texto final exato, sem raciocínio nem resultado de ferramenta, paginado
let r = readReplies(SID, { maxChars: 20000 });
assert.equal(r.ok, true); assert.equal(r.turno, 'concluido');
assert.equal(r.mensagens.length, 1);
assert.equal(r.mensagens[0].total_chars, big.length);
assert.equal(r.mensagens[0].texto, big.slice(0, 20000)); assert.equal(r.mensagens[0].truncado, true);
const r2 = readReplies(SID, { inicio: r.mensagens[0].proximo_inicio, maxChars: 20000 });
assert.equal(r.mensagens[0].texto + r2.mensagens[0].texto, big); assert.equal(r2.mensagens[0].truncado, false);

// 2) últimas N + pedidos; sidechain, thinking e tool_result ficam de fora; segredos omitidos
r = readReplies(SID, { ultimas: 3, pular: 1, incluirPedidos: true, maxChars: 60000 });
const todos = JSON.stringify(r);
assert.ok(!todos.includes('segredo do raciocínio') && !todos.includes('CONTEÚDO DO ARQUIVO') && !todos.includes('"lado"'));
assert.ok(!todos.includes('sk-ant-api03') && !todos.includes('abcdef123456')); assert.ok(r.segredos_omitidos >= 2);
assert.deepEqual(r.mensagens.map((m) => m.papel), ['pedido', 'agente', 'agente']);

// 3) em andamento: última coisa é uma ferramenta pendente; devolve o que já foi escrito
fs.appendFileSync(file, rec('assistant', [{ type: 'text', text: 'Agora rodo os testes.' }, { type: 'tool_use', id: 't2', name: 'Bash', input: {} }]) + '\n');
r = readReplies(SID);
assert.equal(r.turno, 'em_andamento'); assert.equal(r.mensagens[0].texto, 'Agora rodo os testes.');

// 4) id inválido / inexistente / tentativa de sair da pasta
assert.equal(findTranscript('../../etc/passwd'), null);
assert.equal(readReplies('99999999-2222-3333-4444-555555555555').ok, false);
assert.equal(redact('nada secreto aqui').count, 0);

// 5) chat: resposta longa com tabela é gravada e relida INTEIRA; só o resumo "Conversa até aqui" é cortado, e com aviso
const { pushMessage, history, transcript } = await import('../core/chat.mjs');
const tabela = '| Campo | Valor |\n|---|---|\n' + '| Pausa longa | Vazio, a pessoa preenche |\n'.repeat(120) + 'FIM-DA-RESPOSTA';
assert.ok(tabela.length > 3000);
pushMessage('ana', 'agent', tabela);
assert.equal(history('ana').at(-1).text, tabela);
const longa = 'Resposta de 4500+ caracteres.\n' + 'Linha de texto com várias palavras para encher. '.repeat(100) + 'FIM-DA-RESPOSTA';
pushMessage('ana', 'agent', longa);
assert.equal(history('ana').at(-1).text, longa); // a tela/arquivo guarda a resposta inteira
// histórico do prompt: mensagem do dono vai inteira; resposta antiga do agente só é resumida acima de 4000, em fronteira de linha
const dono = 'Pergunta do João. ' + 'Contexto importante que não pode sumir. '.repeat(100) + 'FIM-DO-DONO';
const resumo = transcript([{ who: 'user', text: dono }, { who: 'agent', text: longa }, { who: 'user', text: 'curta' }]);
assert.ok(resumo.includes(dono) && resumo.endsWith('Dono: curta'));
assert.ok(resumo.includes('resumida aqui') && !resumo.includes('FIM-DA-RESPOSTA'));
assert.ok(resumo.includes('Você: Resposta de 4500+ caracteres.\nLinha de texto'));
assert.ok(!/ [A-Za-z]{1,3}\n\[…resposta/.test(resumo)); // nada cortado no meio de palavra antes do aviso
// respostas curtas passam intactas; orçamento tira turno antigo por inteiro, nunca pela metade
const curtas = transcript([{ who: 'user', text: 'oi' }, { who: 'agent', text: 'olá' }]);
assert.equal(curtas, 'Dono: oi\n\nVocê: olá');
const muitos = Array.from({ length: 12 }, (_, i) => ({ who: 'user', text: `M${i} ` + 'x'.repeat(7000) }));
const orc = transcript(muitos);
assert.ok(orc.includes('M11 ') && !orc.includes('M0 ') && orc.length <= 24_000 + 8000 && orc.split('\n\n').every((l) => l.endsWith('x'.repeat(7000))));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('transcript-check: ok');
