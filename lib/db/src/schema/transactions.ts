import { pgTable, text, serial, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  type: text("type").notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("completed"),
  description: text("description").notNull(),
  reference: text("reference"),
  recipientName: text("recipient_name"),
  recipientAccount: text("recipient_account"),
  senderName: text("sender_name"),
  balanceAfter: doublePrecision("balance_after"),
  // Bank transfer details
  bankName: text("bank_name"),
  bankCountry: text("bank_country"),
  transferType: text("transfer_type"), // "domestic" | "international"
  routingNumber: text("routing_number"),
  swiftCode: text("swift_code"),
  iban: text("iban"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
