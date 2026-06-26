import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, supportTicketsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getUserId } from "./accounts";

const router = Router();

const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

function validateTicketBody(body: any): { subject: string; message: string; priority: string } | null {
  const { subject, message, priority = "medium" } = body ?? {};
  if (typeof subject !== "string" || subject.trim().length < 3 || subject.trim().length > 200) return null;
  if (typeof message !== "string" || message.trim().length < 10 || message.trim().length > 5000) return null;
  if (!VALID_PRIORITIES.includes(priority)) return null;
  return { subject: subject.trim(), message: message.trim(), priority };
}

// Submit a support ticket
router.post("/support-tickets", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const body = validateTicketBody(req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid input: subject (3–200 chars) and message (10–5000 chars) are required" });
    return;
  }

  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.status(404).json({ error: "User not found" }); return; }

    const [ticket] = await db.insert(supportTicketsTable).values({
      userId: uid,
      subject: body.subject,
      message: body.message,
      priority: body.priority,
      status: "open",
    }).returning();

    res.status(201).json(ticket);
  } catch (err) {
    req.log.error({ err }, "createTicket error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user's support tickets
router.get("/support-tickets", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const uid = await getUserId(clerkId);
    if (!uid) { res.json([]); return; }

    const tickets = await db.select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.userId, uid))
      .orderBy(desc(supportTicketsTable.createdAt));

    res.json(tickets);
  } catch (err) {
    req.log.error({ err }, "listMyTickets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
