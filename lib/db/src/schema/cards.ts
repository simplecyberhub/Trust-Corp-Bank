import { pgTable, text, serial, timestamp, integer, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  accountId: integer("account_id").notNull(),
  cardType: text("card_type").notNull().default("virtual"),
  last4: text("last4").notNull(),
  fullNumber: text("full_number"),
  cvv: text("cvv"),
  holderName: text("holder_name").notNull(),
  nickname: text("nickname"),
  color: text("color").notNull().default("blue"),
  expiryMonth: integer("expiry_month").notNull(),
  expiryYear: integer("expiry_year").notNull(),
  status: text("status").notNull().default("active"),
  network: text("network").notNull().default("visa"),
  spendLimit: doublePrecision("spend_limit"),
  dailyLimit: doublePrecision("daily_limit"),
  contactlessEnabled: boolean("contactless_enabled").notNull().default(true),
  onlineEnabled: boolean("online_enabled").notNull().default(true),
  atmEnabled: boolean("atm_enabled").notNull().default(true),
  internationalEnabled: boolean("international_enabled").notNull().default(false),
  lostReportedAt: timestamp("lost_reported_at", { withTimezone: true }),
  replacesCardId: integer("replaces_card_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCardSchema = createInsertSchema(cardsTable).omit({ id: true, createdAt: true });
export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cardsTable.$inferSelect;
