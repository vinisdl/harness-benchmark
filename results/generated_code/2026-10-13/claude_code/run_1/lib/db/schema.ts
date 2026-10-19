import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title'),
  messages: text('messages').notNull().default('[]'),
  tokens: integer('tokens').notNull().default(0),
  exchanges: integer('exchanges').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lease: text('lease'),
  leaseUntil: integer('lease_until').notNull().default(0),
});
