// Pets do escritório: configuração (puro). Guardada nas preferências da interface (ui/prefs.ts) e entregue ao mundo
// por WorldOptions.pets. Para uma espécie nova: um item em SPECIES aqui e os desenhos em art/pets.ts.

export type PetSpecies = 'cat' | 'dog' | 'bird';

/** Traços de cada espécie: o comportamento (pets/pet.ts) e o desenho (art/pets.ts) só leem esta tabela. */
export interface SpeciesDef {
  label: string;
  /** Nome sugerido ao adicionar. */
  defaultName: string;
  /** Velocidade de caminhada (tiles por segundo). */
  speed: number;
  /** Anda aos pulinhos (arco curto a cada passo). */
  hops: boolean;
  /** Foge quando alguém chega perto, em vez de se aproximar. */
  skittish: boolean;
  /** Dorme (deita e fica parado por um tempo). */
  sleeps: boolean;
  /** Reação ao ser notado por alguém: coraçãozinho (gato), pulinho (cachorro), susto (passarinho). */
  reaction: 'purr' | 'wag' | 'startle';
}

export const SPECIES: Readonly<Record<PetSpecies, SpeciesDef>> = {
  cat: { label: 'Gatinho', defaultName: 'Mimi', speed: 2.2, hops: false, skittish: false, sleeps: true, reaction: 'purr' },
  dog: { label: 'Cachorro', defaultName: 'Totó', speed: 2.8, hops: false, skittish: false, sleeps: true, reaction: 'wag' },
  bird: { label: 'Passarinho', defaultName: 'Piu', speed: 1.9, hops: true, skittish: true, sleeps: false, reaction: 'startle' },
};

export const SPECIES_IDS = Object.keys(SPECIES) as PetSpecies[];

/** Teto de pets no escritório inteiro (todos os andares): mantém a cena leve. */
export const MAX_PETS = 8;
export const MAX_PET_NAME = 16;
const MAX_TUTOR_ID = 200;

export interface PetSetting {
  /** Estável: identifica o pet entre as mudanças de configuração (mantém a posição quando só o nome muda). */
  id: string;
  species: PetSpecies;
  name: string;
  /** Andar do mundo em que vive: 1 = Escritório, 2 = terminais. */
  floor: 1 | 2;
  /** Tutor: id de um agente do mesmo andar. Ausente = automático (o mundo escolhe um agente do andar). */
  tutor?: string;
}

export interface PetsConfig {
  enabled: boolean;
  pets: PetSetting[];
}

/**
 * Convivência entre pets e personagens (tutor, carinho, brincadeira). Tempos em ms; chances de 0 a 1.
 * Tudo moderado de propósito: ajuste aqui para mais ou menos movimento.
 */
export const PET_SOCIAL = {
  /** Intervalo entre as idas do pet até o tutor. */
  toTutorEveryMs: [9_000, 20_000],
  /** Chance de, ao decidir o que fazer, ir até o tutor (se ele estiver longe). */
  toTutorChance: 0.55,
  /** Perto do tutor: tempo que fica ao lado dele antes de decidir de novo. */
  stayMs: [12_000, 28_000],
  /** Chance de dormir aos pés do tutor (espécies que dormem). */
  sleepByTutorChance: 0.4,
  /** Distância (tiles) a partir da qual o pet parado ao lado do tutor o acompanha quando ele se muda. */
  followTiles: 5,
  /** Passarinho voa (em vez de andar) até o tutor: velocidade extra e altura do voo (px). */
  flightSpeed: 1.7,
  flightLift: 7,
  /** Tutor ocioso: chance, a cada passeio decidido, de ir ver o pet dele. */
  tutorVisitChance: 0.22,
  /** Outro agente ocioso: chance de cumprimentar um pet que não é dele (bem menor). */
  strangerVisitChance: 0.05,
  /** Só cumprimenta pets a até tantos tiles de distância. */
  strangerMaxTiles: 14,
  /** Depois de qualquer visita, o pet descansa deste tempo antes de receber outra. */
  visitCooldownMs: [30_000, 60_000],
  /** Duração do carinho, da brincadeira, da comida e do cumprimento. */
  carinhoMs: [3_500, 5_500],
  brincarMs: [4_000, 6_000],
  comidaMs: [3_500, 5_000],
  cumprimentoMs: [1_600, 2_400],
  /** Tutor: pesos para escolher o que faz (carinho, brincar, comida). Outros agentes só cumprimentam. */
  tutorKinds: { carinho: 0.5, brincar: 0.3, comida: 0.2 },
} as const;

export type PetVisitKind = 'carinho' | 'brincar' | 'comida' | 'cumprimento';

/** Sorteia o que o personagem faz com o pet: tutor escolhe entre carinho/brincar/comida; os outros cumprimentam. */
export function pickVisitKind(rng: () => number, isTutor: boolean): PetVisitKind {
  if (!isTutor) return 'cumprimento';
  const w = PET_SOCIAL.tutorKinds;
  const r = rng() * (w.carinho + w.brincar + w.comida);
  return r < w.carinho ? 'carinho' : r < w.carinho + w.brincar ? 'brincar' : 'comida';
}

/** Sorteio uniforme em [min, max] (ms). */
export const between = (rng: () => number, [a, b]: readonly [number, number]): number => a + rng() * (b - a);

export const DEFAULT_PETS: PetsConfig = { enabled: false, pets: [] };

const isSpecies = (v: unknown): v is PetSpecies => typeof v === 'string' && v in SPECIES;
const cleanName = (v: unknown, fallback: string): string => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_PET_NAME) : '';
  return s || fallback;
};

/** Valida a configuração: espécie desconhecida sai, nome vazio cai no padrão, ids repetidos ganham outro, no máximo MAX_PETS. */
export function sanitizePets(raw: unknown): PetsConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(o.pets) ? o.pets : [];
  const pets: PetSetting[] = [];
  const ids = new Set<string>();
  for (const item of list) {
    if (pets.length >= MAX_PETS) break;
    const p = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!p || !isSpecies(p.species)) continue;
    let id = typeof p.id === 'string' && /^[\w-]{1,24}$/.test(p.id) ? p.id : '';
    if (!id || ids.has(id)) {
      let n = pets.length + 1;
      while (ids.has(`pet-${n}`)) n++;
      id = `pet-${n}`;
    }
    ids.add(id);
    const tutor = typeof p.tutor === 'string' ? p.tutor.trim().slice(0, MAX_TUTOR_ID) : '';
    pets.push({ id, species: p.species, name: cleanName(p.name, SPECIES[p.species].defaultName), floor: p.floor === 2 ? 2 : 1, ...(tutor ? { tutor } : {}) });
  }
  return { enabled: o.enabled === true, pets };
}

/** Pets que devem existir agora num andar. */
export const petsOnFloor = (cfg: PetsConfig | undefined, floor: number): PetSetting[] => (cfg?.enabled ? cfg.pets.filter((p) => p.floor === floor) : []);

/** Novo pet para a tela de configuração (null no limite). */
export function addPet(cfg: PetsConfig, species: PetSpecies, floor: 1 | 2 = 1): PetsConfig | null {
  if (cfg.pets.length >= MAX_PETS) return null;
  let n = cfg.pets.length + 1;
  const ids = new Set(cfg.pets.map((p) => p.id));
  while (ids.has(`pet-${n}`)) n++;
  return { ...cfg, pets: [...cfg.pets, { id: `pet-${n}`, species, name: SPECIES[species].defaultName, floor }] };
}
