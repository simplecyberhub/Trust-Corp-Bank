import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { SetupPinBody, VerifyPinBody } from "@workspace/api-zod";

const scryptAsync = promisify(scrypt);
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(pin, salt, 32)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, key] = parts;
  const derived = (await scryptAsync(pin, salt, 32)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  if (derived.length !== storedKey.length) return false;
  return timingSafeEqual(derived, storedKey);
}

const router = Router();

router.post("/users/me/pin", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = SetupPinBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }

  if (!/^\d{4,6}$/.test(parse.data.pin)) {
    res.status(400).json({ error: "PIN must be 4-6 digits." });
    return;
  }

  try {
    const hashed = await hashPin(parse.data.pin);
    await db.update(usersTable)
      .set({ transactionPin: hashed, pinAttempts: 0, pinLockedUntil: null, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, clerkId));
    res.json({ success: true, message: "Transaction PIN set successfully." });
  } catch (err) {
    req.log.error({ err }, "setupPin error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/me/pin/verify", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = VerifyPinBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user || !user.transactionPin) {
      res.json({ valid: false, attemptsRemaining: MAX_ATTEMPTS, locked: false });
      return;
    }

    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      res.json({ valid: false, attemptsRemaining: 0, locked: true });
      return;
    }

    const valid = await verifyPinHash(parse.data.pin, user.transactionPin);

    if (valid) {
      await db.update(usersTable)
        .set({ pinAttempts: 0, pinLockedUntil: null })
        .where(eq(usersTable.clerkId, clerkId));
      res.json({ valid: true, attemptsRemaining: MAX_ATTEMPTS, locked: false });
    } else {
      const newAttempts = (user.pinAttempts ?? 0) + 1;
      const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
      const lockUntil = remaining === 0 ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
      await db.update(usersTable)
        .set({ pinAttempts: newAttempts, pinLockedUntil: lockUntil })
        .where(eq(usersTable.clerkId, clerkId));
      res.json({ valid: false, attemptsRemaining: remaining, locked: remaining === 0 });
    }
  } catch (err) {
    req.log.error({ err }, "verifyPin error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
