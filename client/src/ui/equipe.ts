// Equipe na barra do escritório: um avatar por pessoa (o dono com a skin JMAL) e o editor do personagem. O servidor decide quem
// edita quem (server/core/personagens.mjs); aqui só se desenha, edita as peças (AppearanceFields) e se mostra o resultado.
import { appearanceFromSeed } from '../art';
import type { Appearance } from '../art/api';
import { lerEquipe, salvarPersonagemEquipe, type Equipe } from '../net/equipe-api';
import { AppearanceFields } from './appearance-fields';
import { changedParts } from './character-model';
import type { UiComponent, UiContext } from './context';
import { createAvatar } from './avatar';
import { h } from './dom';
import { descricaoPessoa, fonteAvatar, mensagemDaFalha, podeEditarPessoa, type Pessoa } from './equipe-model';

const novaSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export class EquipeBar implements UiComponent {
  readonly el: HTMLElement;
  private dados: Equipe | null = null;
  private aberto: HTMLElement | null = null;
  private pedido = false;

  constructor(private readonly ctx: UiContext) {
    this.el = h('div', { class: 'ui-equipe', role: 'group', attrs: { 'aria-label': 'Equipe' }, hidden: true });
    globalThis.addEventListener?.('focus', () => void this.atualizar()); // sem window (testes) não há o que ouvir
  }

  /** Busca a equipe na primeira vez que o escritório conecta; depois só ao voltar o foco ou salvar. */
  render(): void {
    if (this.pedido || this.ctx.store.connection !== 'open') return;
    this.pedido = true;
    void this.atualizar();
  }

  /** Lê a equipe de novo; sem acesso (sem nome, rede caiu) a faixa some em vez de mostrar dado velho. */
  async atualizar(): Promise<void> {
    this.dados = await lerEquipe();
    this.desenhar();
  }

  private desenhar(): void {
    const d = this.dados;
    this.el.hidden = !d || d.equipe.length === 0;
    if (!d) return this.el.replaceChildren();
    const eu = { nome: d.eu, papel: d.euPapel };
    this.el.replaceChildren(...d.equipe.map((p) => {
      const pode = podeEditarPessoa(eu, p);
      const desc = descricaoPessoa(p, d.eu);
      return h('button', {
        class: `ui-equipe__pessoa${p.costume ? ' is-dono' : ''}`, type: 'button', title: pode ? `${desc}: editar personagem` : desc,
        attrs: { 'aria-label': pode ? `${desc}: editar personagem` : desc, 'aria-disabled': pode ? undefined : 'true' },
        on: { click: (ev) => (pode ? this.abrirEditor(p, ev.currentTarget as HTMLElement) : undefined) },
      }, createAvatar(fonteAvatar(p), 'sm'));
    }));
  }

  private abrirEditor(p: Pessoa, voltaPara: HTMLElement): void {
    if (this.aberto) return;
    const seedInicial = p.seed;
    let seed = seedInicial;
    let base: Appearance = appearanceFromSeed(seed, { look: p.look });
    let ocupado = false;
    const fields = new AppearanceFields();
    fields.costume = p.costume;
    fields.set({ ...base, ...p.parts });
    const aviso = h('p', { class: 'ui-char__error', role: 'alert', hidden: true });
    const erro = (t: string | null) => { aviso.textContent = t ?? ''; aviso.hidden = !t; };
    const fechar = () => { this.aberto?.remove(); this.aberto = null; if (voltaPara.isConnected) voltaPara.focus(); };
    const gravar = async (corpo: Record<string, unknown>, ok: string) => {
      if (ocupado) return;
      ocupado = true;
      const r = await salvarPersonagemEquipe(p.nome, corpo);
      ocupado = false;
      if (!r.ok) return erro(mensagemDaFalha(r.status));
      fechar();
      this.ctx.announce(ok);
      await this.atualizar();
    };
    const salvar = h('button', { class: 'ui-btn ui-btn--primary', type: 'button', text: 'Salvar', on: { click: () => {
      const draft = fields.value;
      if (draft) void gravar({ seed, look: p.look, parts: changedParts(base, draft) }, `Personagem salvo: ${p.rotulo}.`);
    } } });
    const painel = h('section', { class: 'ui-char ui-equipe-editor', role: 'dialog', attrs: { 'aria-modal': 'true', 'aria-label': `Editar personagem de ${p.rotulo}` }, on: { keydown: (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } } } },
      h('p', { class: 'ui-equipe-editor__titulo', text: p.rotulo }),
      h('div', { class: 'ui-char__top' }, fields.preview, h('div', { class: 'ui-char__head' }, h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: 'Sortear', title: 'Sortear outra aparência (desfaz as peças escolhidas)', on: { click: () => { seed = novaSeed(); base = appearanceFromSeed(seed, { look: p.look }); fields.set({ ...base }); } } }))),
      p.costume ? h('p', { class: 'ui-muted ui-small', text: 'A fantasia JMAL (rubi, dourado e coroa) é o visual de partida do dono; as peças escolhidas valem por cima dela.' }) : null,
      fields.groups, aviso,
      h('div', { class: 'ui-char__actions' }, salvar, h('button', { class: 'ui-btn', type: 'button', text: 'Cancelar', on: { click: fechar } }),
        p.custom ? h('button', { class: 'ui-link-btn ui-char__reset', type: 'button', text: p.costume ? 'Voltar ao padrão' : 'Voltar ao sorteio', on: { click: () => void gravar({ reset: true }, p.costume ? 'O personagem voltou ao padrão JMAL.' : 'O personagem voltou ao sorteio.') } }) : null),
    );
    this.aberto = painel;
    document.body.append(painel);
    salvar.focus();
  }
}
