# Local Chat

A TypeScript Next.js App Router demo with true incremental AI SDK streaming, two tools (UTC server time and safe arithmetic), structured conversation titles, token budgets, and SQLite persistence through Drizzle. No authentication: anyone with a conversation ID can read it. Do not use this demo for sensitive information.

## Setup

Install mise, then run `mise install` and `mise exec -- npm ci`. Node.js is pinned to 26.11.1, the newest release available in mise when built. This version requires libatomic on Linux. SQLite native compilation also needs Python and a C++ toolchain (`apt-get install libatomic1 python3 make g++`).

Set `OPENAI_API_KEY` in your process environment using your local proxy credential. Do not put credentials in source, files, or logs. The provider is fixed to the LiteLLM OpenAI-compatible endpoint `http://localhost:4000/v1`. Start your existing LiteLLM proxy before chatting. `OPENAI_MODEL` defaults to `gpt-6.1-sol`.

Run `mise exec -- npm run dev` and open http://localhost:3000. For production, run `npm run build` then `npm start` under mise.

## Checks

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:coverage`, and `npm audit`.

## Persistence and limits

SQLite defaults to `data/chat.sqlite` (`DATABASE_PATH` overrides it). WAL, immediate transactions, and a 180-second conversation lease serialize turns across processes sharing the same local disk. Provider calls time out at 120 seconds; title generation at 15 seconds. Failed, cancelled, and aborted turns never enter replay history. The browser retains its conversation ID in local storage; New chat creates a new ID.

`TOKEN_BUDGET` defaults to 32000 cumulative SDK-reported tokens, including titles. Missing usage is estimated from content length. Once reached, subsequent turns are refused before a provider call. A turn may cross the budget; it is checked before the next turn. `HISTORY_MESSAGE_CAP` (80), `HISTORY_BYTE_CAP` (262144), and `CONVERSATION_TTL_SECONDS` (86400) bound saved histories. Whole oldest exchanges are removed, preserving tool call/result groups; an oversized single exchange is rejected. Expired conversations are unreadable and cleaned on subsequent turn acquisition. Token totals remain cumulative even when history is trimmed. SQLite requires a shared local filesystem; this is not a multi-host deployment architecture.

## Docker

Export the proxy credential in your shell and run `docker compose up --build`. The production image uses standalone Next.js output, runs as a non-root user, and stores SQLite in a named volume. Compose uses host networking so the mandatory localhost proxy URL reaches your already-running LiteLLM service (Linux; Docker Desktop requires host networking enabled). SQLite is embedded and needs no additional service. The proxy is intentionally managed outside this demo; no credentials are baked into the image.
