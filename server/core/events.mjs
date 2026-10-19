// Barramento interno: o núcleo avisa "tarefa esperando" e "reunião pronta" sem conhecer o Telegram.
import { EventEmitter } from 'node:events';

export const events = new EventEmitter();
