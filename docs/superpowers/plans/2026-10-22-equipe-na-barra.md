# Equipe na barra do escritório: personagens editáveis e skin do dono (projeto 4b)

**Decisão de encaixe (uma linha):** vira plano novo (projeto 4b) e não entra no projeto 4 (jogos), porque é um recurso próprio (identidade visual da equipe) que só compartilha a branch `feature/jogos-agentes`; a lista de pendências não existe no repositório (só "projeto 5 = arte nova", que não cobre isto).

**Goal:** Cada pessoa da equipe (e o dono) aparece como um avatar na barra superior; a própria pessoa edita o seu personagem (o dono edita qualquer um); o dono sempre usa a skin JMAL.

**Estado da skin JMAL:** a fantasia `jmal` (rubi, dourado, coroa) já está desenhada em `client/src/art/character/render.ts` e é fixa do dono (`costume: 'jmal'`). A pasta `JMAL/` na raiz está vazia e é git-ignorada, então não há arquivo a importar; a skin usada é a que já está no código. Se houver arquivos novos do JMAL, chegam depois (fora deste plano).

## Regras

- Lista da barra: dono (identidade local `dono`) + pessoas de `data/equipe.json`. Nunca expõe hash nem token.
- Edição: pessoa edita só o próprio personagem; dono edita o de qualquer um; agente (`x-v2-agente`) e token sem nome: 403.
- Aparência guardada no servidor em `data/personagens.json` (seed, look, peças validadas). Fantasia JMAL é decidida pelo servidor pelo papel `dono`, nunca vem do corpo do pedido.
- Escritas por `POST` (única forma que o `phoneGate` deixa passar da rede), auditadas com o nome.
- Texto do servidor entra na página só por `textContent`/`h({text})`.

## Tarefas

### Task 1: Personagens no servidor
- [x] Testes e `server/core/personagens.mjs` (`listarEquipe`, `salvarPersonagem`, `limparPersonagem`, validação das peças, ids hostis).
- [x] Rotas `GET /api/equipe` e `POST /api/equipe/:nome/personagem` (corpo `{seed, look, parts}` ou `{reset:true}`), PHONE_WRITES, AUDITED e testes de acesso/auditoria e HTTP. Commit.

### Task 2: Barra e editor no cliente
- [x] Modelo puro (`equipe-model.ts`) com testes: quem pode editar quem, ordem da lista, rótulo.
- [x] `equipe.ts`: faixa de avatares na barra (`topbar.ts`) e editor (reaproveita `AppearanceFields`); dono com a skin JMAL. CSS no sistema néon. Commit.

### Task 3: Pendências do projeto 4
- [x] 409 de agente ocupado via HTTP (reproduzir agente ocupado no servidor de teste).
- [x] Etiqueta de humor ao lado do nome (barra lateral e gaveta); no mapa não, porque o nome do agente não é desenhado no mapa.
- [x] Teste no navegador (Chrome headless via playwright-core; a extensão do Chrome não estava conectada): barra da equipe e editor, painel de jogos com teclas, retomada ao recarregar e `prefers-reduced-motion`. Não visto: o boneco andando até o agente e abrindo o menu com E (o painel foi aberto por um gancho temporário, já removido); a etiqueta de humor com valor animado ou chateado.
- [x] README e CHANGELOG (Não lançado).
