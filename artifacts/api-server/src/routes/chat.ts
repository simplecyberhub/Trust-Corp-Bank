import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, chatSessionsTable, chatMessagesTable, usersTable } from "@workspace/db";
import { eq, gt, desc, and } from "drizzle-orm";
import { getUserId } from "./accounts";

const router = Router();

/* ─── USER ROUTES ────────────────────────────────────────────────────────────── */

// GET /chat/session — get or create the current user's active chat session
router.get("/chat/session", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }

    // Find existing active session or create one
    const [existing] = await db
      .select()
      .from(chatSessionsTable)
      .where(and(eq(chatSessionsTable.userId, uid), eq(chatSessionsTable.status, "active")))
      .limit(1);

    if (existing) {
      res.json(existing);
    } else {
      const [session] = await db
        .insert(chatSessionsTable)
        .values({ userId: uid, status: "active" })
        .returning();
      res.status(201).json(session);
    }
  } catch (err) {
    req.log.error({ err }, "chat/session error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /chat/session/messages — get messages for user's active session
router.get("/chat/session/messages", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json([]); return; }

    const [session] = await db
      .select()
      .from(chatSessionsTable)
      .where(and(eq(chatSessionsTable.userId, uid), eq(chatSessionsTable.status, "active")))
      .limit(1);

    if (!session) { res.json([]); return; }

    const afterId = req.query["after"] ? parseInt(req.query["after"] as string) : 0;

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(
        afterId > 0
          ? and(eq(chatMessagesTable.sessionId, session.id), gt(chatMessagesTable.id, afterId))
          : eq(chatMessagesTable.sessionId, session.id)
      )
      .orderBy(chatMessagesTable.createdAt);

    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "chat/messages error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /chat/session/messages — user sends a message
router.post("/chat/session/messages", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { message } = req.body ?? {};
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }

    // Find or create active session
    let [session] = await db
      .select()
      .from(chatSessionsTable)
      .where(and(eq(chatSessionsTable.userId, uid), eq(chatSessionsTable.status, "active")))
      .limit(1);

    if (!session) {
      [session] = await db
        .insert(chatSessionsTable)
        .values({ userId: uid, status: "active" })
        .returning();
    }

    const [msg] = await db
      .insert(chatMessagesTable)
      .values({ sessionId: session.id, senderRole: "user", message: message.trim() })
      .returning();

    res.status(201).json(msg);
  } catch (err) {
    req.log.error({ err }, "chat/send error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /chat/session/close — user closes their chat session
router.post("/chat/session/close", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }

    await db
      .update(chatSessionsTable)
      .set({ status: "closed" })
      .where(and(eq(chatSessionsTable.userId, uid), eq(chatSessionsTable.status, "active")));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "chat/close error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ─── ADMIN ROUTES ───────────────────────────────────────────────────────────── */

// GET /admin/chat/sessions — list all chat sessions with user info
router.get("/admin/chat/sessions", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    // Check admin
    const adminUid = await getUserId(clerkId);
    if (!adminUid) { res.status(403).json({ error: "Forbidden" }); return; }
    const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminUid)).limit(1);
    if (admin?.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const statusFilter = req.query["status"] as string | undefined;

    const sessions = await db
      .select({
        id: chatSessionsTable.id,
        userId: chatSessionsTable.userId,
        status: chatSessionsTable.status,
        createdAt: chatSessionsTable.createdAt,
        updatedAt: chatSessionsTable.updatedAt,
        userFullName: usersTable.fullName,
        userEmail: usersTable.email,
      })
      .from(chatSessionsTable)
      .leftJoin(usersTable, eq(chatSessionsTable.userId, usersTable.id))
      .where(
        statusFilter && statusFilter !== "all"
          ? eq(chatSessionsTable.status, statusFilter)
          : undefined
      )
      .orderBy(desc(chatSessionsTable.updatedAt));

    res.json(sessions);
  } catch (err) {
    req.log.error({ err }, "admin/chat/sessions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/chat/sessions/:id/messages — get all messages for a session
router.get("/admin/chat/sessions/:id/messages", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const adminUid = await getUserId(clerkId);
    if (!adminUid) { res.status(403).json({ error: "Forbidden" }); return; }
    const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminUid)).limit(1);
    if (admin?.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const sessionId = parseInt(req.params["id"]);
    if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session id" }); return; }

    const afterId = req.query["after"] ? parseInt(req.query["after"] as string) : 0;

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(
        afterId > 0
          ? and(eq(chatMessagesTable.sessionId, sessionId), gt(chatMessagesTable.id, afterId))
          : eq(chatMessagesTable.sessionId, sessionId)
      )
      .orderBy(chatMessagesTable.createdAt);

    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "admin/chat/messages error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/chat/sessions/:id/messages — admin sends a reply
router.post("/admin/chat/sessions/:id/messages", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { message } = req.body ?? {};
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  try {
    const adminUid = await getUserId(clerkId);
    if (!adminUid) { res.status(403).json({ error: "Forbidden" }); return; }
    const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminUid)).limit(1);
    if (admin?.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const sessionId = parseInt(req.params["id"]);
    if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session id" }); return; }

    const [session] = await db
      .select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.id, sessionId))
      .limit(1);

    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    // Reopen if closed when admin replies
    if (session.status === "closed") {
      await db
        .update(chatSessionsTable)
        .set({ status: "active" })
        .where(eq(chatSessionsTable.id, sessionId));
    }

    const [msg] = await db
      .insert(chatMessagesTable)
      .values({ sessionId, senderRole: "agent", message: message.trim() })
      .returning();

    // Bump updatedAt on the session so it floats to the top
    await db
      .update(chatSessionsTable)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessionsTable.id, sessionId));

    res.status(201).json(msg);
  } catch (err) {
    req.log.error({ err }, "admin/chat/reply error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/chat/sessions/:id/close — admin closes a session
router.post("/admin/chat/sessions/:id/close", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const adminUid = await getUserId(clerkId);
    if (!adminUid) { res.status(403).json({ error: "Forbidden" }); return; }
    const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminUid)).limit(1);
    if (admin?.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const sessionId = parseInt(req.params["id"]);
    if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session id" }); return; }

    await db
      .update(chatSessionsTable)
      .set({ status: "closed" })
      .where(eq(chatSessionsTable.id, sessionId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "admin/chat/close error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
