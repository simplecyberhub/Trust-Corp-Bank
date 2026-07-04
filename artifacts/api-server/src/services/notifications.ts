/**
 * In-app notification service.
 * All functions are fire-and-forget — they log errors but never throw.
 */
import { db, notificationsTable } from "@workspace/db";
import { logger } from "../lib/logger";

export type NotificationType = "system" | "security" | "transaction" | "kyc" | "promotion";

/**
 * Insert a single in-app notification for a user.
 * Safe to call without awaiting — errors are swallowed and logged.
 */
export async function createNotification(
  userId: number,
  title: string,
  message: string,
  type: NotificationType = "system",
): Promise<void> {
  try {
    await db.insert(notificationsTable).values({ userId, title, message, type, read: false });
  } catch (err) {
    logger.error({ err, userId }, "Failed to create notification");
  }
}

/**
 * Fire-and-forget wrapper — call without await so it never blocks the response.
 */
export function notifyAsync(
  userId: number,
  title: string,
  message: string,
  type: NotificationType = "system",
): void {
  createNotification(userId, title, message, type).catch(() => {});
}
