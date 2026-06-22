import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { MarkNotificationReadParams } from "@workspace/api-zod";
import { getUserId } from "./accounts";

const router = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json([]); return; }
    const rows = await db.select().from(notificationsTable)
      .where(eq(notificationsTable.userId, uid))
      .orderBy(notificationsTable.createdAt);
    res.json(rows.map(formatNotification).reverse());
  } catch (err) {
    req.log.error({ err }, "listNotifications error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/:notificationId/read", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parse = MarkNotificationReadParams.safeParse({ notificationId: Number(req.params.notificationId) });
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "Not found" }); return; }
    const [row] = await db.update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, parse.data.notificationId), eq(notificationsTable.userId, uid)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatNotification(row));
  } catch (err) {
    req.log.error({ err }, "markNotificationRead error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/read-all", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(204).send(); return; }
    await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.userId, uid));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "markAllNotificationsRead error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    userId: n.userId,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

export default router;
