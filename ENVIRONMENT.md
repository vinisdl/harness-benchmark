# Ambiente de Execução do Benchmark

Este arquivo documenta o ambiente de hardware e software usado na execução oficial do benchmark.
Deve ser atualizado antes de cada run completo. O harness também gera `results/environment.json`
automaticamente com as versões capturadas no momento da execução.

## Sistema Operacional

- **SO:** Windows 11 Education 10.0.26200
- **Arquitetura:** x86_64

## Hardware

- **Processador:** Intel Core i7-10700KF
- **Placa-mãe:** Asus Prime H510M-K
- **Memória RAM:** DDR4 32 GB Corsair
- **Placa de vídeo:** Nvidia RTX 3070

## Python

- **Host:** Python 3.13.5
- **Container (benchmark-runner):** Python 3.12.15 (base image `python:3.12-slim`)

## Node.js

- **Host:** v22.14.0
- **Container (benchmark-runner):** 20.x (nodesource `setup_20.x`)

## Ferramentas de IA Avaliadas

| Ferramenta | Versão | Modelo | Variável de ambiente |
|---|---|---|---|
| Claude Code | 2.1.296 (`@anthropic-ai/claude-code`, latest em 2026-10-13) | gpt-6.1-sol via LiteLLM | `ANTHROPIC_BASE_URL=http://localhost:4000` |
| OpenCode | 1.19.0 (`opencode-ai`, latest em 2026-10-13) | gpt-6.1-sol via LiteLLM | `OPENAI_BASE_URL=http://localhost:4000/v1` |
| Codex CLI | 0.162.1 (`@openai/codex`, capturado em harness.log) | gpt-6.1-sol via LiteLLM | `OPENAI_BASE_URL=http://localhost:4000/v1` |
| LiteLLM | não pinada no Dockerfile (latest em 2026-10-13) | proxy → Azure AI Foundry | `AZURE_API_KEY` |

## Pacotes npm das Tarefas

```
vitest@2.x
@vitest/coverage-v8@2.x
eslint@9.x
@eslint/js@10.x
c8@10.x
```

(Versões exatas: ver `package-lock.json` em `benchmark/`)

## Procedimento de Verificação Pré-Execução

Antes de cada run completo, confirme que o harness detecta todos os binários:

```bash
cd benchmark
python harness/run.py --dry-run --tasks t1_mock
```

O harness abortará com erro se claude, opencode, node ou python não estiverem disponíveis.
O arquivo `results/environment.json` é gerado automaticamente com as versões capturadas.

## Notas de Reprodutibilidade

Qualquer replicação do benchmark em ambiente diferente deve confrontar seu `ENVIRONMENT.md`
com este antes de comparar resultados. Diferenças de versão de Node.js ou das ferramentas
CLI podem introduzir variabilidade não controlada.
