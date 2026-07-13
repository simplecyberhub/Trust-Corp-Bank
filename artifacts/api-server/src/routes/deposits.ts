import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, accountsTable, depositRequestsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { CreateDepositRequestBody } from "@workspace/api-zod";
import { getUserId } from "./accounts";
import { notifyAsync } from "../services/notifications";
import { emailAsync } from "../services/email";
import { sendSms } from "../services/sms";

const router = Router();

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  wire: "Wire Transfer",
  check: "Check Deposit",
  cash: "Cash Deposit",
};

router.get("/deposits", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json([]); return; }
    const rows = await db.select().from(depositRequestsTable)
      .where(eq(depositRequestsTable.userId, uid))
      .orderBy(desc(depositRequestsTable.createdAt));
    res.json(rows.map(formatDeposit));
  } catch (err) {
    req.log.error({ err }, "listDepositRequests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/deposits", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = CreateDepositRequestBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }

    const [userFlags] = await db.select({
      banned: usersTable.banned,
      hardFrozen: usersTable.hardFrozen,
      email: usersTable.email,
      phone: usersTable.phone,
      fullName: usersTable.fullName,
    }).from(usersTable).where(eq(usersTable.id, uid)).limit(1);
    if (userFlags?.banned) { res.status(403).json({ error: "Your account has been suspended. Please contact support." }); return; }
    if (userFlags?.hardFrozen) { res.status(403).json({ error: "Your accounts are currently frozen. Please contact support." }); return; }

    const { accountId, amount, currency, method, reference, note } = parse.data;
    if (amount <= 0) { res.status(400).json({ error: "Amount must be greater than zero." }); return; }

    const [account] = await db.select().from(accountsTable)
      .where(and(eq(accountsTable.id, accountId), eq(accountsTable.userId, uid)));
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }
    if (account.status !== "active") { res.status(400).json({ error: "This account is not active." }); return; }

    const [deposit] = await db.insert(depositRequestsTable).values({
      userId: uid,
      accountId,
      amount,
      currency,
      method,
      reference: reference ?? null,
      note: note ?? null,
      status: "pending",
    }).returning();

    res.status(201).json(formatDeposit(deposit));

    notifyAsync(uid, "Deposit Request Submitted", `Your ${METHOD_LABEL[method] ?? method} deposit request for ${currency} ${amount.toFixed(2)} is pending review. You'll be notified once it's approved.`, "transaction");
    if (userFlags?.email) {
      emailAsync(
        userFlags.email,
        `Deposit Request Received — ${currency} ${amount.toFixed(2)}`,
        "Deposit Request Submitted",
        `We've received your deposit request for <strong>${currency} ${amount.toFixed(2)}</strong> via ${METHOD_LABEL[method] ?? method}.<br>It is pending admin review and your account will be credited once approved.`,
        deposit.reference ?? undefined,
        "topup",
      );
    }
  } catch (err) {
    req.log.error({ err }, "createDepositRequest error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatDeposit(d: typeof depositRequestsTable.$inferSelect) {
  return {
    id: d.id,
    userId: d.userId,
    accountId: d.accountId,
    amount: d.amount,
    currency: d.currency,
    method: d.method,
    reference: d.reference ?? null,
    note: d.note ?? null,
    status: d.status,
    rejectionReason: d.rejectionReason ?? null,
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

export default router;
