import { pgTable, text, serial, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const depositRequestsTable = pgTable("deposit_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  accountId: integer("account_id").notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").notNull(),
  method: text("method").notNull().default("bank_transfer"),
  reference: text("reference"),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  transactionId: integer("transaction_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDepositRequestSchema = createInsertSchema(depositRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDepositRequest = z.infer<typeof insertDepositRequestSchema>;
export type DepositRequest = typeof depositRequestsTable.$inferSelect;
