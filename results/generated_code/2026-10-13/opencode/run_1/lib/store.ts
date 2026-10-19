import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, eq, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import { readConfig } from "./config";
import { ChatError } from "./errors";
import { boundHistory, type Exchange } from "./history";
import { conversations } from "./schema";

const historySchema = z.array(
  z.object({ id: z.string(), user: z.string(), assistant: z.string() }),
);
export const LEASE_MS = 180000;

export function createStore(
  path = readConfig().DATABASE_PATH,
  config = readConfig(),
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, history TEXT NOT NULL DEFAULT '[]', title TEXT NOT NULL DEFAULT 'New conversation',
    warning TEXT, tokens INTEGER NOT NULL DEFAULT 0, exchanges INTEGER NOT NULL DEFAULT 0,
    expires INTEGER NOT NULL, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0
  )`);
  const db = drizzle(sqlite);
  function cleanup(now: number) {
    db.delete(conversations)
      .where(
        and(
          lte(conversations.expires, now),
          lte(conversations.leaseUntil, now),
        ),
      )
      .run();
  }
  function row(id: string) {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .get();
  }
  return {
    close: () => sqlite.close(),
    get(id: string) {
      cleanup(Date.now());
      const value = row(id);
      if (!value) return null;
      return {
        ...value,
        history: historySchema.parse(JSON.parse(value.history) as unknown),
        budget: config.TOKEN_BUDGET,
      };
    },
    begin(id: string, turnId: string) {
      return sqlite
        .transaction(() => {
          const now = Date.now();
          cleanup(now);
          let value = row(id);
          if (!value) {
            const count = db.select().from(conversations).all().length;
            if (count >= config.MAX_CONVERSATIONS)
              throw new ChatError(
                "The demo is at capacity. Please try again later.",
                503,
              );
            db.insert(conversations)
              .values({
                id,
                expires: now + config.CONVERSATION_TTL_SECONDS * 1000,
              })
              .run();
            value = row(id);
          }
          if (!value) throw new Error("Conversation creation failed");
          if (value.leaseUntil > now)
            throw new ChatError(
              "This conversation is already responding. Wait a moment and try again.",
              409,
            );
          if (value.tokens >= config.TOKEN_BUDGET)
            throw new ChatError(
              "This conversation has reached its token budget. Start a new chat to continue.",
              429,
            );
          const history = historySchema.parse(
            JSON.parse(value.history) as unknown,
          );
          if (history.some((exchange) => exchange.id === turnId))
            throw new ChatError(
              "This turn was already completed. Refresh the conversation.",
              409,
            );
          const lease = randomUUID();
          db.update(conversations)
            .set({ lease, leaseUntil: now + LEASE_MS })
            .where(eq(conversations.id, id))
            .run();
          return { ...value, history, lease };
        })
        .immediate();
    },
    finish(
      id: string,
      lease: string,
      exchange: Exchange,
      tokens: number,
      title?: string,
      warning?: string,
    ) {
      sqlite
        .transaction(() => {
          const value = row(id);
          if (!value || value.lease !== lease || value.leaseUntil <= Date.now())
            throw new ChatError("The response expired. Please try again.", 409);
          const history = historySchema.parse(
            JSON.parse(value.history) as unknown,
          );
          db.update(conversations)
            .set({
              history: JSON.stringify(
                boundHistory(
                  [...history, exchange],
                  config.HISTORY_MAX_MESSAGES,
                  config.HISTORY_MAX_BYTES,
                ),
              ),
              tokens: value.tokens + Math.max(0, Math.ceil(tokens)),
              exchanges: value.exchanges + 1,
              title: title ?? value.title,
              warning: warning ?? null,
              lease: null,
              leaseUntil: 0,
              expires: Date.now() + config.CONVERSATION_TTL_SECONDS * 1000,
            })
            .where(eq(conversations.id, id))
            .run();
        })
        .immediate();
    },
    fail(id: string, lease: string) {
      db.update(conversations)
        .set({ lease: null, leaseUntil: 0 })
        .where(and(eq(conversations.id, id), eq(conversations.lease, lease)))
        .run();
    },
  };
}

export type ChatStore = ReturnType<typeof createStore>;
let store: ChatStore | undefined;
export function getStore(): ChatStore {
  store ??= createStore();
  return store;
}
