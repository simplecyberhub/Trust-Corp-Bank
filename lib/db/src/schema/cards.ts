import { pgTable, text, serial, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  accountId: integer("account_id").notNull(),
  cardType: text("card_type").notNull().default("virtual"),
  last4: text("last4").notNull(),
  holderName: text("holder_name").notNull(),
  expiryMonth: integer("expiry_month").notNull(),
  expiryYear: integer("expiry_year").notNull(),
  status: text("status").notNull().default("active"),
  network: text("network").notNull().default("visa"),
  spendLimit: doublePrecision("spend_limit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCardSchema = createInsertSchema(cardsTable).omit({ id: true, createdAt: true });
export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cardsTable.$inferSelect;
