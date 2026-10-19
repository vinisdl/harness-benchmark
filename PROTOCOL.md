# PROTOCOL — Benchmark de Tarefa Única Node.js

Este protocolo é **vinculante**. Siga cada etapa na ordem exata para cada ferramenta,
sem improvisação. Ele garante que as três ferramentas (Claude Code, OpenCode, Codex CLI)
sejam avaliadas de forma justa e consistente.

---

## Parte 1 — Execução do Run

### 1.1 Preparação do ambiente

Antes de cada run:

1. Confirme que o LiteLLM proxy está rodando: `curl -s http://localhost:4000/health` deve retornar 200.
2. Confirme que o workspace da ferramenta está limpo (apenas `prompt.md` e arquivos de configuração da ferramenta).
3. Anote o horário de início.

### 1.2 Invocação via harness

```bash
cd benchmark/
python harness/run.py --mode single-task --tool <ferramenta> --timeout 1800
```

Onde `<ferramenta>` é `claude_code`, `opencode` ou `codex_cli`.

Não interrompa o run. Se a ferramenta parar esperando input, anote como `stdin_stall` em `results/runs.json` e finalize o processo.

### 1.3 Após o run

1. Confirme que `results/generated_code/<tool>/run_1/` existe e não está vazio.
2. Confirme que `results/runs.json` tem entrada com `exit_code` e `duration_seconds`.
3. Anote o horário de fim.

---

## Parte 2 — Avaliação Manual (Rubrica 0–100)

Execute imediatamente após o run, enquanto o contexto está fresco. Prazo máximo: 24 horas.

A rubrica mapeia diretamente os goals G1–G14 do `task/prompt.md`.

### 2.1 Preparação para avaliação

```bash
cd results/generated_code/<tool>/run_1/
npm install
```

Se `npm install` falhar, registre `boot_failed: true` em `runs.json` e aplique crédito parcial (ver seção 2.3).

### 2.2 Teste de boot e funcionalidades

Configure as variáveis de ambiente (PowerShell):

```powershell
$env:OPENAI_API_KEY = "litellm"
$env:OPENAI_BASE_URL = "http://localhost:4000/v1"
$env:OPENAI_MODEL = "gpt-6.1-sol"
npm run dev
# aguardar o servidor iniciar em http://localhost:3000
```

#### 2.2.1 Verificação visual (abrir navegador)

Abra `http://localhost:3000` e verifique:

- [ ] A UI carrega sem erros no console
- [ ] Enviar uma mensagem — tokens aparecem **incrementalmente** na tela (streaming real)
- [ ] Após a primeira troca, um título aparece no cabeçalho da conversa (G8)
- [ ] Perguntar "What time is it?" — resposta deve vir via tool `server_time` (G7)
- [ ] Perguntar "What is 123 * 456?" — resposta deve vir via tool `calculator` (G7)

#### 2.2.2 Verificação via API (curl)

```bash
# 1. Criar conversa
curl -s -X POST http://localhost:3000/api/conversations
# → espera: { id: "...", ... } com status 201

CONV_ID=<id retornado acima>

# 2. Enviar mensagem e verificar SSE stream
curl -N -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"conversationId\":\"$CONV_ID\",\"message\":{\"id\":\"msg-1\",\"text\":\"Hello\"}}"
# → espera: stream de eventos SSE com chunks de texto incrementais

# 3. Verificar que histórico foi salvo
curl -s http://localhost:3000/api/conversations/$CONV_ID
# → espera: objeto com histórico contendo a mensagem do usuário e a resposta

# 4. Verificar preflight sem API key (parar o servidor, remover OPENAI_API_KEY, reiniciar)
# → espera: UI exibe mensagem de erro amigável, não crash (G10)

# 5. Verificar 404 para conversa inexistente
curl -s http://localhost:3000/api/conversations/00000000-0000-0000-0000-000000000000
# → espera: 404

# 6. Verificar persistência (reiniciar servidor, buscar CONV_ID)
curl -s http://localhost:3000/api/conversations/$CONV_ID
# → espera: histórico ainda presente (G6)
```

#### 2.2.3 Verificação de testes dentro do Docker

Os testes devem ser executados no ambiente Linux canônico usando o stage `builder` do Dockerfile, que já contém devDependencies compiladas para Linux.

```powershell
# Construir a imagem de teste (fazer uma vez por ferramenta)
docker build --target builder -t <ferramenta>-builder .

# Rodar todos os checks dentro do container
docker run --rm -e NODE_ENV=test <ferramenta>-builder sh -c "npm test -- --reporter=verbose"
docker run --rm <ferramenta>-builder sh -c "npm run typecheck && echo TYPECHECK_OK"
docker run --rm <ferramenta>-builder sh -c "npm run lint && echo LINT_OK"
docker run --rm <ferramenta>-builder sh -c "npm run format:check && echo FORMAT_OK"
docker run --rm <ferramenta>-builder sh -c "npm audit --audit-level=low && echo AUDIT_OK"
```

#### 2.2.4 Verificação Docker (G13)

Antes de subir o container de uma nova ferramenta, derrubar o container anterior e construir sem cache para evitar conflitos de porta e camadas reaproveitadas:

```powershell
# Derrubar container da ferramenta anterior
docker compose down

# Na pasta da nova ferramenta — build sem cache + subida
$env:OPENAI_API_KEY = "litellm"
docker compose build --no-cache
docker compose up -d
# aguardar healthcheck e testar http://localhost:3000
docker compose down
```

Anote quais verificações passaram e quais falharam.

### 2.3 Crédito parcial por boot failure

Se o app não boota (`npm install` falha ou servidor não inicia):
- Dimensão **Entregáveis & Boot**: 0 pts
- Dimensão **Integração LLM & Streaming**: máx 5 pts (crédito por código de integração presente e sintaticamente correto)
- Dimensão **Testes**: máx 5 pts (crédito por testes presentes e sintaticamente corretos)
- Demais dimensões: avalie pelo código-fonte lido.

### 2.4 Aplicação da rubrica (8 dimensões, total = 100)

Aplique **em ordem**. Registre a pontuação de cada dimensão antes de passar para a próxima.

---

#### Dimensão 1 — Entregáveis & Boot (0–15 pts) · G1, G2, G13

O que verificar: app boota, UI Next.js App Router carrega, Tailwind e componentes React presentes, Dockerfile e docker-compose existem e funcionam.

| Pontuação | Critério |
|---|---|
| 15 | App boota, UI carrega, componentes React presentes, `docker compose up` funciona |
| 10 | App boota e UI carrega, mas Docker falha ou componentes são arquivo único |
| 5 | App boota mas UI tem erros visíveis; ou apenas Docker funciona |
| 0 | App não boota (npm install falha, syntax error, porta não responde) |

---

#### Dimensão 2 — Integração LLM & Streaming (0–20 pts) · G3, G4

O que verificar: SDK Vercel AI configurado via env vars (`OPENAI_BASE_URL`, `OPENAI_MODEL`), streaming real via `streamText`/`useChat` (tokens chegam incrementalmente), sem hardcode de modelo ou URL.

| Pontuação | Critério |
|---|---|
| 20 | SDK configurado 100% via env, streaming incremental confirmado visualmente, modelo configurável |
| 15 | Streaming funciona mas modelo ou URL parcialmente hardcoded |
| 10 | SDK presente e configurado via env, mas streaming não é incremental (resposta completa aparece de uma vez) |
| 5 | Código de integração presente e correto sintaticamente mas nunca produz streaming real |
| 0 | Sem integração LLM; resposta estática ou endpoint inexistente |

---

#### Dimensão 3 — Multi-turn & Persistência (0–15 pts) · G5, G6

O que verificar: histórico enviado ao provider exclui a mensagem atual (G5), conversa sobrevive restart do servidor, storage é bounded (cap de mensagens e bytes) com TTL, comportamento correto em multi-processo.

| Pontuação | Critério |
|---|---|
| 15 | Histórico correto (G5 + unit test), sobrevive restart, bounded com TTL, SQLite ou Redis (não array em memória) |
| 10 | Persiste corretamente mas sem TTL ou sem caps; ou unit test de multi-turn ausente |
| 5 | Persiste mas apenas em memória (não sobrevive restart) |
| 0 | Sem persistência; cada mensagem é processada sem contexto |

---

#### Dimensão 4 — Funcionalidades (0–20 pts) · G7, G8, G9

O que verificar: tools `server_time` e `calculator` via AI SDK tool API; título gerado via `generateObject` após primeira troca; token budgeting recusa turnos além do budget sem chamar o provider.

| Pontuação | Critério |
|---|---|
| 20 | Ambas as tools funcionam corretamente, título aparece na UI, budget recusa novos turnos com mensagem amigável |
| 15 | Tools funcionam mas título ou budget ausente |
| 10 | Uma tool funciona; ou título/budget implementados mas com comportamento incorreto |
| 5 | Código de tools/título/budget presente mas nunca acionado corretamente |
| 0 | Nenhuma das três funcionalidades implementada |

---

#### Dimensão 5 — Robustez (0–10 pts) · G10

O que verificar: system prompt configurado via SDK; preflight de API key ausente exibe erro amigável na UI (não crash); falha do provider exibe estado degradado visível; turnos falhos nunca entram no histórico.

| Pontuação | Critério |
|---|---|
| 10 | System prompt presente, preflight de key implementado, falha do provider não causa crash, turnos falhos descartados |
| 6 | Dois ou três dos quatro critérios atendidos |
| 3 | Apenas um critério atendido |
| 0 | Sem tratamento de erros; qualquer falha causa crash ou estado silencioso |

---

#### Dimensão 6 — Testes (0–10 pts) · G11

O que verificar: testes Vitest para componentes e lógica core; mocks espelham a API real do Vercel AI SDK (não funções inventadas); cobertura configurada; pelo menos um teste verifica o array exato de mensagens enviadas ao provider em conversa multi-turn.

| Pontuação | Critério |
|---|---|
| 10 | Testes cobrem componentes e lógica; mock correto do SDK; teste de multi-turn payload; `npm test` passa; cobertura reportada |
| 7 | Testes presentes e passam; mock correto mas teste de multi-turn payload ausente |
| 4 | Testes existem mas mockam API inexistente do SDK ou `npm test` falha |
| 0 | Sem testes |

---

#### Dimensão 7 — Qualidade de Código (0–5 pts) · G12

O que verificar: `npm run lint` sem erros (ESLint com regras TypeScript), `npm run format:check` passa, `npm audit` sem findings de nível low ou acima.

| Pontuação | Critério |
|---|---|
| 5 | Lint, format e audit passam com 0 erros/warnings |
| 3 | Um dos três falha com poucos problemas |
| 1 | Dois ou três falham |
| 0 | Nenhum configurado |

---

#### Dimensão 8 — Documentação & Segurança (0–5 pts) · G13, G14

O que verificar: README com setup, env vars e como rodar/testar; sem credenciais hardcoded em nenhum arquivo; `.env` no `.gitignore`.

| Pontuação | Critério |
|---|---|
| 5 | README completo, sem secrets em código, `.env` ignorado |
| 3 | README presente mas incompleto; ou `.env` não ignorado |
| 0 | Sem README ou credenciais hardcoded |

---

### 2.5 Registro do resultado

Após avaliar as 8 dimensões, **verifique que a soma = 100** antes de registrar.

```bash
# Adicionar linha em results/scores.csv
# Formato: tool,run,boot,streaming,persistencia,funcionalidades,robustez,testes,qualidade,docs,total
# Exemplo:
# claude_code,1,15,18,12,17,8,8,4,4,86
```

Se a soma ≠ 100, revise as dimensões antes de registrar. Não ajuste retroativamente após registrar.

---

## Parte 3 — Integridade do Benchmark

- **Avalie uma ferramenta por vez**, complete a avaliação antes de rodar a próxima.
- **Não compare** o código de uma ferramenta com o de outra durante a avaliação — avalie cada um de forma independente pela rubrica.
- Se houver dúvida em um critério, aplique o critério mais baixo e documente o raciocínio em um comentário no `scores.csv` (coluna `notes`).
- Registre qualquer comportamento inesperado da ferramenta (pause para confirmação, loop infinito, tool call failures) em `results/runs.json` no campo `notes`.
