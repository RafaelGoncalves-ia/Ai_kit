# lolCoach

Skill local da KIT para preparar contexto tecnico de League of Legends usando cache local em camadas.

A `lolCoach` nao tem personalidade propria, nao chama Ollama diretamente e nao consulta internet em perguntas comuns. Ela entrega contexto tecnico e restricoes para a rota atual da KIT, mantendo a resposta final sob a personalidade normal do sistema.

## Comandos de atualizacao

Estes sao os unicos comandos que podem baixar dados externos do Riot Data Dragon:

- `Kit, atualizar dados do LoL`
- `Kit, atualizar base do LoL`
- `Kit, atualizar campeoes e itens do LoL`

Se a base local ainda nao existir, a skill responde:

```text
Base do LoL ainda não existe. Use: Kit, atualizar dados do LoL.
```

## Triggers de perguntas

A skill pode ser ativada por perguntas contendo:

- `lol`
- `league of legends`
- `campeao`
- `campeão`
- `champion`
- `item contra`
- `build contra`
- `counter`

## Exemplos

```text
Kit, atualizar dados do LoL
```

```text
Qual item contra Yasuo no LoL?
```

```text
Rapido, na partida, build contra Darius.
```

```text
Quem eu escolho contra Zed no mid?
```

```text
Me explica a lore do Yone.
```

```text
Me explica completo a Ahri.
```

```text
O que faco contra tank no LoL?
```

```text
Preciso de anti-heal contra Soraka.
```

## Camadas de contexto

- `flash`: respostas rapidas, durante partida ou urgencia alta.
- `compact`: conversa normal, explicacoes curtas e decisoes comuns.
- `detailed`: lore, estudo, analises longas e explicacoes completas.

Regras principais:

- Pergunta rapida em jogo usa `flash`.
- Pergunta comum usa `compact`.
- Lore, estudo ou pedido detalhado usa `detailed`.

## Arquivos importantes

- `lolCoach.skill.js`: entrada da skill, comandos e fluxo principal.
- `lolCoachUpdater.js`: atualizacao manual via Riot Data Dragon e geracao das bases locais.
- `lolCoachService.js`: cache em RAM, aliases, runtime context e reload sem reiniciar.
- `lolCoachAnalyzer.js`: deteccao de intents, campeoes, itens, lane, urgencia e modo.
- `lolCoachContextRouter.js`: escolha entre `flash`, `compact` e `detailed`.

## Dados locais

Estrutura de cache:

```text
data/
  manifest.json
  raw/
  normalized/
    flash/
    compact/
    detailed/
  knowledge/
```

`data/knowledge/` e persistente entre patches e nao deve ser apagado pelo updater.

Arquivos de knowledge:

- `matchup_rules.json`
- `item_logic_rules.json`
- `role_rules.json`
- `threat_rules.json`

## Mensagens de status

Sem base:

```text
Base do LoL ainda não existe. Use: Kit, atualizar dados do LoL.
```

Base pronta:

```text
Base do LoL pronta. Patch atual: {patch}. Última atualização: {lastUpdate}.
```

Atualizado:

```text
Base do LoL atualizada para o patch {patch}.
```

Ja atualizado:

```text
Base do LoL já está atualizada. Patch atual: {patch}.
```

Erro com base antiga:

```text
Não consegui atualizar agora. Mantive a última base local válida: {patch}.
```

Erro sem base:

```text
Não consegui atualizar a base do LoL e ainda não existe uma base local válida.
```

## Observacoes de arquitetura

- Perguntas comuns nunca fazem requests externos.
- Atualizacao acontece em `data/.tmp_update/`.
- `manifest.json` so e atualizado depois de sucesso completo.
- Em falha de atualizacao, a ultima base local valida e mantida.
- A RealtimeRoute injeta o contexto tecnico no prompt e bloqueia web search nesse turno.
- O Orchestrator mantem entradas da `lolCoach` na RealtimeRoute para nao transformar pergunta comum em Agent.
