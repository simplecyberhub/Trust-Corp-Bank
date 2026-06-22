import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, beneficiariesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateBeneficiaryBody, DeleteBeneficiaryParams } from "@workspace/api-zod";
import { getUserId } from "./accounts";

const router = Router();

router.get("/beneficiaries", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json([]); return; }
    const rows = await db.select().from(beneficiariesTable).where(eq(beneficiariesTable.userId, uid));
    res.json(rows.map(formatBeneficiary));
  } catch (err) {
    req.log.error({ err }, "listBeneficiaries error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/beneficiaries", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = CreateBeneficiaryBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.message }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }
    const [row] = await db.insert(beneficiariesTable).values({
      userId: uid,
      name: parse.data.name,
      accountNumber: parse.data.accountNumber,
      bankName: parse.data.bankName,
      currency: parse.data.currency ?? "USD",
    }).returning();
    res.status(201).json(formatBeneficiary(row));
  } catch (err) {
    req.log.error({ err }, "createBeneficiary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/beneficiaries/:beneficiaryId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = DeleteBeneficiaryParams.safeParse({ beneficiaryId: Number(req.params.beneficiaryId) });
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(beneficiariesTable)
      .where(and(eq(beneficiariesTable.id, parse.data.beneficiaryId), eq(beneficiariesTable.userId, uid)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "deleteBeneficiary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatBeneficiary(b: typeof beneficiariesTable.$inferSelect) {
  return {
    id: b.id,
    userId: b.userId,
    name: b.name,
    accountNumber: b.accountNumber,
    bankName: b.bankName,
    currency: b.currency,
    avatarUrl: b.avatarUrl ?? null,
    createdAt: b.createdAt.toISOString(),
  };
}

export default router;
