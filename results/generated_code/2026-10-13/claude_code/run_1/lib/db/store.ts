import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq, lte, sql } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { conversations } from '@/lib/db/schema';
import { getConfig } from '@/lib/config';
import {
  storedMessageSchema,
  type Conversation,
  type StoredMessage,
} from '@/lib/chat-types';
import { AppError } from '@/lib/errors';
import { boundHistory } from '@/lib/history';

export type StoreOptions = ReturnType<typeof getConfig>;
export type TurnLease = {
  id: string;
  lease: string;
  history: StoredMessage[];
  firstExchange: boolean;
  tokens: number;
};

export class ConversationStore {
  private readonly sqlite: Database.Database;
  private readonly db;

  constructor(private readonly options: StoreOptions = getConfig()) {
    if (options.databasePath !== ':memory:')
      mkdirSync(dirname(resolve(options.databasePath)), { recursive: true });
    this.sqlite = new Database(options.databasePath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('busy_timeout = 5000');
    this.sqlite.pragma('synchronous = NORMAL');
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, title TEXT, messages TEXT NOT NULL DEFAULT '[]',
        tokens INTEGER NOT NULL DEFAULT 0, exchanges INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS conversations_expiry ON conversations(expires_at);
    `);
    this.db = drizzle(this.sqlite);
  }

  close() {
    this.sqlite.close();
  }

  private prune(now: number) {
    this.db
      .delete(conversations)
      .where(lte(conversations.expiresAt, now))
      .run();
  }

  private row(id: string) {
    const row = this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .get();
    if (!row)
      throw new AppError(
        'not_found',
        'This conversation has expired. Start a new chat.',
        404,
      );
    return row;
  }

  private snapshot(row: typeof conversations.$inferSelect): Conversation {
    return {
      id: row.id,
      title: row.title,
      messages: z
        .array(storedMessageSchema)
        .parse(JSON.parse(row.messages) as unknown),
      tokens: row.tokens,
      budget: this.options.tokenBudget,
      expiresAt: row.expiresAt,
    };
  }

  create(): Conversation {
    return this.sqlite
      .transaction(() => {
        const now = Date.now();
        this.prune(now);
        const count =
          this.db
            .select({ count: sql<number>`count(*)` })
            .from(conversations)
            .get()?.count ?? 0;
        if (count >= this.options.maxConversations) {
          const oldest = this.db
            .select({ id: conversations.id })
            .from(conversations)
            .where(lte(conversations.leaseUntil, now))
            .orderBy(conversations.updatedAt)
            .get();
          if (!oldest)
            throw new AppError(
              'capacity',
              'All chat slots are busy. Please try again shortly.',
              503,
            );
          this.db
            .delete(conversations)
            .where(eq(conversations.id, oldest.id))
            .run();
        }
        const id = randomUUID();
        this.db
          .insert(conversations)
          .values({ id, updatedAt: now, expiresAt: now + this.options.ttlMs })
          .run();
        return this.snapshot(this.row(id));
      })
      .immediate();
  }

  get(id: string): Conversation {
    return this.sqlite
      .transaction(() => {
        this.prune(Date.now());
        return this.snapshot(this.row(id));
      })
      .immediate();
  }

  acquire(id: string, promptId: string): TurnLease {
    return this.sqlite
      .transaction(() => {
        const now = Date.now();
        this.prune(now);
        const row = this.row(id);
        if (row.lease && row.leaseUntil > now) {
          throw new AppError(
            'busy',
            'This conversation is already answering in another tab. Please wait and reload.',
            409,
          );
        }
        if (row.tokens >= this.options.tokenBudget) {
          throw new AppError(
            'budget_exceeded',
            'This chat has reached its token budget. Start a new chat to keep going.',
            429,
          );
        }
        const snapshot = this.snapshot(row);
        if (snapshot.messages.some((message) => message.id === promptId)) {
          throw new AppError(
            'duplicate_turn',
            'That turn has already been saved. Reload this conversation before continuing.',
            409,
          );
        }
        const lease = randomUUID();
        this.db
          .update(conversations)
          .set({ lease, leaseUntil: now + this.options.leaseMs })
          .where(eq(conversations.id, id))
          .run();
        return {
          id,
          lease,
          history: snapshot.messages,
          firstExchange: row.exchanges === 0,
          tokens: row.tokens,
        };
      })
      .immediate();
  }

  commit(
    turn: TurnLease,
    user: StoredMessage,
    assistant: StoredMessage,
    tokens: number,
  ): Conversation {
    return this.sqlite
      .transaction(() => {
        const row = this.row(turn.id);
        if (row.lease !== turn.lease || row.leaseUntil <= Date.now()) {
          throw new AppError(
            'lease_expired',
            'This response timed out and was not saved. Please reload and try again.',
            409,
          );
        }
        const history = this.snapshot(row).messages;
        const messages = boundHistory(
          [...history, user, assistant],
          this.options.maxMessages,
          this.options.maxBytes,
        );
        const now = Date.now();
        this.db
          .update(conversations)
          .set({
            messages: JSON.stringify(messages),
            tokens: row.tokens + tokens,
            exchanges: row.exchanges + 1,
            updatedAt: now,
            expiresAt: now + this.options.ttlMs,
          })
          .where(eq(conversations.id, turn.id))
          .run();
        return this.snapshot(this.row(turn.id));
      })
      .immediate();
  }

  setTitle(turn: TurnLease, title: string, tokens: number): Conversation {
    return this.sqlite
      .transaction(() => {
        const row = this.row(turn.id);
        if (row.lease !== turn.lease || row.leaseUntil <= Date.now()) {
          throw new AppError(
            'lease_expired',
            'Title generation timed out. Reload to see the saved conversation.',
            409,
          );
        }
        this.db
          .update(conversations)
          .set({ title: title.slice(0, 80), tokens: row.tokens + tokens })
          .where(eq(conversations.id, turn.id))
          .run();
        return this.snapshot(this.row(turn.id));
      })
      .immediate();
  }

  release(turn: TurnLease, failedUsage = 0) {
    // Fence every cleanup: an old worker cannot unlock a newer worker's lease.
    this.db
      .update(conversations)
      .set({
        lease: null,
        leaseUntil: 0,
        tokens: sql`${conversations.tokens} + ${failedUsage}`,
      })
      .where(
        and(eq(conversations.id, turn.id), eq(conversations.lease, turn.lease)),
      )
      .run();
  }
}

// Connections may be process-local; all authoritative data and leases are in SQLite.
let store: ConversationStore | undefined;
export function getStore(): ConversationStore {
  store ??= new ConversationStore();
  return store;
}
