import { pgTable, text, serial, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  accountNumber: text("account_number").notNull().unique(),
  accountType: text("account_type").notNull().default("fiat"),
  currency: text("currency").notNull().default("USD"),
  balance: doublePrecision("balance").notNull().default(0),
  status: text("status").notNull().default("active"),
  nickname: text("nickname"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
