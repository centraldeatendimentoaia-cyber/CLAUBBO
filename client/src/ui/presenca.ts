// Presença ao vivo no mapa: manda a posição do meu boneco ao servidor (no máximo 5 vezes por segundo, e só quando muda) e
// mostra os bonecos das outras pessoas, com o personagem que cada uma editou. Sem DOM próprio: é só ligação entre o
// mundo (PlayerWorld), o stream do servidor e /api/equipe. Quem pode aparecer é decisão do servidor.
import { lerEquipe } from '../net/equipe-api';
import { avisarPosicao, sairDoMapa } from '../net/presenca-api';
import type { PlayerWorld } from '../world/api';
import type { UiContext } from './context';
import { convidadosDe, devoAvisar, lerLista, temDesconhecido, type PersonagemEquipe, type Posicao, type PresencaPessoa } from './presenca-model';

const TIQUE_MS = 100;

export class Presenca {
  private lista: PresencaPessoa[] = [];
  private eu = '';
  private equipe: PersonagemEquipe[] = [];
  private ultima: Posicao | null = null;
  private ultimaEm = 0;
  private emVoo = false;
  /** O servidor recusou esta página (403): para de avisar. */
  private proibido = false;
  private lendoEquipe = false;

  constructor(
    private readonly ctx: UiContext,
    private readonly player: PlayerWorld,
  ) {
    // O store emite o JSON cru do evento; `lerLista` confere a forma.
    ctx.store.on('presenca', (v) => {
      this.lista = lerLista(v);
      this.mostrar();
      if (!this.eu || temDesconhecido(this.lista, this.eu, this.equipe)) void this.lerEquipe();
    });
    globalThis.addEventListener?.('equipe:salvo', () => void this.lerEquipe());
    globalThis.addEventListener?.('pagehide', () => {
      if (!this.proibido) sairDoMapa();
    });
    setInterval(() => void this.tique(), TIQUE_MS);
    void this.lerEquipe();
  }

  private async lerEquipe(): Promise<void> {
    if (this.lendoEquipe) return;
    this.lendoEquipe = true;
    try {
      const d = await lerEquipe();
      if (d) {
        this.eu = d.eu;
        this.equipe = d.equipe;
        this.mostrar();
      }
    } finally {
      this.lendoEquipe = false;
    }
  }

  private mostrar(): void {
    this.player.convidados(convidadosDe(this.lista, this.eu, this.equipe));
  }

  private async tique(): Promise<void> {
    if (this.proibido || this.emVoo || document.hidden || this.ctx.store.mock) return;
    const pos = this.player.posicao();
    if (!pos) return;
    const agora = Date.now();
    if (!devoAvisar(pos, this.ultima, agora - this.ultimaEm)) return;
    this.emVoo = true;
    this.ultima = pos;
    this.ultimaEm = agora;
    try {
      if ((await avisarPosicao(pos)) === 'proibido') {
        this.proibido = true;
        this.lista = [];
        this.mostrar();
      }
    } finally {
      this.emVoo = false;
    }
  }
}

/** Liga a presença se o mundo tem boneco (não existe na cena Visita). Chamado por ui/index.ts. */
export function criarPresenca(ctx: UiContext): Presenca | null {
  const player = (ctx.world as { player?: PlayerWorld }).player;
  return player ? new Presenca(ctx, player) : null;
}
