import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomInt, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import {
  GetMeResponse,
  UpdateMeBody,
  SubmitKycBody,
} from "@workspace/api-zod";
import { generateTotpSecret, verifyTOTP, buildOtpAuthUrl, formatSecretForDisplay } from "../services/totp";
import { notifyAsync } from "../services/notifications";

const router = Router();
const scryptAsync = promisify(scrypt);

function genAccountNumber(): string {
  return String(randomInt(1000000000, 9999999999));
}

async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(pin, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const hashBuffer = Buffer.from(hash, "hex");
    const derivedHash = (await scryptAsync(pin, salt, 64)) as Buffer;
    return timingSafeEqual(hashBuffer, derivedHash);
  } catch {
    return false;
  }
}

async function getOrCreateUser(clerkId: string, email: string, fullName: string) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db.insert(usersTable).values({ clerkId, email, fullName }).returning();

  try {
    await db.insert(accountsTable).values({
      userId: created.id,
      accountNumber: genAccountNumber(),
      accountType: "checking",
      currency: "USD",
      nickname: "Primary Checking",
      balance: 0,
      status: "active",
    });
  } catch (err) {
    /* non-fatal — user created, account provisioning can be retried */
  }

  return created;
}

router.get("/users/me", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
    if (users.length === 0) {
      const email = (req.headers["x-user-email"] as string) || "";
      const fullName = (req.headers["x-user-fullname"] as string) || "User";
      const user = await getOrCreateUser(userId, email, fullName);
      res.json(formatUser(user));
      return;
    }

    const user = users[0];

    const existingAccounts = await db
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(eq(accountsTable.userId, user.id))
      .limit(1);

    if (existingAccounts.length === 0) {
      try {
        await db.insert(accountsTable).values({
          userId: user.id,
          accountNumber: genAccountNumber(),
          accountType: "checking",
          currency: "USD",
          nickname: "Primary Checking",
          balance: 0,
          status: "active",
        });
      } catch {
        /* ignore duplicate */
      }
    }

    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "getMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/users/me", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = UpdateMeBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }

  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);

    let user;
    if (existing.length === 0) {
      const email = (parse.data as any).email ?? "";
      const fullName = (parse.data as any).fullName ?? "User";
      [user] = await db.insert(usersTable)
        .values({ clerkId: userId, email, fullName, ...parse.data })
        .returning();
    } else {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(parse.data)) {
        if (v !== undefined && v !== null && v !== "") {
          updates[k] = v;
        }
      }
      [user] = await db.update(usersTable)
        .set(updates)
        .where(eq(usersTable.clerkId, userId))
        .returning();
    }

    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "updateMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/me/kyc", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parse = SubmitKycBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }

  try {
    const { fullName, dateOfBirth, address, idType, idNumber, phone } = parse.data;
    const [user] = await db.update(usersTable)
      .set({ fullName, dateOfBirth, address, idType, idNumber, phone: phone ?? null, kycStatus: "submitted", updatedAt: new Date() })
      .where(eq(usersTable.clerkId, userId))
      .returning();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "submitKyc error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ─── PIN ROUTES ──────────────────────────────────────────────────────────── */

router.post("/users/me/pin", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { pin, currentPin } = req.body ?? {};

  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits." });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    if (user.transactionPin) {
      if (!currentPin) { res.status(400).json({ error: "Current PIN required to change PIN." }); return; }
      if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
        const mins = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 60_000);
        res.status(429).json({ error: `PIN locked. Try again in ${mins} minute${mins > 1 ? "s" : ""}.` });
        return;
      }
      const valid = await verifyPin(currentPin, user.transactionPin);
      if (!valid) {
        const attempts = (user.pinAttempts ?? 0) + 1;
        const lockedUntil = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;
        await db.update(usersTable).set({ pinAttempts: attempts, pinLockedUntil: lockedUntil, updatedAt: new Date() }).where(eq(usersTable.clerkId, userId));
        res.status(401).json({ error: `Incorrect PIN. ${5 - attempts} attempt${5 - attempts !== 1 ? "s" : ""} remaining.` });
        return;
      }
    }

    const hashed = await hashPin(pin);
    await db.update(usersTable)
      .set({ transactionPin: hashed, pinAttempts: 0, pinLockedUntil: null, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, userId));

    res.json({ success: true, message: user.transactionPin ? "PIN changed successfully." : "PIN set successfully." });
  } catch (err) {
    req.log.error({ err }, "setPin error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/me/pin/verify", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { pin } = req.body ?? {};
  if (!pin || typeof pin !== "string") { res.status(400).json({ error: "PIN required." }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!user.transactionPin) { res.status(400).json({ error: "No PIN set. Please set a PIN first." }); return; }

    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const mins = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 60_000);
      res.status(429).json({ error: `PIN locked. Try again in ${mins} minute${mins > 1 ? "s" : ""}.` });
      return;
    }

    const valid = await verifyPin(pin, user.transactionPin);
    if (!valid) {
      const attempts = (user.pinAttempts ?? 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;
      await db.update(usersTable).set({ pinAttempts: attempts, pinLockedUntil: lockedUntil, updatedAt: new Date() }).where(eq(usersTable.clerkId, userId));
      if (lockedUntil) {
        res.status(429).json({ error: "Too many incorrect attempts. PIN locked for 30 minutes." });
      } else {
        res.status(401).json({ error: `Incorrect PIN. ${5 - attempts} attempt${5 - attempts !== 1 ? "s" : ""} remaining.` });
      }
      return;
    }

    await db.update(usersTable).set({ pinAttempts: 0, pinLockedUntil: null, updatedAt: new Date() }).where(eq(usersTable.clerkId, userId));
    res.json({ success: true, message: "PIN verified." });
  } catch (err) {
    req.log.error({ err }, "verifyPin error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/me/pin", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { pin } = req.body ?? {};
  if (!pin) { res.status(400).json({ error: "Current PIN required to remove PIN." }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!user.transactionPin) { res.status(400).json({ error: "No PIN is set." }); return; }

    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      res.status(429).json({ error: "PIN is locked. Cannot remove at this time." });
      return;
    }

    const valid = await verifyPin(pin, user.transactionPin);
    if (!valid) {
      const attempts = (user.pinAttempts ?? 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;
      await db.update(usersTable).set({ pinAttempts: attempts, pinLockedUntil: lockedUntil, updatedAt: new Date() }).where(eq(usersTable.clerkId, userId));
      res.status(401).json({ error: `Incorrect PIN. ${5 - attempts} attempt${5 - attempts !== 1 ? "s" : ""} remaining.` });
      return;
    }

    await db.update(usersTable)
      .set({ transactionPin: null, pinAttempts: 0, pinLockedUntil: null, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, userId));

    res.json({ success: true, message: "PIN removed." });
  } catch (err) {
    req.log.error({ err }, "removePin error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ─── TOTP / HARD TOKEN ROUTES ────────────────────────────────────────────── */

/**
 * POST /users/me/totp/setup
 * Generates a new TOTP secret for the user (does NOT yet enable it).
 * Returns the secret and otpauth URL so the user can add it to their authenticator app.
 */
router.post("/users/me/totp/setup", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.totpEnabled) {
      res.status(400).json({ error: "Authenticator app is already enabled. Disable it first." });
      return;
    }
    const secret = generateTotpSecret();
    // Store the pending secret (not yet enabled)
    await db.update(usersTable)
      .set({ totpSecret: secret, totpEnabled: false, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, userId));

    const otpAuthUrl = buildOtpAuthUrl(secret, user.email);
    res.json({
      secret,
      secretFormatted: formatSecretForDisplay(secret),
      otpAuthUrl,
      email: user.email,
    });
  } catch (err) {
    req.log.error({ err }, "totpSetup error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /users/me/totp/enable
 * Verifies a 6-digit TOTP code and enables the authenticator.
 * Body: { code: "123456" }
 */
router.post("/users/me/totp/enable", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "A 6-digit code from your authenticator app is required." }); return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!user.totpSecret) {
      res.status(400).json({ error: "No authenticator setup in progress. Call /users/me/totp/setup first." }); return;
    }
    if (user.totpEnabled) {
      res.status(400).json({ error: "Authenticator app is already enabled." }); return;
    }
    if (!verifyTOTP(user.totpSecret, code.trim())) {
      res.status(401).json({ error: "Incorrect code. Please try again." }); return;
    }
    await db.update(usersTable)
      .set({ totpEnabled: true, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, userId));
    notifyAsync(user.id, "Security Token Enabled", "An authenticator app has been linked to your account for extra security.", "security");
    res.json({ success: true, message: "Authenticator app enabled successfully." });
  } catch (err) {
    req.log.error({ err }, "totpEnable error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /users/me/totp
 * Disables TOTP. Requires a valid current TOTP code.
 * Body: { code: "123456" }
 */
router.delete("/users/me/totp", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Your current 6-digit authenticator code is required to disable it." }); return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!user.totpEnabled || !user.totpSecret) {
      res.status(400).json({ error: "Authenticator app is not enabled." }); return;
    }
    if (!verifyTOTP(user.totpSecret, code.trim())) {
      res.status(401).json({ error: "Incorrect code. Authenticator not disabled." }); return;
    }
    await db.update(usersTable)
      .set({ totpSecret: null, totpEnabled: false, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, userId));
    notifyAsync(user.id, "Security Token Disabled", "Your authenticator app has been removed from your account.", "security");
    res.json({ success: true, message: "Authenticator app disabled." });
  } catch (err) {
    req.log.error({ err }, "totpDisable error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /users/me/totp/validate
 * Validates a TOTP code without changing state (used for transaction confirmation etc.)
 * Body: { code: "123456" }
 */
router.post("/users/me/totp/validate", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { code } = req.body ?? {};
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "code is required" }); return;
  }
  try {
    const [user] = await db.select({ totpSecret: usersTable.totpSecret, totpEnabled: usersTable.totpEnabled })
      .from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (!user.totpEnabled || !user.totpSecret) {
      res.status(400).json({ error: "Authenticator app not enabled." }); return;
    }
    if (!verifyTOTP(user.totpSecret, code.trim())) {
      res.status(401).json({ error: "Incorrect code." }); return;
    }
    res.json({ success: true, valid: true });
  } catch (err) {
    req.log.error({ err }, "totpValidate error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ─── HELPERS ─────────────────────────────────────────────────────────────── */

export function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    kycStatus: user.kycStatus,
    address: user.address ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    role: user.role,
    hasPin: !!user.transactionPin,
    totpEnabled: user.totpEnabled,
    phoneVerified: user.phoneVerified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export default router;
