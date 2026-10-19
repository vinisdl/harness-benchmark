I want you to build a TypeScript Next.js application (using the App Router). Use the newest Node.js available in mise here; you have access to mise. First make a short implementation plan for yourself, then implement without asking for confirmation. Do not stop to ask what to do next. Use the file and shell tools available in this runtime; if a tool call fails, recover and continue.

This is phase 1 of 3 (build). Phase 2 will validate the running app. Phase 3 will ask you to verify every numbered goal below, so implement with the goals in mind — they are the scoring contract.

The LLM backend is a LiteLLM proxy at http://localhost:4000/v1 (OPENAI_API_KEY=litellm, OPENAI_MODEL=gpt-6.1-sol). Use this endpoint — do NOT use OpenRouter or any other external provider. Never print secret values and never commit secrets into source files, .env files, Dockerfiles, compose files, logs, or README examples.

THE GOALS (numbered — you will be asked to verify each one in phase 3):

G1. A Next.js App Router application using the newest Node.js from mise. Use strict TypeScript. Generated at the workspace root (no nested app directory).

G2. A minimal ChatGPT-like SPA: Tailwind CSS, componentized React architecture (Server and Client components). No single-file CSS/JS dumps.

G3. Vercel AI SDK (ai package) configured for the LiteLLM proxy (via @ai-sdk/openai provider compatibility, pointing to http://localhost:4000/v1), using gpt-6.1-sol as the chat model (model selection overridable via OPENAI_MODEL env var).

G4. TRUE token streaming: the assistant's reply must appear in the page incrementally as tokens arrive, delivered via Vercel AI SDK's streaming capabilities (e.g., streamText and useChat). Appending the full reply after completion does not satisfy this goal.

G5. Multi-turn payload correctness: on every exchange, each user turn is sent to the provider EXACTLY once — the history you replay must exclude the prompt you are about to send. Include a unit test that asserts the exact outgoing message array for a multi-turn conversation.

G6. Concurrency-safe, bounded persistence: conversation history must survive an application restart, must behave correctly in a multi-process/concurrent environment (no purely in-memory Node process arrays), and must be bounded (message-count and byte caps) with a TTL. Use Redis (via Docker) or a lightweight local SQLite database (via Prisma or Drizzle) to achieve this.

G7. Tool calling: expose exactly two tools to the assistant using Vercel AI SDK's tool API — server_time (returns the server's current UTC time) and calculator (evaluates a basic arithmetic expression safely). When a user asks for the time or a calculation, the assistant must answer via the tool.

G8. Structured output: after the first completed exchange of a conversation, generate a short conversation title using Vercel AI SDK's structured output API (generateObject), and display it in the UI.

G9. Token budgeting: track approximate token usage per conversation (using SDK usage metadata); when a configurable budget (env var, sane default) is exceeded, refuse further turns with a friendly in-UI message instead of calling the provider.

G10. Robustness: a system prompt set through the AI SDK API; a missing-API-key preflight with a friendly, actionable error; every provider failure rescued into a visible degraded UI state; failed turns must never be stored into the history that gets replayed to the provider.

G11. Vitest tests for every component and core logic. Mocks must mirror the real Vercel AI SDK API surface (a test that mocks a nonexistent API is worse than no test). Error paths covered. Coverage reporting wired up (@vitest/coverage-v8).

G12. Strict ESLint (with TypeScript rules applied), Prettier, and npm audit all pass clean.

G13. A production-grade Dockerfile (NODE_ENV=production, non-root user, proper entrypoint utilizing Next.js standalone output) and a docker compose configuration that runs the app and its dependencies (e.g., Redis if used) locally. A README.md documenting what the app does, setup, and how to run it.

G14. No authentication (it is a demo), no secrets committed anywhere, everything inside the current workspace.

Focus this phase on implementation, tests, and structure. Do not spend time on full runtime validation beyond what keeps implementation moving.