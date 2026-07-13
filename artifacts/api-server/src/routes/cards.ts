import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, accountsTable, cardsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateCardBody, GetCardParams, UpdateCardParams, UpdateCardBody, RevealCardBody } from "@workspace/api-zod";
import { getUserId } from "./accounts";
import { randomInt, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { notifyAsync } from "../services/notifications";
import { emailAsync } from "../services/email";
import { sendSms } from "../services/sms";

const scryptAsync = promisify(scrypt);
const router = Router();

async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, key] = parts;
  const derived = (await scryptAsync(pin, salt, 32)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  if (derived.length !== storedKey.length) return false;
  return timingSafeEqual(derived, storedKey);
}

function genCardNumber(network: string): string {
  const prefix = network === "mastercard" ? "5" + randomInt(1, 5) : "4";
  let digits = prefix;
  while (digits.length < 16) digits += String(randomInt(0, 10));
  return digits.slice(0, 16);
}

function genCvv(): string {
  return String(randomInt(100, 1000));
}

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

    const [userRow] = await db.select({ fullName: usersTable.fullName, email: usersTable.email, phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, uid)).limit(1);
    const holderName = userRow?.fullName ?? "Card Holder";

    const now = new Date();
    const expiry = new Date(now.getFullYear() + 4, now.getMonth());
    const network = parse.data.network ?? "visa";
    const fullNumber = genCardNumber(network);

    const [card] = await db.insert(cardsTable).values({
      userId: uid,
      accountId: parse.data.accountId,
      cardType: parse.data.cardType,
      last4: fullNumber.slice(-4),
      fullNumber,
      cvv: genCvv(),
      holderName,
      expiryMonth: expiry.getMonth() + 1,
      expiryYear: expiry.getFullYear(),
      status: "active",
      network,
      spendLimit: parse.data.spendLimit ?? null,
    }).returning();

    res.status(201).json(formatCard(card));

    // Notify user about new card
    const cardLabel = `${parse.data.cardType === "virtual" ? "Virtual" : "Physical"} ${network.toUpperCase()} card ending ••${card.last4}`;
    notifyAsync(uid, "New Card Issued", `Your ${cardLabel} has been issued and is ready to use.`, "security");
    if (userRow?.email) {
      emailAsync(
        userRow.email,
        "New Card Issued — Trust Corp Bank",
        "Your New Card is Ready",
        `A new <strong>${cardLabel}</strong> has been issued to your account.<br>Expires: ${expiry.getMonth() + 1}/${expiry.getFullYear()}`,
        undefined,
        "card",
      );
    }
    if (userRow?.phone) {
      sendSms(userRow.phone, `TrustCorp: New card issued — ${cardLabel}. Expires ${expiry.getMonth() + 1}/${expiry.getFullYear()}. If you did not request this, contact support immediately.`).catch(() => {});
    }

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

    const [existing] = await db.select().from(cardsTable)
      .where(and(eq(cardsTable.id, paramParse.data.cardId), eq(cardsTable.userId, uid)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status === "cancelled") { res.status(400).json({ error: "This card has been cancelled and can no longer be modified." }); return; }

    const update: Record<string, unknown> = {};
    if (bodyParse.data.status) update.status = bodyParse.data.status;
    if (bodyParse.data.spendLimit !== undefined) update.spendLimit = bodyParse.data.spendLimit;
    if (bodyParse.data.dailyLimit !== undefined) update.dailyLimit = bodyParse.data.dailyLimit;
    if (bodyParse.data.nickname !== undefined) update.nickname = bodyParse.data.nickname;
    if (bodyParse.data.color !== undefined) update.color = bodyParse.data.color;
    if (bodyParse.data.contactlessEnabled !== undefined) update.contactlessEnabled = bodyParse.data.contactlessEnabled;
    if (bodyParse.data.onlineEnabled !== undefined) update.onlineEnabled = bodyParse.data.onlineEnabled;
    if (bodyParse.data.atmEnabled !== undefined) update.atmEnabled = bodyParse.data.atmEnabled;
    if (bodyParse.data.internationalEnabled !== undefined) update.internationalEnabled = bodyParse.data.internationalEnabled;

    const [card] = await db.update(cardsTable)
      .set(update)
      .where(and(eq(cardsTable.id, paramParse.data.cardId), eq(cardsTable.userId, uid)))
      .returning();
    if (!card) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatCard(card));

    // Notify on freeze/unfreeze/cancel
    if (bodyParse.data.status === "frozen") {
      notifyAsync(uid, "Card Frozen", `Your card ending ••${card.last4} has been frozen. No transactions will be processed.`, "security");
      db.select({ email: usersTable.email, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, uid)).limit(1).then(([u]) => {
        if (u?.phone) sendSms(u.phone, `TrustCorp: Your card ending ••${card.last4} has been FROZEN. Contact support if this was unexpected.`).catch(() => {});
        if (u?.email) emailAsync(u.email, "Card Frozen — Trust Corp Bank", "Card Frozen", `Your card ending <strong>••${card.last4}</strong> has been frozen. No transactions will be processed until you unfreeze it.`, undefined, "card");
      }).catch(() => {});
    } else if (bodyParse.data.status === "active") {
      notifyAsync(uid, "Card Unfrozen", `Your card ending ••${card.last4} is now active and ready to use.`, "security");
      db.select({ email: usersTable.email, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, uid)).limit(1).then(([u]) => {
        if (u?.phone) sendSms(u.phone, `TrustCorp: Your card ending ••${card.last4} has been unfrozen and is now active.`).catch(() => {});
        if (u?.email) emailAsync(u.email, "Card Unfrozen — Trust Corp Bank", "Card Now Active", `Your card ending <strong>••${card.last4}</strong> has been unfrozen and is ready to use.`, undefined, "card");
      }).catch(() => {});
    } else if (bodyParse.data.status === "cancelled") {
      notifyAsync(uid, "Card Cancelled", `Your card ending ••${card.last4} has been cancelled and can no longer be used.`, "security");
    }

  } catch (err) {
    req.log.error({ err }, "updateCard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reveal full card number + CVV — requires the account's transaction PIN.
router.post("/cards/:cardId/reveal", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const cardId = Number(req.params.cardId);
  if (!cardId) { res.status(400).json({ error: "Invalid id" }); return; }
  const bodyParse = RevealCardBody.safeParse(req.body);
  if (!bodyParse.success) { res.status(400).json({ error: bodyParse.error.message }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(404).json({ error: "Not found" }); return; }

    const [card] = await db.select().from(cardsTable)
      .where(and(eq(cardsTable.id, cardId), eq(cardsTable.userId, user.id)));
    if (!card) { res.status(404).json({ error: "Not found" }); return; }
    if (card.status === "cancelled") { res.status(400).json({ error: "This card has been cancelled." }); return; }

    if (!user.transactionPin) { res.status(403).json({ error: "Set a transaction PIN in your profile before revealing card details." }); return; }
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const mins = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 60_000);
      res.status(429).json({ error: `PIN locked. Try again in ${mins} minute${mins > 1 ? "s" : ""}.` });
      return;
    }
    const valid = await verifyPinHash(bodyParse.data.pin, user.transactionPin);
    if (!valid) {
      const newAttempts = (user.pinAttempts ?? 0) + 1;
      const remaining = Math.max(0, 5 - newAttempts);
      const lockUntil = remaining === 0 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.update(usersTable).set({ pinAttempts: newAttempts, pinLockedUntil: lockUntil }).where(eq(usersTable.id, user.id));
      res.status(403).json({ error: "Incorrect PIN." });
      return;
    }
    await db.update(usersTable).set({ pinAttempts: 0, pinLockedUntil: null }).where(eq(usersTable.id, user.id));

    res.json({
      fullNumber: card.fullNumber ?? `•••• •••• •••• ${card.last4}`,
      cvv: card.cvv ?? "•••",
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
    });
  } catch (err) {
    req.log.error({ err }, "revealCard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Report a card lost/stolen — permanently cancels it and issues a replacement in one step.
router.post("/cards/:cardId/report-lost", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const cardId = Number(req.params.cardId);
  if (!cardId) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "Not found" }); return; }

    const [existing] = await db.select().from(cardsTable)
      .where(and(eq(cardsTable.id, cardId), eq(cardsTable.userId, uid)));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status === "cancelled") { res.status(400).json({ error: "This card is already cancelled." }); return; }

    const [cancelledCard] = await db.update(cardsTable)
      .set({ status: "cancelled", lostReportedAt: new Date() })
      .where(eq(cardsTable.id, cardId))
      .returning();

    const network = existing.network;
    const fullNumber = genCardNumber(network);
    const now = new Date();
    const expiry = new Date(now.getFullYear() + 4, now.getMonth());

    const [replacementCard] = await db.insert(cardsTable).values({
      userId: uid,
      accountId: existing.accountId,
      cardType: existing.cardType,
      last4: fullNumber.slice(-4),
      fullNumber,
      cvv: genCvv(),
      holderName: existing.holderName,
      nickname: existing.nickname,
      color: existing.color,
      expiryMonth: expiry.getMonth() + 1,
      expiryYear: expiry.getFullYear(),
      status: "active",
      network,
      spendLimit: existing.spendLimit,
      dailyLimit: existing.dailyLimit,
      contactlessEnabled: existing.contactlessEnabled,
      onlineEnabled: existing.onlineEnabled,
      atmEnabled: existing.atmEnabled,
      internationalEnabled: existing.internationalEnabled,
      replacesCardId: existing.id,
    }).returning();

    res.json({ cancelledCard: formatCard(cancelledCard), replacementCard: formatCard(replacementCard) });

    notifyAsync(uid, "Card Reported Lost/Stolen", `Your card ending ••${existing.last4} has been cancelled. A replacement card ending ••${replacementCard.last4} is ready to use.`, "security");
    db.select({ email: usersTable.email, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, uid)).limit(1).then(([u]) => {
      if (u?.phone) sendSms(u.phone, `TrustCorp: Card ending ••${existing.last4} reported lost/stolen and cancelled. Replacement ending ••${replacementCard.last4} issued. Contact support with questions.`).catch(() => {});
      if (u?.email) emailAsync(u.email, "Card Cancelled & Replaced — Trust Corp Bank", "Card Reported Lost or Stolen", `Your card ending <strong>••${existing.last4}</strong> has been permanently cancelled.<br>A replacement card ending <strong>••${replacementCard.last4}</strong> is now active on your account.`, undefined, "card");
    }).catch(() => {});
  } catch (err) {
    req.log.error({ err }, "reportCardLost error");
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
    nickname: c.nickname ?? null,
    color: c.color,
    expiryMonth: c.expiryMonth,
    expiryYear: c.expiryYear,
    status: c.status,
    network: c.network,
    spendLimit: c.spendLimit ?? null,
    dailyLimit: c.dailyLimit ?? null,
    contactlessEnabled: c.contactlessEnabled,
    onlineEnabled: c.onlineEnabled,
    atmEnabled: c.atmEnabled,
    internationalEnabled: c.internationalEnabled,
    lostReportedAt: c.lostReportedAt?.toISOString() ?? null,
    replacesCardId: c.replacesCardId ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export default router;
