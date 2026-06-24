import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const smsLogsTable = pgTable("sms_logs", {
  id: serial("id").primaryKey(),
  to: text("to").notNull(),
  message: text("message").notNull(),
  provider: text("provider").notNull().default("textbelt"),
  status: text("status").notNull().default("sent"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmsLog = typeof smsLogsTable.$inferSelect;
