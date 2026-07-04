import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  kycStatus: text("kyc_status").notNull().default("pending"),
  address: text("address"),
  dateOfBirth: text("date_of_birth"),
  idType: text("id_type"),
  idNumber: text("id_number"),
  role: text("role").notNull().default("user"),
  transactionPin: text("transaction_pin"),
  pinAttempts: integer("pin_attempts").notNull().default(0),
  pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  // Admin-managed restrictions
  transferRestricted: boolean("transfer_restricted").notNull().default(false),
  banned: boolean("banned").notNull().default(false),
  bannedReason: text("banned_reason"),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  hardFrozen: boolean("hard_frozen").notNull().default(false),
  // TOTP / Authenticator-app 2FA (hard token)
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
