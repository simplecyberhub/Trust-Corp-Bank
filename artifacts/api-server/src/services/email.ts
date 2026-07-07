/**
 * Email notification service.
 * Configurable via admin settings (email.provider, email.apiKey, email.fromAddress, email.enabled).
 * Currently supports Resend (https://resend.com) — just a fetch call, no extra package needed.
 * All sends are fire-and-forget; errors are swallowed and logged.
 */
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface EmailConfig {
  provider: "resend" | "disabled";
  apiKey: string;
  fromAddress: string;
  enabled: boolean;
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
    return row?.value ?? null;
  } catch { return null; }
}

export async function getEmailConfig(): Promise<EmailConfig> {
  const [provider, apiKey, fromAddress, enabled] = await Promise.all([
    getSetting("email.provider"),
    getSetting("email.apiKey"),
    getSetting("email.fromAddress"),
    getSetting("email.enabled"),
  ]);
  return {
    provider: (provider as EmailConfig["provider"]) ?? "disabled",
    apiKey: apiKey ?? "",
    fromAddress: fromAddress ?? "noreply@trustcorpbank.com",
    enabled: enabled === "true",
  };
}

export async function saveEmailConfig(config: Partial<EmailConfig>): Promise<void> {
  const pairs: Array<{ key: string; value: string }> = [];
  if (config.provider !== undefined) pairs.push({ key: "email.provider", value: config.provider });
  if (config.apiKey !== undefined) pairs.push({ key: "email.apiKey", value: config.apiKey });
  if (config.fromAddress !== undefined) pairs.push({ key: "email.fromAddress", value: config.fromAddress });
  if (config.enabled !== undefined) pairs.push({ key: "email.enabled", value: String(config.enabled) });
  for (const pair of pairs) {
    await db.insert(settingsTable).values({ key: pair.key, value: pair.value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: pair.value, updatedAt: new Date() } });
  }
}

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { success: false, error: `Resend error ${resp.status}: ${body}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

function buildTransactionEmail(params: {
  type: "transfer" | "topup" | "exchange" | "card";
  title: string;
  body: string;
  ref?: string;
}) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0d1a;padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:520px;background:#111827;border-radius:16px;border:1px solid #1f2937;overflow:hidden;">
      <tr><td style="background:#1d4ed8;padding:24px 32px;text-align:center;">
        <div style="display:inline-block;width:44px;height:44px;background:rgba(255,255,255,0.2);border-radius:10px;line-height:44px;font-size:16px;font-weight:900;color:#fff;">TC</div>
        <p style="margin:8px 0 0;color:#fff;font-size:16px;font-weight:700;">Trust Corp Bank</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:700;">${params.title}</h2>
        <p style="margin:0 0 24px;color:#9ca3af;font-size:14px;line-height:1.6;">${params.body}</p>
        ${params.ref ? `<div style="background:#1f2937;border-radius:10px;padding:12px 16px;margin-bottom:24px;">
          <p style="margin:0;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Reference</p>
          <p style="margin:4px 0 0;color:#e5e7eb;font-size:14px;font-family:monospace;">${params.ref}</p>
        </div>` : ""}
        <p style="margin:24px 0 0;color:#4b5563;font-size:12px;text-align:center;">
          This is an automated message from Trust Corp Bank. Do not reply to this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
  `.trim();
}

export async function sendEmail(
  to: string,
  subject: string,
  title: string,
  body: string,
  ref?: string,
  type: "transfer" | "topup" | "exchange" | "card" = "transfer",
): Promise<void> {
  try {
    const config = await getEmailConfig();
    if (!config.enabled || !config.apiKey) return;
    const html = buildTransactionEmail({ type, title, body, ref });
    let result: { success: boolean; error?: string };
    if (config.provider === "resend") {
      result = await sendViaResend(config.apiKey, config.fromAddress, to, subject, html);
    } else {
      return; // disabled
    }
    if (!result.success) {
      logger.warn({ to, error: result.error }, "Email send failed");
    }
  } catch (err) {
    logger.error({ err, to }, "Email service error");
  }
}

/**
 * Fire-and-forget email — fetches user email from DB and sends.
 */
export function emailAsync(
  to: string | null | undefined,
  subject: string,
  title: string,
  body: string,
  ref?: string,
  type?: "transfer" | "topup" | "exchange" | "card",
): void {
  if (!to) return;
  sendEmail(to, subject, title, body, ref, type).catch(() => {});
}

export async function sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
  const config = await getEmailConfig();
  if (!config.enabled || !config.apiKey) {
    return { success: false, error: "Email is not enabled or API key is missing." };
  }
  const html = buildTransactionEmail({
    type: "transfer",
    title: "Test Email",
    body: "This is a test email from Trust Corp Bank admin panel. Email notifications are working correctly.",
    ref: "TEST-" + Date.now(),
  });
  if (config.provider === "resend") {
    return sendViaResend(config.apiKey, config.fromAddress, to, "Test Email — Trust Corp Bank", html);
  }
  return { success: false, error: "No provider configured." };
}
