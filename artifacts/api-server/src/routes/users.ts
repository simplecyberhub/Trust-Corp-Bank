import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetMeResponse,
  UpdateMeBody,
  SubmitKycBody,
} from "@workspace/api-zod";

const router = Router();

async function getOrCreateUser(clerkId: string, email: string, fullName: string) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(usersTable).values({ clerkId, email, fullName }).returning();
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
    res.json(formatUser(users[0]));
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
    // Try to update first; if not found, upsert (handles race condition on first login sync)
    const existing = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId)).limit(1);
    
    let user;
    if (existing.length === 0) {
      // First-time: create the user with info from the PUT body
      const email = (parse.data as any).email ?? "";
      const fullName = (parse.data as any).fullName ?? "User";
      [user] = await db.insert(usersTable)
        .values({ clerkId: userId, email, fullName, ...parse.data })
        .returning();
    } else {
      // Strip undefined values to avoid overwriting with null
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

function formatUser(user: typeof usersTable.$inferSelect) {
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
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export default router;
