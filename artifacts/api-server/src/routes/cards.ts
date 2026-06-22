import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, accountsTable, cardsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateCardBody, GetCardParams, UpdateCardParams, UpdateCardBody } from "@workspace/api-zod";
import { getUserId } from "./accounts";
import { randomInt } from "crypto";

const router = Router();

router.get("/cards", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json([]); return; }
    const rows = await db.select().from(cardsTable).where(eq(cardsTable.userId, uid));
    res.json(rows.map(formatCard));
  } catch (err) {
    req.log.error({ err }, "listCards error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cards", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = CreateCardBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }

    const [account] = await db.select().from(accountsTable)
      .where(and(eq(accountsTable.id, parse.data.accountId), eq(accountsTable.userId, uid)));
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    const [userRow] = await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, uid)).limit(1);
    const holderName = userRow?.fullName ?? "Card Holder";

    const now = new Date();
    const expiry = new Date(now.getFullYear() + 4, now.getMonth());

    const [card] = await db.insert(cardsTable).values({
      userId: uid,
      accountId: parse.data.accountId,
      cardType: parse.data.cardType,
      last4: String(randomInt(1000, 9999)),
      holderName,
      expiryMonth: expiry.getMonth() + 1,
      expiryYear: expiry.getFullYear(),
      status: "active",
      network: parse.data.network ?? "visa",
      spendLimit: parse.data.spendLimit ?? null,
    }).returning();

    res.status(201).json(formatCard(card));
  } catch (err) {
    req.log.error({ err }, "createCard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/cards/:cardId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = GetCardParams.safeParse({ cardId: Number(req.params.cardId) });
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "Not found" }); return; }
    const [card] = await db.select().from(cardsTable)
      .where(and(eq(cardsTable.id, parse.data.cardId), eq(cardsTable.userId, uid)));
    if (!card) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatCard(card));
  } catch (err) {
    req.log.error({ err }, "getCard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/cards/:cardId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const paramParse = UpdateCardParams.safeParse({ cardId: Number(req.params.cardId) });
  if (!paramParse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const bodyParse = UpdateCardBody.safeParse(req.body);
  if (!bodyParse.success) { res.status(400).json({ error: bodyParse.error.message }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "Not found" }); return; }
    const update: Record<string, unknown> = {};
    if (bodyParse.data.status) update.status = bodyParse.data.status;
    if (bodyParse.data.spendLimit !== undefined) update.spendLimit = bodyParse.data.spendLimit;
    const [card] = await db.update(cardsTable)
      .set(update)
      .where(and(eq(cardsTable.id, paramParse.data.cardId), eq(cardsTable.userId, uid)))
      .returning();
    if (!card) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatCard(card));
  } catch (err) {
    req.log.error({ err }, "updateCard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatCard(c: typeof cardsTable.$inferSelect) {
  return {
    id: c.id,
    userId: c.userId,
    accountId: c.accountId,
    cardType: c.cardType,
    last4: c.last4,
    holderName: c.holderName,
    expiryMonth: c.expiryMonth,
    expiryYear: c.expiryYear,
    status: c.status,
    network: c.network,
    spendLimit: c.spendLimit ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export default router;
