import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelMessage, UIMessage } from "ai";
import { positiveEnv } from "./config";
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  history: text("history").notNull(),
  ui: text("ui").notNull(),
  title: text("title").notNull(),
  tokens: integer("tokens").notNull(),
  expires: integer("expires").notNull(),
  lease: text("lease"),
  leaseUntil: integer("lease_until").notNull(),
});
export class ChatStore {
  private raw: Database.Database;
  private db;
  constructor(path = process.env.DATABASE_PATH || "./data/chat.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.raw = new Database(path);
    this.raw.pragma("journal_mode = WAL");
    this.raw.pragma("busy_timeout = 5000");
    this.raw.exec(
      "CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, history TEXT NOT NULL, ui TEXT NOT NULL, title TEXT NOT NULL, tokens INTEGER NOT NULL, expires INTEGER NOT NULL, lease TEXT, lease_until INTEGER NOT NULL)",
    );
    this.db = drizzle(this.raw);
  }
  read(id: string) {
    const row = this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .get();
    if (!row || row.expires < Date.now()) return null;
    return {
      ...row,
      history: JSON.parse(row.history) as ModelMessage[],
      ui: JSON.parse(row.ui) as UIMessage[],
    };
  }
  acquire(id: string, lease: string) {
    return this.raw
      .transaction(() => {
        const now = Date.now();
        this.raw
          .prepare(
            "DELETE FROM conversations WHERE expires < ? AND lease_until < ?",
          )
          .run(now, now);
        this.db
          .insert(conversations)
          .values({
            id,
            history: "[]",
            ui: "[]",
            title: "New conversation",
            tokens: 0,
            expires:
              now + positiveEnv("CONVERSATION_TTL_SECONDS", 86400) * 1000,
            lease: null,
            leaseUntil: 0,
          })
          .onConflictDoNothing()
          .run();
        const row = this.read(id)!;
        if (row.leaseUntil > now)
          throw new Error(
            "A reply is already in progress. Please wait and try again.",
          );
        if (row.tokens >= positiveEnv("TOKEN_BUDGET", 32000))
          throw new Error(
            "This conversation has reached its token budget. Start a new conversation to continue.",
          );
        this.db
          .update(conversations)
          .set({ lease, leaseUntil: now + 180000 })
          .where(eq(conversations.id, id))
          .run();
        return row;
      })
      .immediate();
  }
  release(id: string, lease: string) {
    this.raw
      .prepare(
        "UPDATE conversations SET lease = NULL, lease_until = 0 WHERE id = ? AND lease = ?",
      )
      .run(id, lease);
  }
  commit(
    id: string,
    lease: string,
    history: ModelMessage[],
    ui: UIMessage[],
    tokens: number,
    title: string,
  ) {
    this.raw
      .transaction(() => {
        const row = this.read(id);
        if (!row || row.lease !== lease || row.leaseUntil < Date.now())
          throw new Error("Conversation changed. Please reload and try again.");
        const max = positiveEnv("HISTORY_MESSAGE_CAP", 80),
          bytes = positiveEnv("HISTORY_BYTE_CAP", 262144);
        // Remove whole exchanges so tool calls/results and user/assistant pairs stay together.
        while (
          history.length > max ||
          Buffer.byteLength(JSON.stringify({ history, ui })) > bytes
        ) {
          const next = history.findIndex((m, i) => i > 0 && m.role === "user");
          if (next < 0)
            throw new Error(
              "This exchange is too large to save. Try a shorter message.",
            );
          history = history.slice(next);
          ui = ui.slice(2);
        }
        this.db
          .update(conversations)
          .set({
            history: JSON.stringify(history),
            ui: JSON.stringify(ui),
            tokens: row.tokens + tokens,
            title,
            expires:
              Date.now() +
              positiveEnv("CONVERSATION_TTL_SECONDS", 86400) * 1000,
            lease: null,
            leaseUntil: 0,
          })
          .where(eq(conversations.id, id))
          .run();
      })
      .immediate();
  }
  close() {
    this.raw.close();
  }
}
let singleton: ChatStore | undefined;
export function store() {
  return (singleton ??= new ChatStore());
}
