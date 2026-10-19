import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  history: text("history").notNull().default("[]"),
  title: text("title").notNull().default("New conversation"),
  warning: text("warning"),
  tokens: integer("tokens").notNull().default(0),
  exchanges: integer("exchanges").notNull().default(0),
  expires: integer("expires").notNull(),
  lease: text("lease"),
  leaseUntil: integer("lease_until").notNull().default(0),
});
