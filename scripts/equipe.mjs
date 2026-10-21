// node scripts/equipe.mjs add <nome> [equipe|dono]  |  node scripts/equipe.mjs list
// Cadastra pessoas da equipe em data/equipe.json. O token aparece uma única vez, no add; o list nunca mostra tokens.
import { config } from '../server/core/config.mjs';
import { addPerson, loadTeam } from '../server/core/equipe.mjs';

const [cmd, nome, papel = 'equipe'] = process.argv.slice(2);
if (cmd === 'add' && nome) {
  let r;
  try { r = addPerson(config.data, nome, papel); } catch (e) { r = { error: e.message }; }
  if (r.error) { console.error(r.error); process.exit(1); }
  const porta = process.env.BRIDGE_PORT || 4530;
  console.log(`${nome} (${papel}) cadastrada. Guarde o endereço agora, o token não será mostrado de novo:`);
  console.log(`http://${process.env.V2_LAN_HOST || '<V2_LAN_HOST>'}:${porta}/?t=${r.token}`);
} else if (cmd === 'list') {
  for (const p of loadTeam(config.data).pessoas) console.log(`${p.nome}\t${p.papel}`);
} else {
  console.error('uso: node scripts/equipe.mjs add <nome> [equipe|dono]  |  node scripts/equipe.mjs list');
  process.exit(1);
}
