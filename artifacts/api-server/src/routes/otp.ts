import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, otpsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomInt } from "crypto";
import { SendOtpBody, VerifyOtpBody } from "@workspace/api-zod";
import { getUserId } from "./accounts";

const router = Router();

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

    const [otp] = await db.select().from(otpsTable).where(
      and(
        eq(otpsTable.userId, uid),
        eq(otpsTable.code, parse.data.code),
        eq(otpsTable.type, parse.data.type),
        eq(otpsTable.used, false)
      )
    ).limit(1);

    if (!otp || otp.expiresAt < new Date()) {
      res.json({ valid: false });
      return;
    }

    await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otp.id));

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
