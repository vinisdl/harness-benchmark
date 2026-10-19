# Local Chat

A minimal ChatGPT-like demo built with Next.js App Router, strict TypeScript, Tailwind CSS, and Vercel AI SDK. Responses arrive incrementally via an SSE stream and `useChat`—not as a completed string. There is no authentication.

## Requirements and setup

- Node.js **26.11.1**, selected by `mise latest node` in this workspace on 2026-10-13. `mise.toml` pins that newest available release.
- A running **local LiteLLM proxy** exposing the OpenAI-compatible Chat Completions API at `http://localhost:4000/v1`.
- Supply `OPENAI_API_KEY` through the process environment. Do not put credentials in source code, environment files, images, command-line arguments, or documentation. This repository intentionally contains no API key or `.env` file. If your terminal does not already inherit the key, Bash can prompt without displaying it:

```bash
read -rsp 'Local proxy API key: ' OPENAI_API_KEY; printf '\n'
export OPENAI_API_KEY
```

With mise installed:

```bash
mise trust
mise install
mise exec -- npm ci
mise exec -- npm run dev
```

In this prepared workspace, mise was installed locally because it was absent from PATH. Equivalent commands are:

```bash
MISE_DATA_DIR="$PWD/.tools/mise-data" ./.tools/mise exec -- npm run dev
```

Open **http://localhost:3000**. The initial page and history can load without a key; sending a message without one displays an actionable preflight error. On Linux, Node 26 needs `libatomic1`; compiling the SQLite native module may require Python, make, and a C++ compiler.

## Features

- Componentized Server/Client React architecture; accessible responsive chat UI, streamed partial answers, stop button, visible degraded states, new-chat action.
- `@ai-sdk/openai` explicitly uses **Chat Completions** against LiteLLM, never the default Responses API, a gateway, or an external provider. Chat and title generation default to `gpt-6.1-sol`, overridable by `OPENAI_MODEL`.
- Exactly two AI SDK tools: **server_time** (server UTC ISO timestamp) and **calculator** (safe basic arithmetic parser; no `eval`, `Function`, JavaScript execution, or arbitrary code). Recognized time/arithmetic requests force the relevant tool on the first step; the system prompt requires tools for other phrasings too.
- After the first completed exchange, the server uses AI SDK **`generateObject`** with a Zod title schema. Its result streams to the header. Title failure is nonfatal and visible; the completed answer remains saved. This still-supported API is deliberately used to meet the structured-output contract despite its AI SDK 7 deprecation.
- Approximate lifetime conversation token accounting uses SDK usage metadata summed over tool steps, including title generation. If metadata is missing, a UTF-8/4 estimate is used. Failed/aborted provider attempts are charged conservatively without saving their content. Once the budget is reached, subsequent turns receive a friendly refusal **before any provider call**. The first exchange's ancillary title generation may take it over budget; the budget is an admission threshold, not a hard output quota.

## Persistence and concurrency

SQLite via **Drizzle** and `better-sqlite3` is an embedded dependency—no separate database server is needed. Schema initialization happens automatically. The default database is `.data/chat.sqlite` (ignored by Git and Docker).

- WAL mode, a five-second busy timeout, and `BEGIN IMMEDIATE` transactions coordinate independent Node processes sharing the same **local filesystem database**.
- A fenced, database-backed conversation lease admits one in-flight turn per conversation. Another tab/process gets an explicit busy response. Leases last 120 seconds; provider/title work has a 90-second total timeout. A crashed worker's lease expires, and its stale cleanup cannot unlock a newer worker.
- Pending prompts are never stored. Each outgoing provider array is constructed from committed history plus the pending user message **exactly once**. Client-supplied history is neither accepted nor replayed.
- A completed user/assistant pair is saved in one atomic transaction. Failed, partial, timed-out, oversize, or aborted turns never become replayable history. Stopping after the server has already committed is not a rollback of that successful exchange; reloading always shows authoritative saved history.
- History has message-count and serialized UTF-8 byte limits, evicting whole exchanges. An oversized single pair fails visibly rather than breaking the cap. Lifetime tokens are not reset by eviction.
- Conversations expire by a sliding TTL refreshed on successful exchanges. Every storage operation removes expired rows. Total conversation count is also capped; oldest idle conversations are evicted at capacity. SQLite reuses freed pages; its file need not shrink after row eviction. The global bound limits retained data, not secure physical erasure.
- Reload restores the current conversation using only its UUID in browser localStorage. The server stores history and title across application restarts.

SQLite is intended for concurrent processes on **one host/local disk**, not independent replicas with isolated volumes or SQLite on network storage. Mount the same local database directory for every process. Use a server database before deploying across hosts. This unauthenticated demo exposes conversation data to anyone with a conversation UUID; do not expose it publicly or use sensitive data.

## Configuration

| Environment variable        | Default                    | Purpose                                                                                   |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`            | Required for chat          | Runtime-only local proxy credential; never logged                                         |
| `OPENAI_MODEL`              | `gpt-6.1-sol`              | Chat and title model                                                                      |
| `OPENAI_BASE_URL`           | `http://localhost:4000/v1` | Restricted to local hostnames, HTTP, port 4000, `/v1`; Docker uses `host.docker.internal` |
| `DATABASE_PATH`             | `.data/chat.sqlite`        | Writable SQLite file path                                                                 |
| `CONVERSATION_TOKEN_BUDGET` | `32000`                    | Lifetime token admission budget                                                           |
| `HISTORY_MAX_MESSAGES`      | `40`                       | Retained messages; minimum two; evicts pairs                                              |
| `HISTORY_MAX_BYTES`         | `65536`                    | Serialized history UTF-8 cap                                                              |
| `HISTORY_TTL_SECONDS`       | `86400`                    | Sliding retention TTL (one day)                                                           |
| `HISTORY_MAX_CONVERSATIONS` | `1000`                     | Global retained conversation cap                                                          |

Requests are bounded to 16 KB total and 8 KB of user text; arithmetic input is capped to 200 characters and 30 nesting levels. Outputs are bounded, as are tool steps. Provider errors are redacted to safe messages; raw exceptions and credentials are never printed by application code.

## Tests and quality checks

```bash
mise exec -- npm run test:coverage
mise exec -- npm run typecheck
mise exec -- npm run lint
mise exec -- npm run format:check
mise exec -- npm audit --audit-level=low
mise exec -- npm run build
# Or run the full implementation gate:
mise exec -- npm run check
```

Vitest tests cover every component, core logic, persistence limits/TTL/leases, missing-key preflight, exact multi-turn provider arrays, tools, streaming-before-completion, budget refusal, and error recovery. Backend tests use **the real AI SDK** with its official `MockLanguageModelV4`, not invented SDK functions. Component hook/transport mocks are typed against the installed `useChat`, `ChatInit`, and transport API. Coverage reports are written to `coverage/` (text, HTML, LCOV), with enforced thresholds.

TypeScript-aware strict ESLint, React Hooks, accessibility, and Next rules are enabled. The Next lint plugin is pinned to the audited 14.2.35 release with an ESLint 9 compatibility wrapper and its glob dependency overridden to patched 10.5.0, avoiding the unpatched braces dependency in the current newer lint configuration; the application itself uses Next 16.4.0. No audit findings are ignored or hidden.

## Production and Docker

For an ordinary production build:

```bash
mise exec -- npm run build
mise exec -- npm start
```

For the standalone output used by Docker, Next's generated `server.js` is the entrypoint. The multi-stage Dockerfile includes native SQLite dependencies, sets `NODE_ENV=production`, and runs as UID/GID 1001 with no root privileges. Compose uses a read-only root filesystem, dropped capabilities, init, a healthcheck, and a durable `chat-data` volume for SQLite.

Start the existing LiteLLM proxy on the host. Ensure it is reachable from Docker's bridge (bind it to an interface reachable from the container; Docker Desktop usually handles host forwarding). With the key already exported in your shell:

```bash
docker compose up --build -d
```

Compose passes the runtime environment credential only—never a build argument or image layer. It runs the application and its embedded SQLite dependency with persistent storage. The supplied LiteLLM service is external to this application and is **not** replaced with another provider. Do not print `docker compose config` or inspect full environment output with credentials loaded.

```bash
docker compose down
```

This preserves chat history. Removing the named volume is destructive and should only be done intentionally.

## API boundaries

- `POST /api/conversations`: create a conversation.
- `GET /api/conversations/:id`: restore bounded committed history, title, and usage.
- `POST /api/chat`: `{ conversationId, message: { id, text } }`; returns AI SDK UI message SSE, including transient title/usage and warning events. Only the current prompt is accepted; replay history is owned by the database.

Full live-provider/browser and Docker validation is intentionally reserved for the next phase; implementation checks do not require a live model or credentials.
