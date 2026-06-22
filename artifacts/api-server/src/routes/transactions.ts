import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, accountsTable, transactionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  ListTransactionsQueryParams,
  GetTransactionParams,
  SendMoneyBody,
  TopUpAccountBody,
} from "@workspace/api-zod";
import { getUserId } from "./accounts";
import { randomBytes } from "crypto";

const router = Router();

function genRef() {
  return "TCB" + randomBytes(4).toString("hex").toUpperCase();
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

    let q = db.select().from(transactionsTable)
      .where(
        accountId
          ? and(eq(transactionsTable.accountId, accountId), type ? eq(transactionsTable.type, type) : undefined)
          : type ? eq(transactionsTable.type, type) : sql`${transactionsTable.accountId} = ANY(${accountIds})`
      )
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const items = await q;

    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(transactionsTable)
      .where(
        accountId
          ? and(eq(transactionsTable.accountId, accountId), type ? eq(transactionsTable.type, type) : undefined)
          : type ? eq(transactionsTable.type, type) : sql`${transactionsTable.accountId} = ANY(${accountIds})`
      );

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
      .where(sql`${transactionsTable.accountId} = ANY(${ids})`)
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
    const rows = await db.select().from(transactionsTable).where(eq(transactionsTable.id, parse.data.txId)).limit(1);
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
    const { fromAccountId, amount, currency, description, recipientAccount, recipientName } = parse.data;

    const [account] = await db.select().from(accountsTable)
      .where(and(eq(accountsTable.id, fromAccountId), eq(accountsTable.userId, uid)));
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }
    if (account.balance < amount) { res.status(400).json({ error: "Insufficient funds" }); return; }

    const newBalance = account.balance - amount;
    await db.update(accountsTable).set({ balance: newBalance, updatedAt: new Date() }).where(eq(accountsTable.id, fromAccountId));

    const [tx] = await db.insert(transactionsTable).values({
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

    res.status(201).json(formatTx(tx));
  } catch (err) {
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
    const { accountId, amount, currency } = parse.data;

    const [account] = await db.select().from(accountsTable)
      .where(and(eq(accountsTable.id, accountId), eq(accountsTable.userId, uid)));
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    const newBalance = account.balance + amount;
    await db.update(accountsTable).set({ balance: newBalance, updatedAt: new Date() }).where(eq(accountsTable.id, accountId));

    const [tx] = await db.insert(transactionsTable).values({
      accountId,
      type: "topup",
      amount,
      currency,
      status: "completed",
      description: "Account top up",
      reference: genRef(),
      balanceAfter: newBalance,
    }).returning();

    res.status(201).json(formatTx(tx));
  } catch (err) {
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
