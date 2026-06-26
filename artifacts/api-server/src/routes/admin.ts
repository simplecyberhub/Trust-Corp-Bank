import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, accountsTable, transactionsTable, notificationsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

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
  const { kycStatus, role } = req.body;
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (kycStatus) updates.kycStatus = kycStatus;
    if (role) updates.role = role;
    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: user.id, email: user.email, fullName: user.fullName, kycStatus: user.kycStatus, role: user.role });
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
