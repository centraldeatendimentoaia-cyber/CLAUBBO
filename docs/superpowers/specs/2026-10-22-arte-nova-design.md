# Arte nova: quartos, bonecos e distintivos (design)

Data: 2026-10-22. Projeto 5 de 5 (ver "Contexto e ordem dos projetos" em `2026-10-21-painel-holding-design.md`).

## Intenção

O escritório ganhou painel, boneco do jogador, jogos e equipe na barra. A arte ainda é a do início: fliperama e ping-pong são manchas pequenas, pisos e paredes têm pouco relevo, e o nível e o XP do elenco aparecem só como texto ("Nv 3 · 120 XP"). Este projeto dá ao Claubbo uma identidade visual própria e legível no zoom padrão do mundo.

## Objetivos

1. **Jogos do lounge bem desenhados.** O fliperama (o par de gabinetes roxos) e a mesa de ping-pong têm silhueta e detalhes legíveis a 1x e a 3x. Ids, tamanhos e posições não mudam, porque a sessão de interação nos móveis depende deles (nota de pontos de contato no plano).
2. **Quartos.** Pisos e paredes com textura própria (veio da madeira, trama do carpete, rejunte, rodapé, friso), sem mudar a lista de tipos nem os temas.
3. **Bonecos.** Roupas e acessórios com mais detalhe e leitura, usando só as opções que o editor de personagem já oferece. Subagentes e dono continuam distinguíveis.
4. **Distintivos.** Ícones em pixel para níveis de XP (por faixa) e medalhas de conquista, usados no painel da holding.

## Fora do escopo

- Novas opções no editor de personagem (acessórios, estilos de roupa, paletas). As listas moram em `shared/appearance.ts` e as paletas, com tabelas exaustivas por opção, em `shared/world/appearance-flat.ts`; `shared/world/` está fora deste projeto. A variedade vem de desenho melhor das opções existentes.
- Novos `FloorKind`, `WallPattern` e temas de sala: servidor e `shared/world` validam esses valores, e mudar a contagem de temas muda a aparência das salas já existentes.
- Tornar o fliperama e o ping-pong interativos (sessão da Joana, `feature/interacao-total`).
- Mudanças em `server/`, `client/src/ui/interacao*`, `client/src/world/player.ts`, `habblaud/`, `shared/world/`.
- Conquistas gravadas no servidor. As conquistas deste projeto são derivadas, no cliente, de números que o painel já recebe.

## Originalidade (obrigatória)

Tudo é desenhado aqui, em código, com a paleta e as formas do Claubbo. Nenhum sprite, nome, mascote, formato de distintivo ou de sala vem do Habbo Hotel, do Code Tavern ou de outro jogo. Os nomes novos (faixas de nível, conquistas) são inventados para este produto.

## Restrições

- Contrato `client/src/art/api.ts`: só mudanças aditivas (DESIGN-SYSTEM seção 8). 16 px por tile, perspectiva 3/4, luz de cima e da esquerda, contorno cinza-azulado (nunca preto), 3 a 4 tons por material.
- Fliperama: footprint 1x1, `blocks`, `rects.screen` mantido (o renderer desenha a partida por cima). Ping-pong: footprint 3x2, rede no meio, jogadores nas pontas oeste e leste, bola desenhada pelo renderer.
- Acessibilidade: distintivo nunca é só cor (forma diferente por faixa e texto ao lado). Texto novo passa por `tr()` com traduções en, es e fr (`npm run i18n:check`).
- Desempenho: sprites gerados uma vez e guardados em cache, como já é feito em `art/index.ts`.

## Decisões de arte

### Fliperama
Gabinete roxo (mantém cor e acento) com lateral escura e listra lilás e rosa, letreiro aceso, tela com moldura grossa e vidro, painel de controle com joystick (bola vermelha e haste) e botões, vão de moedas iluminado e base com sombra. Tudo dentro da folha atual.

### Ping-pong
Tampo azul com linhas brancas, rede com postes e malha, pernas com travessa, sombra sob a mesa, e duas raquetes e uma bola em repouso sobre o tampo, para a mesa ser lida sem jogadores. A rede continua no meio do comprimento (x 23 e 24 do desenho), porque o renderer calcula o voo da bola a partir dos jogadores.

### Pisos e paredes
Detalhe em pixel dentro de cada tipo atual, com a variação por tile já existente. Conferido nas seções "Pisos" e "Paredes" da prévia e na cena de exemplo.

### Bonecos
Passada de detalhe nas peças existentes: gola e botões, cordão e bolso, lapela, brilho e haste dos óculos, arco do fone. Mesmo tamanho de sprite e mesmas poses.

### Distintivos
Módulo novo `client/src/art/badges.ts`:
- `levelTier(nivel)`: faixa de 1 a 5 com nome ("Faísca", "Chama", "Cometa", "Coroa", "Astro") e forma própria (losango, escudo, hexágono, estrela de 4 pontas, estrela de 8 pontas), além de cor.
- `achievementsOf(...)`: conquistas derivadas, com id estável, nome e descrição: "Primeiro brilho" (algum XP), "Em ascensão" (nível 3), "Veterano" (nível 6), "Lenda" (nível 10) e "Dia limpo" (rotinas rodaram hoje e nenhuma falhou).
- `renderBadge(...)` desenha em canvas com o núcleo `PixelBuf`, com cache.
O painel mostra o distintivo da faixa ao lado de "Nv N" e as medalhas ganhas, cada uma com texto (`title` e `aria-label`).

## Critérios de sucesso

- Screenshots no navegador mostram fliperama, ping-pong, pisos, paredes, bonecos e distintivos legíveis e coerentes com a cena.
- Tipo, footprint, posições e `rects.screen` do fliperama e do ping-pong inalterados (testes e nota no plano).
- Testes vitest para a regra dos distintivos e para o contrato da arte.
- `npm run check`, `npx tsc -b`, `npm run build` e `npm run i18n:check` verdes.
