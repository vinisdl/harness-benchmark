# Local Chat

A minimal ChatGPT-like demo built at the workspace root with Next.js App Router, strict TypeScript, React, Tailwind CSS, and Vercel AI SDK. No authentication. The assistant streams text as it arrives, remembers completed exchanges across restarts, and can use two tools: **server_time** (UTC) and **calculator** (safe basic arithmetic).

## Setup

Use mise to activate the pinned newest available Node.js release, **26.11.1**:

```sh
mise install
mise exec -- npm ci
mise exec -- npm run dev
```

If mise isn't on PATH, use its installation path (commonly `~/.local/bin/mise`). Linux needs `libatomic1`; native SQLite compilation needs Python, make, and a C++ compiler. On Debian: `apt-get install libatomic1 python3 make g++`.

Before starting the server, supply `OPENAI_API_KEY` through your runtime environment or secret manager. It is required; missing credentials produce an actionable in-page error. Do not place credentials in source or configuration files. This project deliberately includes no credential-bearing environment file.

The OpenAI-compatible provider is fixed to **http://localhost:4000/v1**, using the LiteLLM proxy already running locally. It uses the Chat Completions API, never an external provider directly. Default model: **gpt-6.1-sol**; set `OPENAI_MODEL` in the server environment to override it. Open **http://localhost:3000**.

## Commands

```sh
mise exec -- npm run build
mise exec -- npm start
mise exec -- npm run check
mise exec -- npm run format
```

`check` runs strict TypeScript, typed ESLint, Prettier, Vitest with V8 coverage, and npm audit. Coverage is generated in `coverage/` (HTML and LCOV). Tests exercise every component, real SDK stream processing through `MockLanguageModelV4`, exact outgoing multi-turn arrays, tool execution, structured output, SQLite concurrency/restarts/caps/TTL, budgets, and degraded/error states. No real provider requests are made by unit tests.

## Persistence and limits

SQLite via Drizzle uses a persistent `data/chat.db` file, WAL mode, a busy timeout, and immediate transactions. A fenced, expiring database lease serializes provider calls per conversation across processes. A concurrent request gets a friendly conflict instead of replaying stale history. SQLite must be on a shared **local filesystem** for processes sharing the database.

Only fully successful user/assistant pairs are committed atomically. The browser submits **only the newest user prompt**; authoritative saved history is replayed server-side, then the prompt is appended exactly once. Failed and stopped turns never enter replay history. Duplicate completed turn IDs are rejected. Tool calls run within the current SDK exchange; persisted replay contains the final user/assistant text pairs.

The first completed exchange also generates a short title with `generateObject` and a Zod schema. Title failures leave the successful reply intact and display a visible warning. Successful token usage includes all streaming tool steps and title generation. Usage is approximate: SDK metadata is used when available, with a character-based fallback when absent. Budget checks happen inside the conversation transaction, before any provider request for the next turn; a turn may overshoot the budget, after which further turns are refused.

| Runtime variable           | Default                | Purpose                                       |
| -------------------------- | ---------------------- | --------------------------------------------- |
| `OPENAI_API_KEY`           | Required, runtime only | LiteLLM proxy credential                      |
| `OPENAI_MODEL`             | `gpt-6.1-sol`          | Chat and title model                          |
| `TOKEN_BUDGET`             | `32000`                | Approximate tokens per conversation           |
| `HISTORY_MAX_MESSAGES`     | `40`                   | Retained message count; evicts complete pairs |
| `HISTORY_MAX_BYTES`        | `65536`                | UTF-8 byte cap on serialized history          |
| `CONVERSATION_TTL_SECONDS` | `86400`                | Sliding expiration after successful exchanges |
| `MAX_CONVERSATIONS`        | `500`                  | Global retained conversation cap              |
| `DATABASE_PATH`            | `data/chat.db`         | Persistent SQLite file                        |

Expired conversations are purged on database reads/writes; retained pairs are evicted oldest-first, and an exchange larger than the byte cap is not retained. Token counters remain cumulative even when old text is evicted. The maximum conversation count bounds overall stored history. SQLite reuses freed pages. An abandoned lease expires after three minutes; provider requests have a two-minute timeout and title generation a fifteen-second timeout.

The browser keeps the current conversation ID in localStorage to restore history on reload. **New chat** starts another conversation; older conversations expire by TTL. There is no authentication, so this is a local demo, and conversation IDs are not an access-control mechanism.

## Docker

The multi-stage Dockerfile compiles native SQLite during dependency installation, builds Next.js standalone output, and runs `node server.js` as the non-root `node` user with `NODE_ENV=production`. Credentials are injected only at runtime.

With the LiteLLM proxy running on the host at port 4000 and `OPENAI_API_KEY` already supplied in the shell environment:

```sh
docker compose up --build -d
docker compose down
```

Compose runs the app and its embedded SQLite dependency with a durable named volume. It uses **host networking** so the required `localhost:4000` URL reaches the host proxy (Linux, or Docker Desktop with host networking enabled). Port 3000 must be available. `docker compose down` preserves history; `docker compose down --volumes` removes it. No proxy credentials or provider secrets are included in image layers or examples.

## Structure

- `app/`: Server Component page/layout and Node.js API routes.
- `components/`: Client chat orchestration/composer and focused presentation components.
- `lib/`: AI SDK orchestration, provider preflight, tools, bounded history, configuration, and transactional Drizzle store.
- `tests/`: Component, core logic, persistence, SDK streaming, and route tests.
