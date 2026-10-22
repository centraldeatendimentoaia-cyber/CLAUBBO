# Design system do Escritório v2 (Claubbo)

Extraído do código em `client/src/ui/styles.css`, `client/src/art/` e `client/src/world/constants.ts`. Se algo aqui divergir do código, vale o código.

## 1. Princípios

- **Duas camadas.** O mundo é pixel art desenhada em canvas (`#world`, `image-rendering: pixelated`). A interface (`#ui`) são painéis escuros e translúcidos sobre o mundo. O mundo é claro e quente; a interface é escura e fria. Esse contraste mantém o foco no escritório.
- **Identidade em pixel.** Pontos de status quadrados, barras de uso segmentadas e ícones em pixels. Cantos arredondados só nos painéis.
- **Acessibilidade.** Texto pequeno mantém contraste AA (o comentário em `--ui-faint` registra 5,4:1 sobre o painel). Foco visível com contorno de 2px na cor de destaque.

## 2. Cor da interface

Definidas em `.ui-root` (`styles.css`).

| Token | Valor | Uso |
|---|---|---|
| `--ui-bg` | `rgba(18, 21, 29, 0.85)` | painel translúcido |
| `--ui-bg-solid` | `rgba(20, 24, 33, 0.97)` | painel opaco (gaveta, modal) |
| `--ui-bg-soft` / `--ui-bg-hover` | `rgba(255,255,255,0.035)` / `0.06` | fundo de item e hover |
| `--ui-line` / `--ui-line-strong` | `rgba(160,176,210,0.13)` / `0.24` | divisórias |
| `--ui-text` | `#e8ecf5` | texto principal |
| `--ui-muted` | `#9aa4b8` | texto secundário |
| `--ui-faint` | `#8790a6` | texto terciário (AA) |
| `--ui-accent` | `#7cc8ff` | destaque, foco, seleção |
| `--ui-accent-soft` | `rgba(124,200,255,0.13)` | fundo de destaque |
| fundo da página | `#12151d` | `theme-color` e `body` |

### Status do agente

| Token | Valor | Significado |
|---|---|---|
| `--st-working` | `#4fd18b` | trabalhando |
| `--st-waiting` | `#ffb547` | esperando você |
| `--st-shell` | `#3cd8d2` | esperando o shell (turquesa, distinto do verde e do azul) |
| `--st-idle` | `#8b98b3` | parado |
| `--st-done` | `#6aa8ff` | concluído |
| `--st-offline` | `#6b7280` | offline |

### Nível de uso (medidor de contas)

`--lv-ok #4fd18b`, `--lv-warn #ffb547`, `--lv-crit #ff6b6b`.

## 3. Tipografia

- `--font-px`: **Pixelify Sans** (pacote `@fontsource/pixelify-sans`, licença SIL OFL 1.1). Só em rótulos fixos de painel e títulos. Evitar em textos com "C" maiúsculo ou dígitos, porque nessa fonte o "C" parece "O" e o "5" parece "S". Ligaduras desativadas (`font-variant-ligatures: no-common-ligatures`), porque "fi" vira "A".
- `--font-ui`: `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif`. Corpo, nomes, números e letras de conta.
- `--font-mono`: `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace`. Terminal, código e caminhos.
- Base: `13px/1.4`, com `-webkit-font-smoothing: antialiased`.

## 4. Forma, espaço e movimento

- `--radius: 10px` (painéis), `--radius-sm: 7px` (botões, campos), `6px` no contorno de foco.
- `--gap: 10px` é o espaçamento de base. Layout em grid com `--top-h: 64px`, `--side-w: 304px`, `--drawer-w: 380px`, `--feed-h: 200px`, `--feed-head: 38px`.
- Easing padrão: `--ease: cubic-bezier(0.22, 0.8, 0.24, 1)`.
- Z-index: construtor em tela cheia usa `900`.
- A área livre do mundo (`--free-*`) é recalculada em JS (`ui/viewport.ts`) para a câmera não ficar atrás dos painéis.

## 5. Mundo em pixel art

Contrato em `client/src/art/api.ts`; regras de mudança: **só aditivas**, sem renomear nem remover tipos ou funções.

- **Escala:** 1 tile = `TILE` = 16 px; sprites em 1x, ampliados pela câmera (zoom de 1 a 6) sem suavização.
- **Perspectiva:** top-down 3/4. Vemos o topo e a face sul dos objetos. A parede norte mostra a face (2 tiles de altura); as paredes laterais e a sul aparecem só como tampa fina.
- **Luz:** vem de cima e da esquerda. Topos mais claros, faces frontais mais escuras, sombra de contato embaixo.
- **Cor:** neutros frios mais madeira quente, com acentos saturados nos objetos. Contorno de 1 px cinza-azulado escuro (nunca preto). 3 a 4 tons por material, brilhos especulares e muitos detalhes pequenos.
- **Cenário típico:** porcelanato claro, madeira no lounge, divisórias de vidro azulado, estantes com pastas coloridas, mesas com 1 ou 2 monitores azulados, cadeiras grafite, copa em mármore e inox, lounge com sofá azul e almofadas laranja.

### Temas de sala (`client/src/art/theme.ts`)

10 temas claros, escolhidos por semente (salas vizinhas ficam diferentes). Cada um define `carpet`, `carpet2`, parede (`base`, `trim`, padrão), `accent`, variante de mesa e de cadeira.

| # | Carpete | Parede | Detalhe | Acento |
|---|---|---|---|---|
| 1 | `#c9d1dc` | `#eef1f4` | `#9fb0c4` liso | `#3f7fd8` azul |
| 2 | `#dbcfba` | `#f6f0e5` | `#b99f7a` listras | `#ec8a3c` laranja |
| 3 | `#c4cfbb` | `#f1f3ea` | `#93a487` painel de madeira | `#4cae6a` verde |
| 4 | `#cdc8de` | `#f3f1f8` | `#a59cc4` liso | `#8d66cf` roxo |
| 5 | `#e4cdbe` | `#f8f1eb` | `#c99a83` liso | `#e2604f` vermelho |
| 6 | `#bfd9d2` | `#eef6f4` | `#7fb3a6` listras | `#36b0b0` turquesa |
| 7 | `#aab1bd` | `#e8eaee` | `#6d7583` tijolo | `#f2c14e` amarelo |
| 8 | `#e0cad2` | `#f9f2f4` | `#c08ea0` listras | `#e47aa8` rosa |
| 9 | `#c0d2e7` | `#eef4fa` | `#8aa6c8` painel de madeira | `#5b8fe0` azul |
| 10 | `#d1c5b8` | `#f4efe8` | `#8a6a52` painel de madeira | `#c9713f` terracota |

Padrões de parede: `plain`, `stripes`, `wood_panel`, `brick`, `tiles`. O construtor permite sobrescrever cores, piso e padrão por sala (`rooms.json` → `build.style`).

### Personagens

- Poses: stand, walk, run, sit, type, sleep, drink, use, raise_hand, talk, stretch, read, play, wait, cheer, laugh, game, rps, groom, sulk. Quatro direções (`down`, `up`, `left`, `right`).
- Itens de mão: coffee, water, papers, laptop, book, box, paddle, popcorn, controller, entre outros.
- Aparência gerada por semente (`shared/world/appearance-flat`): pele, cabelo, topo, acento. Editável no editor de personagem.
- Pets e decorações sazonais (árvore, presente, abóbora, fantasma, guirlanda, morcego) em `art/pets.ts` e `art/seasonal.ts`. O tema sazonal automático está desligado nesta versão.

### Medidas do prédio (`world/constants.ts`)

Coluna de 16 tiles; sala de 12 tiles de altura (2 de parede norte, 9 de piso, 1 de parede sul); corredor de 5 tiles; porta de 2 tiles na coluna 7. Velocidade: 3,2 tiles/s andando, 6 tiles/s correndo.

## 6. Marca e imagens

- Nome do cliente: **Claubbo**; favicon 16 e 32 px, `apple-touch-icon`, placa da recepção (`signage.png`, 64x16, e `@4x`), imagem de compartilhamento 1200x630.
- Quadros e pôsteres: 26x16 (2 tiles), 58x24 (4 tiles) e 12x16 (1 tile), listados em `client/public/assets/manifest.json`.
- Imagens originais criadas por código em `assets-novos/_gerador/`, com declaração de autoria em `MANIFESTO-*.md`.
- Licenças: o cliente deriva do Habblaud (MIT, © 2026 Márcio Junior); a fonte Pixelify Sans é SIL OFL 1.1. Ver `LICENSE` e `NOTICE.md`.

## 7. Estrutura de componentes (`client/src/ui/`)

Construtor (`builder.ts`), Operações (agentes, tarefas, rotinas, reuniões e contas), gaveta de conversa (`drawer.ts`), feed de atividade (`feed.ts`), estatísticas do dia (`daystats.ts`), pedidos aos terminais (`cli-requests.ts`), entregas (`deliveries.ts`), botão de andar (`floor.ts`), ajuda (`help.ts`). Tudo vive sob `.ui-root` e herda os tokens da seção 2.

## 8. Regras para novas telas

1. Painel escuro sobre o mundo, nunca tela clara cheia.
2. Texto do corpo em `--font-ui`; `--font-px` só em títulos e rótulos sem "C" nem dígitos.
3. Estado do agente sempre pelos tokens `--st-*` com ponto quadrado, nunca pela cor sozinha (acompanhar de texto ou forma).
4. Contraste mínimo AA; `--ui-faint` é o piso para texto pequeno.
5. Arte nova no mundo: 16 px por tile, contorno cinza-azulado, luz de cima e da esquerda, 3 a 4 tons por material.
6. Mudar o contrato de `art/api.ts` só de forma aditiva.

## 9. Sistema néon (painel da holding, menu de interação, jogos)

Tokens em `client/src/ui/neon.css` (`:root`), usados pelas classes `hold-*`, `int-*` e `jogo-*`. Convive com as camadas das seções 2 a 4; não as substitui.

| Token | Valor | Uso |
|---|---|---|
| `--neon-noite` | `#1a0f2e` | fundo |
| `--neon-roxo` | `#2a1452` | painéis |
| `--neon-profundo` | `#0d0620` | sombra em degrau, ticker |
| `--neon-rosa` / `--neon-turquesa` / `--neon-amarelo` / `--neon-lima` | `#ff4fa3` / `#3ad3d0` / `#ffd23f` / `#7cff6b` | destaques e estados (sempre com forma e texto) |
| `--neon-branco` / `--neon-lilas` | `#ffffff` / `#a99cc9` | texto e estado parado |
| `--neon-borda` | `3px solid` branco | botões e painéis |
| `--neon-degrau` | `0 4px 0` profundo | sombra sem blur |
| `--neon-fonte-titulo` / `--neon-fonte-corpo` | Pixelify Sans / system-ui | títulos / corpo |

Regras: cor nunca sozinha (acompanha forma ou texto); `prefers-reduced-motion` desliga animações; texto do servidor entra só por `textContent`.
Lacunas conhecidas: os componentes ainda são específicos de cada tela (não há `neon-btn`, `neon-card` ou `neon-tag` genéricos) e a fonte Pixelify Sans só é importada em `art/preview.ts`.

## 10. Distintivos (projeto 5)

Módulo `client/src/art/badges.ts`: `levelTier(nivel)` (faixa 1 a 5; `TIER_FROM` = níveis 1, 3, 5, 8 e 12), `achievementsOf` (conquistas derivadas de XP, nível e rotinas do dia), `renderBadge` e `badgeCanvas` (16x16 px; ampliar por CSS com `image-rendering: pixelated`).

| Faixa | Nome | Forma | Cor |
|---|---|---|---|
| 1 | Faísca | losango | lilás `#a99cc9` |
| 2 | Chama | escudo | turquesa `#3ad3d0` |
| 3 | Cometa | hexágono | lima `#7cff6b` |
| 4 | Coroa | estrela de 4 pontas | rosa `#ff4fa3` |
| 5 | Astro | estrela de 8 pontas | amarelo `#ffd23f` |

Conquistas: Primeiro brilho, Em ascensão (nível 3), Veterano (nível 6), Lenda (nível 10) e Dia limpo. Por ganhar, a medalha fica cinza. Regra: o distintivo vem sempre com texto (`role="img"` e `aria-label`), e a faixa se distingue pela forma e pelos pontos, não só pela cor. Classe `.hold-badge` em `neon.css`.
