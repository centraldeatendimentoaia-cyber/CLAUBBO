// Identidade por pessoa: cada pessoa da equipe tem o próprio token (64 hex, mostrado uma vez). O arquivo data/equipe.json guarda só o sha256 dele.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TEAM_FILE = 'equipe.json';
const NOME = /^[\p{L}\p{N} ._-]{1,40}$/u;
const PAPEIS = ['dono', 'equipe'];
const RESERVADOS = ['dono', 'celular', 'agentes']; // identidades do sistema na auditoria: ninguém da equipe pode usá-las
const chave = (nome) => String(nome ?? '').trim().normalize('NFKC').toLowerCase();
const valida = (p) => NOME.test(p?.nome) && PAPEIS.includes(p?.papel) && /^[0-9a-f]{64}$/.test(p?.hash);
const sha = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Lê data/equipe.json; arquivo ausente ou estragado = lista vazia. */
export function loadTeam(dataDir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dataDir, TEAM_FILE), 'utf8'));
    const pessoas = (Array.isArray(j?.pessoas) ? j.pessoas : []).filter(valida);
    return { pessoas: pessoas.map(({ nome, papel, hash }) => ({ nome, papel, hash })) };
  } catch { return { pessoas: [] }; } // no gate falha fechado
}

/** Leitura estrita para regravar: ausente = vazia; ilegível, estragado ou com linha inválida lança (nunca apaga a equipe). */
function readStrict(dataDir) {
  let txt;
  try { txt = fs.readFileSync(path.join(dataDir, TEAM_FILE), 'utf8'); } catch (e) { if (e?.code === 'ENOENT') return []; throw e; }
  const j = JSON.parse(txt);
  if (!Array.isArray(j?.pessoas) || !j.pessoas.every(valida)) throw new Error(`${TEAM_FILE} está estragado: conserte ou apague o arquivo à mão`);
  return j.pessoas;
}

/** Cadastra uma pessoa e devolve o token (só aqui ele existe em claro). Erro: { error }. Gravação atômica, modo 0600. */
export function addPerson(dataDir, nome, papel) {
  nome = String(nome ?? '').trim().normalize('NFKC');
  if (!NOME.test(nome)) return { error: 'nome inválido: use de 1 a 40 letras, números, espaço, ponto, hífen ou sublinhado' };
  if (!PAPEIS.includes(papel)) return { error: 'papel inválido: use dono ou equipe' };
  if (RESERVADOS.includes(chave(nome))) return { error: `${nome} é um nome reservado do sistema` };
  const pessoas = readStrict(dataDir);
  if (pessoas.some((p) => chave(p.nome) === chave(nome))) return { error: `já existe uma pessoa chamada ${nome}` };
  const token = crypto.randomBytes(32).toString('hex');
  const file = path.join(dataDir, TEAM_FILE);
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ pessoas: [...pessoas, { nome, papel, hash: sha(token) }] }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return { token };
}

/** Quem é o dono deste token, ou null. Compara os hashes em tempo constante. */
export function personByToken(team, token) {
  if (!token || typeof token !== 'string') return null;
  const h = Buffer.from(sha(token));
  let achada = null; // percorre todos, sem parar no primeiro acerto
  for (const p of team?.pessoas ?? []) if (p?.hash?.length === 64 && crypto.timingSafeEqual(h, Buffer.from(p.hash))) achada = { nome: p.nome, papel: p.papel };
  return achada;
}
