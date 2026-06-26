import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, otpsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomInt } from "crypto";
import { SendOtpBody, VerifyOtpBody } from "@workspace/api-zod";
import { getUserId } from "./accounts";

const router = Router();

// In-memory attempt tracking: key = `${userId}:${type}`, value = { count, resetAt }
// Locks out after MAX_ATTEMPTS failed verifications until the OTP expires or a new one is sent.
const MAX_VERIFY_ATTEMPTS = 5;
const verifyAttempts = new Map<string, { count: number; resetAt: number }>();

function getAttemptKey(userId: number, type: string) {
  return `${userId}:${type}`;
}

function incrementAttempts(userId: number, type: string, expiresAt: Date): number {
  const key = getAttemptKey(userId, type);
  const now = Date.now();
  const entry = verifyAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    verifyAttempts.set(key, { count: 1, resetAt: expiresAt.getTime() });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function clearAttempts(userId: number, type: string) {
  verifyAttempts.delete(getAttemptKey(userId, type));
}

function getAttemptCount(userId: number, type: string): number {
  const key = getAttemptKey(userId, type);
  const now = Date.now();
  const entry = verifyAttempts.get(key);
  if (!entry || entry.resetAt <= now) return 0;
  return entry.count;
}

router.post("/users/me/otp/send", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = SendOtpBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }

  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }

    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.delete(otpsTable).where(
      and(eq(otpsTable.userId, uid), eq(otpsTable.type, parse.data.type))
    );

    await db.insert(otpsTable).values({
      userId: uid,
      code,
      type: parse.data.type,
      expiresAt,
      used: false,
    });

    const isDev = process.env.NODE_ENV !== "production";
    res.json({
      message: isDev
        ? "Verification code generated (dev mode — real SMS requires Twilio in production)."
        : "A verification code has been sent to your registered phone number.",
      code: isDev ? code : null,
      expiresIn: 600,
    });
  } catch (err) {
    req.log.error({ err }, "sendOtp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/me/otp/verify", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = VerifyOtpBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }

  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json({ valid: false }); return; }

    // Check if the user is already locked out due to too many failed attempts.
    if (getAttemptCount(uid, parse.data.type) >= MAX_VERIFY_ATTEMPTS) {
      res.status(429).json({ valid: false, error: "Too many incorrect attempts. Please request a new code." });
      return;
    }

    // Fetch the active (unused, unexpired) OTP for this user+type — without filtering by code
    // so we can increment the attempt counter even on wrong codes.
    const [otp] = await db.select().from(otpsTable).where(
      and(
        eq(otpsTable.userId, uid),
        eq(otpsTable.type, parse.data.type),
        eq(otpsTable.used, false)
      )
    ).limit(1);

    if (!otp || otp.expiresAt < new Date()) {
      res.json({ valid: false });
      return;
    }

    if (otp.code !== parse.data.code) {
      const attempts = incrementAttempts(uid, parse.data.type, otp.expiresAt);
      const remaining = MAX_VERIFY_ATTEMPTS - attempts;
      if (remaining <= 0) {
        // Invalidate the OTP so no further guesses are possible.
        await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otp.id));
        res.status(429).json({ valid: false, error: "Too many incorrect attempts. Please request a new code." });
      } else {
        res.json({ valid: false, attemptsRemaining: remaining });
      }
      return;
    }

    // Code matches — mark it used and clear the attempt counter.
    await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otp.id));
    clearAttempts(uid, parse.data.type);

    if (parse.data.type === "phone_verify") {
      await db.update(usersTable)
        .set({ phoneVerified: true, updatedAt: new Date() })
        .where(eq(usersTable.clerkId, clerkId));
    }

    res.json({ valid: true });
  } catch (err) {
    req.log.error({ err }, "verifyOtp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
