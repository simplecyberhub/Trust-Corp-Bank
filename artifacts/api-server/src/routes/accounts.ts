import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, accountsTable, accountMembersTable } from "@workspace/db";
import { eq, and, or, inArray, sql, desc } from "drizzle-orm";
import { CreateAccountBody, GetAccountParams } from "@workspace/api-zod";
import { randomInt } from "crypto";

const router = Router();

export type AccountRole = "owner" | "manager" | "viewer";
export type AccountPermission = "canView" | "canTransact" | "canManage";

export interface AccountAccess {
  account: typeof accountsTable.$inferSelect;
  role: AccountRole;
  canView: boolean;
  canTransact: boolean;
  canManage: boolean;
}

function genAccountNumber(): string {
  return String(randomInt(1000000000, 9999999999));
}

async function getUserId(clerkId: string): Promise<number | null> {
  const rows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return rows[0]?.id ?? null;
}

async function activatePendingInvites(userId: number): Promise<void> {
  const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.email) return;
  await db.update(accountMembersTable)
    .set({ userId, status: "active", joinedAt: new Date(), updatedAt: new Date() })
    .where(and(
      sql`lower(${accountMembersTable.invitedEmail}) = lower(${user.email})`,
      sql`${accountMembersTable.userId} IS NULL`,
      eq(accountMembersTable.status, "pending"),
    ));
}

export async function getAccountAccess(userId: number, accountId: number): Promise<AccountAccess | null> {
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
  if (!account) return null;
  if (account.userId === userId) {
    return { account, role: "owner", canView: true, canTransact: true, canManage: true };
  }

  await activatePendingInvites(userId);
  const [member] = await db.select({
    role: accountMembersTable.role,
    status: accountMembersTable.status,
  }).from(accountMembersTable).where(and(
    eq(accountMembersTable.accountId, accountId),
    eq(accountMembersTable.userId, userId),
    eq(accountMembersTable.status, "active"),
  )).limit(1);
  if (!member) return null;

  const role: AccountRole = member.role === "manager" ? "manager" : "viewer";
  return {
    account,
    role,
    canView: true,
    canTransact: role === "manager",
    canManage: false,
  };
}

export async function getAccessibleAccountIds(userId: number, permission: AccountPermission = "canView"): Promise<number[]> {
  await activatePendingInvites(userId);
  const owned = await db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.userId, userId));
  const memberRows = await db.select({
    id: accountMembersTable.accountId,
    role: accountMembersTable.role,
  }).from(accountMembersTable).where(and(
    eq(accountMembersTable.userId, userId),
    eq(accountMembersTable.status, "active"),
  ));

  const ids = owned.map((row) => row.id);
  for (const row of memberRows) {
    const permitted =
      permission === "canView" ||
      (permission === "canTransact" && row.role === "manager") ||
      (permission === "canManage" && row.role === "owner");
    if (permitted && !ids.includes(row.id)) ids.push(row.id);
  }
  return ids;
}

async function getAccountForManage(userId: number, accountId: number): Promise<AccountAccess | null> {
  const access = await getAccountAccess(userId, accountId);
  return access?.canManage ? access : null;
}

async function listMemberRows(accountId: number) {
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
  if (!account) return null;
  const [owner] = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    fullName: usersTable.fullName,
  }).from(usersTable).where(eq(usersTable.id, account.userId)).limit(1);
  const members = await db.select({
    member: accountMembersTable,
    user: {
      email: usersTable.email,
      fullName: usersTable.fullName,
    },
  }).from(accountMembersTable)
    .leftJoin(usersTable, eq(usersTable.id, accountMembersTable.userId))
    .where(eq(accountMembersTable.accountId, accountId))
    .orderBy(desc(accountMembersTable.createdAt));

  return [
    {
      id: 0,
      accountId,
      userId: account.userId,
      email: owner?.email ?? "",
      fullName: owner?.fullName ?? "Account owner",
      role: "owner" as const,
      status: "active" as const,
      joinedAt: account.createdAt.toISOString(),
      createdAt: account.createdAt.toISOString(),
    },
    ...members.map(({ member, user }) => ({
      id: member.id,
      accountId,
      userId: member.userId ?? null,
      email: user?.email ?? member.invitedEmail,
      fullName: user?.fullName ?? "Pending invitation",
      role: (member.role === "manager" ? "manager" : "viewer") as "manager" | "viewer",
      status: (member.status === "active" ? "active" : member.status === "revoked" ? "revoked" : "pending") as "active" | "pending" | "revoked",
      joinedAt: member.joinedAt?.toISOString() ?? null,
      createdAt: member.createdAt.toISOString(),
    })),
  ];
}

router.get("/accounts", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json([]); return; }
    const accountIds = await getAccessibleAccountIds(uid);
    if (accountIds.length === 0) { res.json([]); return; }
    const accounts = await db.select().from(accountsTable).where(inArray(accountsTable.id, accountIds));
    const result = await Promise.all(accounts.map(async (account) => {
      const access = await getAccountAccess(uid, account.id);
      return formatAccount(account, access?.role ?? "viewer", await getMemberCount(account.id));
    }));
    res.json(result);
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
    if (!uid) { res.json({ totalBalanceUsd: 0, accountCount: 0, activeCount: 0, currencies: [] }); return; }
    const accountIds = await getAccessibleAccountIds(uid);
    const accounts = accountIds.length ? await db.select().from(accountsTable).where(inArray(accountsTable.id, accountIds)) : [];
    const activeCount = accounts.filter((a) => a.status === "active").length;
    const currencyMap: Record<string, number> = {};
    for (const acc of accounts) currencyMap[acc.currency] = (currencyMap[acc.currency] ?? 0) + acc.balance;
    const currencies = Object.entries(currencyMap).map(([currency, balance]) => ({ currency, balance }));
    const totalBalanceUsd = accounts.filter((a) => a.currency === "USD").reduce((sum, a) => sum + a.balance, 0);
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
    const access = uid ? await getAccountAccess(uid, parse.data.accountId) : null;
    if (!access) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatAccount(access.account, access.role, await getMemberCount(access.account.id)));
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
    res.status(201).json(formatAccount(account, "owner", 1));
  } catch (err) {
    req.log.error({ err }, "createAccount error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/accounts/:accountId/members", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const accountId = Number(req.params.accountId);
  try {
    const uid = await getUserId(clerkId);
    const access = uid ? await getAccountAccess(uid, accountId) : null;
    if (!access) { res.status(404).json({ error: "Account not found" }); return; }
    const members = await listMemberRows(accountId);
    res.json(members ?? []);
  } catch (err) {
    req.log.error({ err }, "listAccountMembers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/accounts/:accountId/members", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const accountId = Number(req.params.accountId);
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const role = req.body?.role === "manager" ? "manager" : req.body?.role === "viewer" ? "viewer" : "";
  if (!Number.isInteger(accountId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) {
    res.status(400).json({ error: "A valid email and role (manager or viewer) are required." }); return;
  }
  try {
    const uid = await getUserId(clerkId);
    const access = uid ? await getAccountForManage(uid, accountId) : null;
    if (!access) { res.status(403).json({ error: "Only the account owner can manage collaborators." }); return; }
    const [target] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email}`).limit(1);
    if (target?.id === uid) { res.status(400).json({ error: "The account owner is already a collaborator." }); return; }
    const [existing] = await db.select().from(accountMembersTable).where(and(
      eq(accountMembersTable.accountId, accountId),
      sql`lower(${accountMembersTable.invitedEmail}) = ${email}`,
    )).limit(1);
    if (existing) {
      res.status(409).json({ error: "This email already has an invitation for the account." }); return;
    }
    const [member] = await db.insert(accountMembersTable).values({
      accountId,
      userId: null,
      invitedEmail: email,
      role,
      status: "pending",
      joinedAt: null,
    }).returning();
    const members = await listMemberRows(accountId);
    res.status(201).json(members?.find((item) => item.id === member.id) ?? {
      id: member.id, accountId, userId: member.userId, email, fullName: "Pending invitation",
      role, status: member.status, joinedAt: null, createdAt: member.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "inviteAccountMember error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/accounts/:accountId/members/:memberId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const accountId = Number(req.params.accountId);
  const memberId = Number(req.params.memberId);
  const role = req.body?.role === "manager" ? "manager" : req.body?.role === "viewer" ? "viewer" : "";
  if (!Number.isInteger(accountId) || !Number.isInteger(memberId) || !role) {
    res.status(400).json({ error: "A valid collaborator role is required." }); return;
  }
  try {
    const uid = await getUserId(clerkId);
    const access = uid ? await getAccountForManage(uid, accountId) : null;
    if (!access) { res.status(403).json({ error: "Only the account owner can manage collaborators." }); return; }
    const [updated] = await db.update(accountMembersTable).set({ role, status: "active", updatedAt: new Date() })
      .where(and(eq(accountMembersTable.id, memberId), eq(accountMembersTable.accountId, accountId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Collaborator not found." }); return; }
    const members = await listMemberRows(accountId);
    res.json(members?.find((item) => item.id === memberId));
  } catch (err) {
    req.log.error({ err }, "updateAccountMember error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/accounts/:accountId/members/:memberId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const accountId = Number(req.params.accountId);
  const memberId = Number(req.params.memberId);
  try {
    const uid = await getUserId(clerkId);
    const access = uid ? await getAccountForManage(uid, accountId) : null;
    if (!access) { res.status(403).json({ error: "Only the account owner can manage collaborators." }); return; }
    const [removed] = await db.update(accountMembersTable).set({ status: "revoked", updatedAt: new Date() })
      .where(and(eq(accountMembersTable.id, memberId), eq(accountMembersTable.accountId, accountId)))
      .returning({ id: accountMembersTable.id });
    if (!removed) { res.status(404).json({ error: "Collaborator not found." }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "removeAccountMember error");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function getMemberCount(accountId: number): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(accountMembersTable).where(and(
    eq(accountMembersTable.accountId, accountId),
    eq(accountMembersTable.status, "active"),
  ));
  return Number(result[0]?.count ?? 0) + 1;
}

function formatAccount(
  a: typeof accountsTable.$inferSelect,
  role: AccountRole,
  memberCount: number,
) {
  return {
    id: a.id,
    userId: a.userId,
    accountNumber: a.accountNumber,
    accountType: a.accountType,
    currency: a.currency,
    balance: a.balance,
    status: a.status,
    nickname: a.nickname ?? null,
    accessRole: role,
    permissions: {
      canView: true,
      canTransact: role === "owner" || role === "manager",
      canManage: role === "owner",
    },
    memberCount,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export { getUserId };
export default router;