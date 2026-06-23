import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const otpsTable = pgTable("otps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Otp = typeof otpsTable.$inferSelect;
