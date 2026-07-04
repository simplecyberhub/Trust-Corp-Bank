import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, accountsTable, transactionsTable, notificationsTable, supportTicketsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { notifyAsync } from "../services/notifications";

const router = Router();

async function getAdminUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  if (!user || user.role !== "admin") return null;
  return user;
}

async function requireAdmin(req: any, res: any, next: any) {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const admin = await getAdminUser(clerkId);
  if (!admin) { res.status(403).json({ error: "Forbidden: Admin access required" }); return; }
  req.adminUser = admin;
  next();
}

router.post("/admin/setup", async (req, res): Promise<void> => {
  // Require a server-side setup secret to prevent any authenticated user from self-promoting.
  // Set ADMIN_SETUP_SECRET env var to a strong random value; share it only with the intended admin.
  const setupSecret = process.env.ADMIN_SETUP_SECRET;
  if (!setupSecret) {
    res.status(503).json({ error: "Admin bootstrap is disabled. Set ADMIN_SETUP_SECRET to enable it." });
    return;
  }
  if (req.body?.secret !== setupSecret) {
    res.status(403).json({ error: "Invalid setup secret." });
    return;
  }

  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!existing) { res.status(404).json({ error: "User not found. Sign in to the main app first." }); return; }

    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.role, "admin"));
    if (Number(countRow?.count ?? 0) > 0) {
      res.status(403).json({ error: "An administrator already exists. Contact your admin for access." });
      return;
    }

    const [updated] = await db.update(usersTable)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
    res.json({ success: true, message: `${updated.fullName} is now an Administrator.` });
  } catch (err) {
    req.log.error({ err }, "adminSetup error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/me", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: user.id, email: user.email, fullName: user.fullName, role: user.role, isAdmin: user.role === "admin" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/stats", requireAdmin, async (req, res): Promise<void> => {
  try {
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    const [accountCount] = await db.select({ count: sql<number>`count(*)` }).from(accountsTable);
    const [txCount] = await db.select({ count: sql<number>`count(*)` }).from(transactionsTable);
    const [pendingKyc] = await db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.kycStatus, "submitted"));
    const [totalBalance] = await db.select({ total: sql<number>`coalesce(sum(balance), 0)` })
      .from(accountsTable).where(eq(accountsTable.currency, "USD"));

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [volume24h] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` })
      .from(transactionsTable)
      .where(sql`created_at >= ${yesterday.toISOString()}`);

    res.json({
      userCount: Number(userCount.count),
      accountCount: Number(accountCount.count),
      transactionCount: Number(txCount.count),
      pendingKyc: Number(pendingKyc.count),
      totalBalanceUsd: Number(totalBalance.total),
      transactionVolume24h: Number(volume24h.total),
    });
  } catch (err) {
    req.log.error({ err }, "adminStats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset);
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    res.json({
      items: users.map(u => ({
        id: u.id, clerkId: u.clerkId, email: u.email, fullName: u.fullName,
        kycStatus: u.kycStatus, role: u.role, phone: u.phone ?? null,
        phoneVerified: u.phoneVerified, hasPin: !!u.transactionPin,
        totpEnabled: u.totpEnabled,
        transferRestricted: u.transferRestricted,
        banned: u.banned,
        bannedReason: u.bannedReason ?? null,
        bannedAt: u.bannedAt?.toISOString() ?? null,
        hardFrozen: u.hardFrozen,
        createdAt: u.createdAt.toISOString(),
      })),
      total: Number(countRow.count), limit, offset,
    });
  } catch (err) {
    req.log.error({ err }, "adminListUsers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { kycStatus, role, transferRestricted, banned, bannedReason, hardFrozen } = req.body;
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (kycStatus !== undefined) updates.kycStatus = kycStatus;
    if (role !== undefined) updates.role = role;
    if (transferRestricted !== undefined) updates.transferRestricted = Boolean(transferRestricted);
    if (hardFrozen !== undefined) updates.hardFrozen = Boolean(hardFrozen);
    if (banned !== undefined) {
      updates.banned = Boolean(banned);
      if (banned) {
        updates.bannedAt = new Date();
        updates.bannedReason = bannedReason ?? "Policy violation";
        // Freeze all user accounts when banning
        await db.update(accountsTable)
          .set({ status: "frozen", updatedAt: new Date() })
          .where(eq(accountsTable.userId, id));
      } else {
        updates.bannedAt = null;
        updates.bannedReason = null;
      }
    }
    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    // Notify user of KYC status changes
    if (kycStatus === "approved") {
      notifyAsync(user.id, "KYC Approved ✓", "Your identity has been verified. You now have full access to Trust Corp Bank services.", "kyc");
    } else if (kycStatus === "rejected") {
      notifyAsync(user.id, "KYC Application Rejected", "Your identity verification was not approved. Please contact support for assistance.", "kyc");
    }
    // Notify on ban/unban
    if (banned === false) {
      notifyAsync(user.id, "Account Reinstated", "Your account has been reinstated. You may now use Trust Corp Bank services.", "security");
    }
    res.json({
      id: user.id, email: user.email, fullName: user.fullName,
      kycStatus: user.kycStatus, role: user.role,
      totpEnabled: user.totpEnabled,
      transferRestricted: user.transferRestricted,
      banned: user.banned, bannedReason: user.bannedReason ?? null,
      hardFrozen: user.hardFrozen,
    });
  } catch (err) {
    req.log.error({ err }, "adminUpdateUser error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/accounts", requireAdmin, async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const rows = await db.select({
      id: accountsTable.id, userId: accountsTable.userId,
      accountNumber: accountsTable.accountNumber, accountType: accountsTable.accountType,
      currency: accountsTable.currency, balance: accountsTable.balance,
      status: accountsTable.status, nickname: accountsTable.nickname,
      createdAt: accountsTable.createdAt,
      userEmail: usersTable.email, userFullName: usersTable.fullName,
    }).from(accountsTable)
      .leftJoin(usersTable, eq(accountsTable.userId, usersTable.id))
      .orderBy(desc(accountsTable.createdAt)).limit(limit).offset(offset);
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(accountsTable);
    res.json({
      items: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), nickname: r.nickname ?? null })),
      total: Number(countRow.count), limit, offset,
    });
  } catch (err) {
    req.log.error({ err }, "adminListAccounts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/accounts/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, balance } = req.body;
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (balance !== undefined) updates.balance = Number(balance);
    const [account] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, id)).returning();
    if (!account) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: account.id, status: account.status, balance: account.balance });
  } catch (err) {
    req.log.error({ err }, "adminUpdateAccount error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/transactions", requireAdmin, async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const txs = await db.select().from(transactionsTable).orderBy(desc(transactionsTable.createdAt)).limit(limit).offset(offset);
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(transactionsTable);
    res.json({
      items: txs.map(t => ({
        id: t.id, accountId: t.accountId, type: t.type, amount: t.amount,
        currency: t.currency, status: t.status, description: t.description,
        reference: t.reference ?? null, recipientName: t.recipientName ?? null,
        recipientAccount: t.recipientAccount ?? null, balanceAfter: t.balanceAfter ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      total: Number(countRow.count), limit, offset,
    });
  } catch (err) {
    req.log.error({ err }, "adminListTransactions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/notifications/broadcast", requireAdmin, async (req, res): Promise<void> => {
  const { title, message, type = "system" } = req.body;
  if (!title || !message) { res.status(400).json({ error: "title and message are required" }); return; }
  try {
    const users = await db.select({ id: usersTable.id }).from(usersTable);
    if (users.length === 0) { res.json({ sent: 0, message: "No users to notify." }); return; }
    await db.insert(notificationsTable).values(
      users.map(u => ({ userId: u.id, title, message, type, read: false }))
    );
    res.json({ sent: users.length, message: `Broadcast sent to ${users.length} users.` });
  } catch (err) {
    req.log.error({ err }, "adminBroadcast error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ─── SMS GATEWAY ADMIN ROUTES ───────────────────────────────────────────── */

import { settingsTable, smsLogsTable } from "@workspace/db";
import { getSmsConfig, saveSmsConfig, sendSms } from "../services/sms";
import { desc as descOp } from "drizzle-orm";

router.get("/admin/sms/config", requireAdmin, async (req, res): Promise<void> => {
  try {
    const config = await getSmsConfig();
    res.json({
      provider: config.provider,
      apiKey: config.apiKey ? config.apiKey.slice(0, 4) + "••••••••" + config.apiKey.slice(-4) : "",
      apiKeySet: !!config.apiKey,
      senderId: config.senderId,
      webhookUrl: config.webhookUrl ?? "",
      enabled: config.enabled,
    });
  } catch (err) {
    req.log.error({ err }, "getSmsConfig error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/sms/config", requireAdmin, async (req, res): Promise<void> => {
  const { provider, apiKey, senderId, webhookUrl, enabled } = req.body;
  try {
    await saveSmsConfig({
      ...(provider !== undefined && { provider }),
      ...(apiKey !== undefined && apiKey !== "" && { apiKey }),
      ...(senderId !== undefined && { senderId }),
      ...(webhookUrl !== undefined && { webhookUrl }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
    });
    res.json({ success: true, message: "SMS configuration saved." });
  } catch (err) {
    req.log.error({ err }, "saveSmsConfig error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/sms/test", requireAdmin, async (req, res): Promise<void> => {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") { res.status(400).json({ error: "phone is required" }); return; }
  try {
    const result = await sendSms(phone.trim(), `TrustCorp: This is a test SMS from your admin panel. Gateway is working correctly. Time: ${new Date().toUTCString()}`);
    if (result.success) {
      res.json({ success: true, message: `Test SMS sent to ${phone}.` });
    } else {
      res.status(400).json({ success: false, error: result.error ?? "Failed to send SMS." });
    }
  } catch (err) {
    req.log.error({ err }, "sendTestSms error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ─── USER-SPECIFIC MANAGEMENT ROUTES ─────────────────────────────────────── */

// Get a specific user's bank accounts (used by admin finance panel)
router.get("/admin/users/:userId/accounts", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!userId) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const accounts = await db.select().from(accountsTable)
      .where(eq(accountsTable.userId, userId))
      .orderBy(desc(accountsTable.createdAt));
    res.json(accounts);
  } catch (err) {
    req.log.error({ err }, "adminGetUserAccounts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get Clerk metadata for a user (2FA status, email verification, login methods)
router.get("/admin/users/:userId/clerk-info", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!userId) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [user] = await db.select({ clerkId: usersTable.clerkId })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${user.clerkId}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
    });
    if (!clerkRes.ok) { res.status(502).json({ error: "Failed to fetch Clerk data" }); return; }

    const data: any = await clerkRes.json();
    const primaryEmail = (data.email_addresses ?? []).find(
      (e: any) => e.id === data.primary_email_address_id
    );
    res.json({
      twoFactorEnabled: data.two_factor_enabled ?? false,
      emailVerified: primaryEmail?.verification?.status === "verified",
      primaryEmail: primaryEmail?.email_address ?? null,
      primaryEmailId: primaryEmail?.id ?? null,
      externalAccounts: (data.external_accounts ?? []).map((a: any) => a.provider),
      lastSignInAt: data.last_sign_in_at
        ? new Date(data.last_sign_in_at).toISOString()
        : null,
    });
  } catch (err) {
    req.log.error({ err }, "adminClerkInfo error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Hard-freeze: freeze/unfreeze ALL accounts for a user at once
router.post("/admin/users/:userId/hard-freeze", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!userId) { res.status(400).json({ error: "Invalid id" }); return; }
  const freeze = req.body?.freeze !== false; // default true
  try {
    await db.update(usersTable)
      .set({ hardFrozen: freeze, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    await db.update(accountsTable)
      .set({ status: freeze ? "frozen" : "active", updatedAt: new Date() })
      .where(eq(accountsTable.userId, userId));
    if (freeze) {
      notifyAsync(userId, "Accounts Frozen", "All your accounts have been frozen by Trust Corp. Please contact support immediately.", "security");
    } else {
      notifyAsync(userId, "Accounts Unfrozen", "Your accounts have been unfrozen and are now active again.", "security");
    }
    res.json({ success: true, hardFrozen: freeze });
  } catch (err) {
    req.log.error({ err }, "adminHardFreeze error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Credit a user's account
router.post("/admin/users/:userId/credit", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!userId) { res.status(400).json({ error: "Invalid id" }); return; }
  const { accountId, amount, description } = req.body;
  if (!accountId || !amount || amount <= 0) {
    res.status(400).json({ error: "accountId and a positive amount are required" }); return;
  }
  try {
    const result = await db.transaction(async (trx) => {
      const [account] = await trx.select().from(accountsTable)
        .where(and(eq(accountsTable.id, Number(accountId)), eq(accountsTable.userId, userId)));
      if (!account) throw Object.assign(new Error("Account not found"), { status: 404 });
      const newBalance = account.balance + Number(amount);
      await trx.update(accountsTable)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(accountsTable.id, account.id));
      const [tx] = await trx.insert(transactionsTable).values({
        accountId: account.id,
        type: "credit",
        amount: Number(amount),
        currency: account.currency,
        status: "completed",
        description: description ?? "Admin credit adjustment",
        reference: "ADM" + randomBytes(5).toString("hex").toUpperCase(),
        balanceAfter: newBalance,
      }).returning();
      return { tx, newBalance, currency: account.currency };
    });
    notifyAsync(userId, "Account Credit", `${result.currency} ${Number(amount).toFixed(2)} has been credited to your account. New balance: ${result.currency} ${Number(result.newBalance).toFixed(2)}. Ref: ${result.tx.reference ?? ""}.`, "transaction");
    res.json({ success: true, transaction: result.tx, newBalance: result.newBalance });
  } catch (err: any) {
    if (err.status === 404) { res.status(404).json({ error: err.message }); return; }
    req.log.error({ err }, "adminCredit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Debit a user's account
router.post("/admin/users/:userId/debit", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!userId) { res.status(400).json({ error: "Invalid id" }); return; }
  const { accountId, amount, description } = req.body;
  if (!accountId || !amount || amount <= 0) {
    res.status(400).json({ error: "accountId and a positive amount are required" }); return;
  }
  try {
    const result = await db.transaction(async (trx) => {
      const [account] = await trx.select().from(accountsTable)
        .where(and(eq(accountsTable.id, Number(accountId)), eq(accountsTable.userId, userId)));
      if (!account) throw Object.assign(new Error("Account not found"), { status: 404 });
      if (account.balance < Number(amount)) throw Object.assign(new Error("Insufficient balance"), { status: 400 });
      const newBalance = account.balance - Number(amount);
      await trx.update(accountsTable)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(accountsTable.id, account.id));
      const [tx] = await trx.insert(transactionsTable).values({
        accountId: account.id,
        type: "debit",
        amount: Number(amount),
        currency: account.currency,
        status: "completed",
        description: description ?? "Admin debit adjustment",
        reference: "ADM" + randomBytes(5).toString("hex").toUpperCase(),
        balanceAfter: newBalance,
      }).returning();
      return { tx, newBalance, currency: account.currency };
    });
    notifyAsync(userId, "Account Debit", `${result.currency} ${Number(amount).toFixed(2)} has been debited from your account. Balance: ${result.currency} ${Number(result.newBalance).toFixed(2)}. Ref: ${result.tx.reference ?? ""}.`, "transaction");
    res.json({ success: true, transaction: result.tx, newBalance: result.newBalance });
  } catch (err: any) {
    if (err.status === 404) { res.status(404).json({ error: err.message }); return; }
    if (err.status === 400) { res.status(400).json({ error: err.message }); return; }
    req.log.error({ err }, "adminDebit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Send a custom in-platform SMS to a user
router.post("/admin/users/:userId/sms", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!userId) { res.status(400).json({ error: "Invalid id" }); return; }
  const { message } = req.body;
  if (!message || typeof message !== "string" || message.trim().length < 5) {
    res.status(400).json({ error: "A message of at least 5 characters is required" }); return;
  }
  try {
    const [user] = await db.select({ phone: usersTable.phone, fullName: usersTable.fullName })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!user.phone) { res.status(400).json({ error: "User has no phone number on file" }); return; }
    const result = await sendSms(user.phone, message.trim());
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error ?? "SMS delivery failed" }); return;
    }
    // Also create an in-app notification for the message
    notifyAsync(userId, "Message from Trust Corp", message.trim(), "system");
    res.json({ success: true, message: `SMS sent to ${user.fullName} (${user.phone})` });
  } catch (err) {
    req.log.error({ err }, "adminSendSms error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ─── SUPPORT TICKET ADMIN ROUTES ─────────────────────────────────────────── */

router.get("/admin/support-tickets", requireAdmin, async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const status = req.query.status as string | undefined;

    const rows = await db.select({
      id: supportTicketsTable.id,
      userId: supportTicketsTable.userId,
      subject: supportTicketsTable.subject,
      message: supportTicketsTable.message,
      status: supportTicketsTable.status,
      priority: supportTicketsTable.priority,
      adminReply: supportTicketsTable.adminReply,
      adminUserId: supportTicketsTable.adminUserId,
      createdAt: supportTicketsTable.createdAt,
      updatedAt: supportTicketsTable.updatedAt,
      userEmail: usersTable.email,
      userFullName: usersTable.fullName,
    })
      .from(supportTicketsTable)
      .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
      .where(status ? eq(supportTicketsTable.status, status) : undefined)
      .orderBy(desc(supportTicketsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(supportTicketsTable)
      .where(status ? eq(supportTicketsTable.status, status) : undefined);

    res.json({
      items: rows.map(r => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total: Number(countRow?.count ?? 0), limit, offset,
    });
  } catch (err) {
    req.log.error({ err }, "adminListTickets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

const VALID_TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

router.patch("/admin/support-tickets/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, adminReply } = req.body;
  if (status && !VALID_TICKET_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_TICKET_STATUSES.join(", ")}` }); return;
  }
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (adminReply !== undefined) updates.adminReply = adminReply;
    if (adminReply) updates.adminUserId = (req as any).adminUser?.id;
    const [ticket] = await db.update(supportTicketsTable).set(updates)
      .where(eq(supportTicketsTable.id, id)).returning();
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json({ ...ticket, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "adminUpdateTicket error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/sms/logs", requireAdmin, async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const logs = await db.select().from(smsLogsTable).orderBy(descOp(smsLogsTable.createdAt)).limit(limit).offset(offset);
    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(smsLogsTable);
    res.json({
      items: logs.map(l => ({
        id: l.id, to: l.to, message: l.message, provider: l.provider,
        status: l.status, error: l.error ?? null, createdAt: l.createdAt.toISOString(),
      })),
      total: Number(countRow?.count ?? 0), limit, offset,
    });
  } catch (err) {
    req.log.error({ err }, "getSmsLogs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
