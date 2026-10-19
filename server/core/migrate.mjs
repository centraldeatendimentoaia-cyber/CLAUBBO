// Traz os dados do Escritório antigo (D:\escritorio\data) para o v2 na primeira vez: agentes, contas extras do Claude e
// conversas. Só copia o que ainda não existe no v2 e nunca altera nem apaga nada do antigo.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { readJson, writeJson } from './store.mjs';

const OLD = process.env.V2_OLD_DATA || 'D:\\escritorio\\data';

export function migrateFromOld() {
  const moved = [];
  const copyIfMissing = (name, transform) => {
    const to = path.join(config.data, name);
    const from = path.join(OLD, name);
    if (fs.existsSync(to) || !fs.existsSync(from)) return;
    const data = transform(readJson(from, null));
    if (data) {
      writeJson(to, data);
      moved.push(name);
    }
  };
  copyIfMissing('agents.json', (d) => (d && Array.isArray(d.agents) ? { version: 1, agents: d.agents.map(({ lead, ...a }) => ({ ...a, lead: lead === true })) } : null));
  copyIfMissing('accounts.json', (d) => (d && Array.isArray(d.accounts) ? { accounts: d.accounts.map((a) => ({ id: a.id, name: a.name, provider: 'claude', letter: a.letter, color: a.color, configDir: a.configDir })) } : null));
  const chats = path.join(OLD, 'chats');
  if (fs.existsSync(chats)) {
    for (const f of fs.readdirSync(chats).filter((n) => /^[a-z0-9-]+\.json$/.test(n))) {
      const to = path.join(config.data, 'chat', f);
      if (fs.existsSync(to)) continue;
      const d = readJson(path.join(chats, f), null);
      const messages = Array.isArray(d) ? d : d && Array.isArray(d.messages) ? d.messages : null; // o antigo guardava só a lista
      if (messages) {
        writeJson(to, { agent: f.replace(/\.json$/, ''), messages: messages.filter((m) => m && (m.who === 'user' || m.who === 'agent') && typeof m.text === 'string').slice(-200) });
        moved.push(`chat/${f}`);
      }
    }
  }
  return moved;
}
