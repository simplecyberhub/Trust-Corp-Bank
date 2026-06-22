import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, accountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateAccountBody, GetAccountParams } from "@workspace/api-zod";
import { randomInt } from "crypto";

const router = Router();

function genAccountNumber(): string {
  return String(randomInt(1000000000, 9999999999));
}

async function getUserId(clerkId: string): Promise<number | null> {
  const rows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return rows[0]?.id ?? null;
}

router.get("/accounts", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json([]); return; }
    const accounts = await db.select().from(accountsTable).where(eq(accountsTable.userId, uid));
    res.json(accounts.map(formatAccount));
  } catch (err) {
    req.log.error({ err }, "listAccounts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/accounts/summary", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) {
      res.json({ totalBalanceUsd: 0, accountCount: 0, activeCount: 0, currencies: [] });
      return;
    }
    const accounts = await db.select().from(accountsTable).where(eq(accountsTable.userId, uid));
    const activeCount = accounts.filter(a => a.status === "active").length;
    const currencyMap: Record<string, number> = {};
    for (const acc of accounts) {
      currencyMap[acc.currency] = (currencyMap[acc.currency] ?? 0) + acc.balance;
    }
    const currencies = Object.entries(currencyMap).map(([currency, balance]) => ({ currency, balance }));
    const usdAccounts = accounts.filter(a => a.currency === "USD");
    const totalBalanceUsd = usdAccounts.reduce((sum, a) => sum + a.balance, 0);
    res.json({ totalBalanceUsd, accountCount: accounts.length, activeCount, currencies });
  } catch (err) {
    req.log.error({ err }, "getAccountSummary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/accounts/:accountId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = GetAccountParams.safeParse({ accountId: Number(req.params.accountId) });
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "Not found" }); return; }
    const rows = await db.select().from(accountsTable)
      .where(and(eq(accountsTable.id, parse.data.accountId), eq(accountsTable.userId, uid)));
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatAccount(rows[0]));
  } catch (err) {
    req.log.error({ err }, "getAccount error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/accounts", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = CreateAccountBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }
    const [account] = await db.insert(accountsTable).values({
      userId: uid,
      accountNumber: genAccountNumber(),
      accountType: parse.data.accountType,
      currency: parse.data.currency,
      nickname: parse.data.nickname ?? null,
      balance: 0,
      status: "active",
    }).returning();
    res.status(201).json(formatAccount(account));
  } catch (err) {
    req.log.error({ err }, "createAccount error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatAccount(a: typeof accountsTable.$inferSelect) {
  return {
    id: a.id,
    userId: a.userId,
    accountNumber: a.accountNumber,
    accountType: a.accountType,
    currency: a.currency,
    balance: a.balance,
    status: a.status,
    nickname: a.nickname ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export { getUserId };
export default router;
