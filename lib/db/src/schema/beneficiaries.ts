import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const beneficiariesTable = pgTable("beneficiaries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  accountNumber: text("account_number").notNull(),
  bankName: text("bank_name").notNull(),
  currency: text("currency").notNull().default("USD"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBeneficiarySchema = createInsertSchema(beneficiariesTable).omit({ id: true, createdAt: true });
export type InsertBeneficiary = z.infer<typeof insertBeneficiarySchema>;
export type Beneficiary = typeof beneficiariesTable.$inferSelect;
