# Mudanças

## [Não lançado]

### Adicionado

- Jogos com agentes: o dono e a equipe desafiam um agente ocioso para Pedra, Papel e Tesoura (melhor de 3, aposta de 5, 10 ou 25 moedas) pelo menu do agente. Veja "Jogos e moedas" no README.
- Carteiras de pessoas e agentes guardadas no servidor (100 moedas iniciais, apostas reservadas, moeda conservada). O painel da holding passa a mostrar a carteira do servidor no lugar do valor do navegador.
- Humor do agente (animado, neutro ou chateado) conforme o resultado das últimas partidas, só como expressão: não altera aura, modelo, nível, tarefa, custo nem prioridade.
- Rotas `GET /api/carteira`, `POST /api/jogos/desafio`, `POST /api/jogos/:id/jogada` e `GET /api/jogos/:id`, com acesso por pessoa e auditoria com o nome.
