import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, accountsTable, transactionsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  ListTransactionsQueryParams,
  GetTransactionParams,
  SendMoneyBody,
  TopUpAccountBody,
} from "@workspace/api-zod";
import { getUserId } from "./accounts";
import { randomBytes } from "crypto";
import { sendSms, formatSmsAlert } from "../services/sms";

const router = Router();

function genRef() {
  return "TCB" + randomBytes(6).toString("hex").toUpperCase();
}

async function getUserPhone(clerkId: string): Promise<string | null> {
  try {
    const [user] = await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    return user?.phone ?? null;
  } catch { return null; }
}

router.get("/transactions", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = ListTransactionsQueryParams.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }

  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json({ items: [], total: 0, limit: 20, offset: 0 }); return; }

    const accounts = await db.select({ id: accountsTable.id })
      .from(accountsTable).where(eq(accountsTable.userId, uid));
    const accountIds = accounts.map(a => a.id);
    if (accountIds.length === 0) { res.json({ items: [], total: 0, limit: 20, offset: 0 }); return; }

    const { limit = 20, offset = 0, accountId, type } = parse.data;

    const accountFilter = accountId
      ? and(eq(transactionsTable.accountId, accountId), inArray(transactionsTable.accountId, accountIds))
      : inArray(transactionsTable.accountId, accountIds);

    const typeFilter = type ? eq(transactionsTable.type, type) : undefined;
    const whereClause = typeFilter ? and(accountFilter, typeFilter) : accountFilter;

    const items = await db.select().from(transactionsTable)
      .where(whereClause)
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(transactionsTable)
      .where(whereClause);

    res.json({
      items: items.map(formatTx),
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    });
  } catch (err) {
    req.log.error({ err }, "listTransactions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/transactions/activity", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json([]); return; }
    const accounts = await db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.userId, uid));
    const ids = accounts.map(a => a.id);
    if (ids.length === 0) { res.json([]); return; }
    const txs = await db.select().from(transactionsTable)
      .where(inArray(transactionsTable.accountId, ids))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(10);
    res.json(txs.map(formatTx));
  } catch (err) {
    req.log.error({ err }, "getRecentActivity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/transactions/:txId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = GetTransactionParams.safeParse({ txId: Number(req.params.txId) });
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "Not found" }); return; }

    const userAccounts = await db.select({ id: accountsTable.id })
      .from(accountsTable).where(eq(accountsTable.userId, uid));
    const accountIds = userAccounts.map(a => a.id);
    if (accountIds.length === 0) { res.status(404).json({ error: "Not found" }); return; }

    const rows = await db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.id, parse.data.txId), inArray(transactionsTable.accountId, accountIds)))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatTx(rows[0]));
  } catch (err) {
    req.log.error({ err }, "getTransaction error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/transactions/send", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = SendMoneyBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }

    // Enforce admin-set user restrictions before proceeding
    const [userFlags] = await db.select({
      banned: usersTable.banned,
      transferRestricted: usersTable.transferRestricted,
      hardFrozen: usersTable.hardFrozen,
    }).from(usersTable).where(eq(usersTable.id, uid)).limit(1);
    if (userFlags?.banned) {
      res.status(403).json({ error: "Your account has been suspended. Please contact support." }); return;
    }
    if (userFlags?.hardFrozen) {
      res.status(403).json({ error: "Your accounts are currently frozen. Please contact support." }); return;
    }
    if (userFlags?.transferRestricted) {
      res.status(403).json({ error: "Transfers are restricted on your account. Please contact support." }); return;
    }

    const { fromAccountId, amount, currency, description, recipientAccount, recipientName } = parse.data;

    const tx = await db.transaction(async (trx) => {
      const [account] = await trx.select().from(accountsTable)
        .where(and(eq(accountsTable.id, fromAccountId), eq(accountsTable.userId, uid)));
      if (!account) throw Object.assign(new Error("Account not found"), { status: 404 });
      if (account.status === "frozen") throw Object.assign(new Error("This account is frozen"), { status: 403 });
      if (account.balance < amount) throw Object.assign(new Error("Insufficient funds"), { status: 400 });

      const newBalance = account.balance - amount;
      await trx.update(accountsTable)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(accountsTable.id, fromAccountId));

      const [inserted] = await trx.insert(transactionsTable).values({
        accountId: fromAccountId,
        type: "transfer",
        amount,
        currency,
        status: "completed",
        description,
        reference: genRef(),
        recipientName: recipientName ?? null,
        recipientAccount: recipientAccount ?? null,
        balanceAfter: newBalance,
      }).returning();

      return inserted;
    });

    res.status(201).json(formatTx(tx));

    // Fire SMS alert asynchronously after response is sent
    getUserPhone(clerkId).then((phone) => {
      if (phone) {
        sendSms(phone, formatSmsAlert("transfer", {
          currency,
          amount,
          recipient: recipientName ?? recipientAccount ?? "recipient",
          ref: tx.reference ?? "",
          balance: tx.balanceAfter ?? 0,
        })).catch(() => {});
      }
    }).catch(() => {});

  } catch (err: any) {
    if (err.status === 404) { res.status(404).json({ error: err.message }); return; }
    if (err.status === 400) { res.status(400).json({ error: err.message }); return; }
    req.log.error({ err }, "sendMoney error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/transactions/topup", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = TopUpAccountBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }

    // Enforce admin-set user restrictions
    const [userFlags] = await db.select({
      banned: usersTable.banned,
      hardFrozen: usersTable.hardFrozen,
    }).from(usersTable).where(eq(usersTable.id, uid)).limit(1);
    if (userFlags?.banned) {
      res.status(403).json({ error: "Your account has been suspended. Please contact support." }); return;
    }
    if (userFlags?.hardFrozen) {
      res.status(403).json({ error: "Your accounts are currently frozen. Please contact support." }); return;
    }

    const { accountId, amount, currency } = parse.data;

    const tx = await db.transaction(async (trx) => {
      const [account] = await trx.select().from(accountsTable)
        .where(and(eq(accountsTable.id, accountId), eq(accountsTable.userId, uid)));
      if (!account) throw Object.assign(new Error("Account not found"), { status: 404 });

      const newBalance = account.balance + amount;
      await trx.update(accountsTable)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(accountsTable.id, accountId));

      const [inserted] = await trx.insert(transactionsTable).values({
        accountId,
        type: "topup",
        amount,
        currency,
        status: "completed",
        description: "Account top up",
        reference: genRef(),
        balanceAfter: newBalance,
      }).returning();

      return inserted;
    });

    res.status(201).json(formatTx(tx));

    // Fire SMS alert asynchronously
    getUserPhone(clerkId).then((phone) => {
      if (phone) {
        sendSms(phone, formatSmsAlert("topup", {
          currency,
          amount,
          ref: tx.reference ?? "",
          balance: tx.balanceAfter ?? 0,
        })).catch(() => {});
      }
    }).catch(() => {});

  } catch (err: any) {
    if (err.status === 404) { res.status(404).json({ error: err.message }); return; }
    req.log.error({ err }, "topUpAccount error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatTx(t: typeof transactionsTable.$inferSelect) {
  return {
    id: t.id,
    accountId: t.accountId,
    type: t.type,
    amount: t.amount,
    currency: t.currency,
    status: t.status,
    description: t.description,
    reference: t.reference ?? null,
    recipientName: t.recipientName ?? null,
    recipientAccount: t.recipientAccount ?? null,
    senderName: t.senderName ?? null,
    balanceAfter: t.balanceAfter ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export default router;
