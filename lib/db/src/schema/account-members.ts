import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { usersTable } from "./users";

export const accountMembersTable = pgTable(
  "account_members",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email").notNull(),
    role: text("role").notNull().default("viewer"),
    status: text("status").notNull().default("pending"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    accountEmailUnique: uniqueIndex("account_members_account_email_unique").on(table.accountId, table.invitedEmail),
    accountUserUnique: uniqueIndex("account_members_account_user_unique").on(table.accountId, table.userId),
  }),
);

export const insertAccountMemberSchema = createInsertSchema(accountMembersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccountMember = z.infer<typeof insertAccountMemberSchema>;
export type AccountMember = typeof accountMembersTable.$inferSelect;