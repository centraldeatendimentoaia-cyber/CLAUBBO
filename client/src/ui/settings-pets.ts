// Grupo "Pets" das configurações: liga/desliga, escolhe quais e quantos, o nome de cada um e o andar onde ficam.
// Cada pet tem também um tutor (agente do mesmo andar; "Automático" deixa o mundo escolher).
// Fica nas preferências (UiPrefs.pets); o mundo recebe por WorldOptions.pets (world/pets/config.ts).
import { MAX_PETS, MAX_PET_NAME, SPECIES, SPECIES_IDS, addPet, sanitizePets, type PetSetting, type PetSpecies, type PetsConfig } from '../world/pets/config';
import type { UiContext } from './context';
import { h, setAttr } from './dom';
import { tr } from '../../../shared/i18n';

const FLOORS: readonly [1 | 2, string][] = [
  [1, 'Andar 1 · Escritório'],
  [2, 'Andar 2 · Terminais'],
];

const AUTO_TUTOR = '';

export class PetsSettingsGroup {
  readonly el: HTMLElement;
  private master: HTMLButtonElement;
  private list: HTMLElement;
  private adders = new Map<PetSpecies, HTMLButtonElement>();
  private count: HTMLElement;
  private details: HTMLElement;
  private shape = '';

  constructor(private ctx: UiContext) {
    const id = 'ui-pets-master';
    this.master = h('button', { class: 'ui-switch', type: 'button', role: 'switch', attrs: { 'aria-checked': 'false', 'aria-labelledby': id, 'aria-label': tr('Pets no escritório') } }, h('span', { class: 'ui-switch__knob' }));
    this.master.addEventListener('click', () => this.save({ ...this.cfg, enabled: !this.cfg.enabled }));

    this.list = h('div', { class: 'ui-pets__list' });
    this.count = h('span', { class: 'ui-set__hint' });
    const addRow = h('div', { class: 'ui-snd__chips ui-pets__add', role: 'group', attrs: { 'aria-label': tr('Adicionar pet') } });
    for (const sp of SPECIES_IDS) {
      const b = h('button', { class: 'ui-snd__chip', type: 'button', text: `+ ${tr(SPECIES[sp].label)}` });
      b.addEventListener('click', () => {
        const next = addPet(this.cfg, sp);
        if (next) this.save(next);
      });
      this.adders.set(sp, b);
      addRow.append(b);
    }
    this.details = h('div', { class: 'ui-snd__details' }, this.list, h('div', { class: 'ui-set ui-set--stack' }, addRow, this.count));

    this.el = h(
      'div',
      { class: 'ui-set-group ui-pets' },
      h('h3', { text: tr('Pets') }),
      h(
        'div',
        { class: 'ui-set' },
        h(
          'div',
          { class: 'ui-set__text' },
          h('span', { class: 'ui-set__label', text: tr('Pets no escritório'), attrs: { id } }),
          h('span', { class: 'ui-set__hint', text: tr('Gatinho, cachorro e passarinho passeiam, dormem e reagem a quem passa. Ficam no andar que você escolher.') }),
        ),
        this.master,
      ),
      this.details,
    );
  }

  private get cfg(): PetsConfig {
    return this.ctx.prefs.pets;
  }

  private save(next: PetsConfig): void {
    this.ctx.updatePrefs({ pets: sanitizePets(next) });
    this.render();
  }

  private patch(id: string, p: Partial<PetSetting>): void {
    this.save({ ...this.cfg, pets: this.cfg.pets.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  }

  private row(p: PetSetting): HTMLElement {
    const name = h('input', { class: 'ui-pets__name', type: 'text', attrs: { maxlength: MAX_PET_NAME, 'aria-label': tr('Nome do pet'), 'data-pet': p.id } });
    name.value = p.name;
    // grava ao digitar (sem refazer a lista: o foco fica no campo) e normaliza ao sair
    name.addEventListener('input', () => this.ctx.updatePrefs({ pets: sanitizePets({ ...this.cfg, pets: this.cfg.pets.map((x) => (x.id === p.id ? { ...x, name: name.value } : x)) }) }));
    name.addEventListener('change', () => this.render());
    const floor = h('select', { class: 'ui-pets__floor', attrs: { 'aria-label': tr('Andar do pet'), 'data-pet': p.id } });
    for (const [n, label] of FLOORS) floor.append(new Option(tr(label), String(n)));
    floor.value = String(p.floor);
    // o tutor é do andar: mudar o pet de andar volta o tutor para automático
    floor.addEventListener('change', () => this.patch(p.id, { floor: Number(floor.value) === 2 ? 2 : 1, tutor: undefined }));
    const tutor = h('select', { class: 'ui-pets__tutor', attrs: { 'aria-label': `${tr('Tutor de')} ${p.name}`, 'data-tutor': p.id } });
    this.fillTutor(tutor, p);
    tutor.addEventListener('change', () => this.patch(p.id, { tutor: tutor.value || undefined }));
    const del = h('button', { class: 'ui-snd__chip ui-pets__del', type: 'button', text: '✕', title: tr('Remover'), attrs: { 'aria-label': `${tr('Remover')} ${p.name}` } });
    del.addEventListener('click', () => this.save({ ...this.cfg, pets: this.cfg.pets.filter((x) => x.id !== p.id) }));
    return h(
      'div',
      { class: 'ui-pets__row', attrs: { 'data-pet': p.id } },
      h('span', { class: 'ui-pets__kind', text: tr(SPECIES[p.species].label) }),
      name,
      floor,
      del,
      h('span', { class: 'ui-pets__kind', text: tr('Tutor') }),
      tutor,
    );
  }

  /** Agentes (sem subagentes) do andar do pet, na ordem do snapshot. */
  private tutorChoices(floor: number): { id: string; name: string }[] {
    const snap = this.ctx.store.snapshot;
    if (!snap) return [];
    const onFloor = new Set(snap.rooms.filter((r) => (r.floor ?? 1) === floor).map((r) => r.id));
    return snap.agents.filter((a) => a.kind !== 'sub' && onFloor.has(a.roomId)).map((a) => ({ id: a.id, name: a.name }));
  }

  /** Opções do seletor de tutor: Automático + agentes do andar. Tutor salvo que não está mais no andar aparece como ausente (o pet usa o automático). */
  private fillTutor(sel: HTMLSelectElement, p: PetSetting): void {
    const choices = this.tutorChoices(p.floor);
    const key = `${p.tutor ?? ''}|${choices.map((c) => c.id + c.name).join(',')}`;
    if (sel.dataset.key === key) return;
    sel.dataset.key = key;
    sel.replaceChildren(new Option(tr('Automático'), AUTO_TUTOR));
    for (const c of choices) sel.append(new Option(c.name, c.id));
    if (p.tutor && !choices.some((c) => c.id === p.tutor)) sel.append(new Option(tr('Ausente do andar (usa automático)'), p.tutor));
    sel.value = p.tutor ?? AUTO_TUTOR;
  }

  render(): void {
    const c = this.cfg;
    setAttr(this.master, 'aria-checked', String(c.enabled));
    this.details.hidden = !c.enabled;
    const shape = c.pets.map((p) => `${p.id}:${p.species}`).join('|');
    if (shape !== this.shape) {
      this.shape = shape;
      this.list.replaceChildren(...c.pets.map((p) => this.row(p)));
    } else {
      for (const p of c.pets) {
        const name = this.list.querySelector<HTMLInputElement>(`input[data-pet="${p.id}"]`);
        if (name && document.activeElement !== name) name.value = p.name;
        const floor = this.list.querySelector<HTMLSelectElement>(`select[data-pet="${p.id}"]`);
        if (floor) floor.value = String(p.floor);
        const tutor = this.list.querySelector<HTMLSelectElement>(`select[data-tutor="${p.id}"]`);
        if (tutor) this.fillTutor(tutor, p);
      }
    }
    const full = c.pets.length >= MAX_PETS;
    for (const b of this.adders.values()) b.disabled = full;
    this.count.textContent = tr(c.pets.length ? `${c.pets.length} de ${MAX_PETS} pets` : `Nenhum pet ainda (máximo ${MAX_PETS})`);
  }
}
