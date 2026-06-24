import { db, settingsTable, smsLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export type SmsProvider = "textbelt" | "termii" | "vonage" | "webhook";

export interface SmsConfig {
  provider: SmsProvider;
  apiKey: string;
  senderId: string;
  webhookUrl?: string;
  enabled: boolean;
}

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

export async function getSmsConfig(): Promise<SmsConfig> {
  const [provider, apiKey, senderId, webhookUrl, enabled] = await Promise.all([
    getSetting("sms.provider"),
    getSetting("sms.apiKey"),
    getSetting("sms.senderId"),
    getSetting("sms.webhookUrl"),
    getSetting("sms.enabled"),
  ]);
  return {
    provider: (provider as SmsProvider) ?? "textbelt",
    apiKey: apiKey ?? "",
    senderId: senderId ?? "TrustCorp",
    webhookUrl: webhookUrl ?? undefined,
    enabled: enabled === "true",
  };
}

export async function saveSmsConfig(config: Partial<SmsConfig>): Promise<void> {
  const pairs: Array<{ key: string; value: string }> = [];
  if (config.provider !== undefined) pairs.push({ key: "sms.provider", value: config.provider });
  if (config.apiKey !== undefined) pairs.push({ key: "sms.apiKey", value: config.apiKey });
  if (config.senderId !== undefined) pairs.push({ key: "sms.senderId", value: config.senderId });
  if (config.webhookUrl !== undefined) pairs.push({ key: "sms.webhookUrl", value: config.webhookUrl });
  if (config.enabled !== undefined) pairs.push({ key: "sms.enabled", value: String(config.enabled) });

  for (const pair of pairs) {
    await db
      .insert(settingsTable)
      .values({ key: pair.key, value: pair.value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: pair.value, updatedAt: new Date() } });
  }
}

async function logSms(to: string, message: string, provider: string, status: "sent" | "failed", error?: string) {
  try {
    await db.insert(smsLogsTable).values({ to, message, provider, status, error: error ?? null });
  } catch (err) {
    logger.error({ err }, "Failed to write SMS log");
  }
}

async function sendTextBelt(phone: string, message: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, key: apiKey || "textbelt" }),
      signal: AbortSignal.timeout(10_000),
    });
    const data: any = await resp.json();
    if (data.success) return { success: true };
    return { success: false, error: data.error ?? data.message ?? "Unknown error" };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Network error" };
  }
}

async function sendTermii(phone: string, message: string, apiKey: string, senderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, to: phone, from: senderId || "TrustCorp", sms: message, type: "plain", channel: "generic" }),
      signal: AbortSignal.timeout(10_000),
    });
    const data: any = await resp.json();
    if (resp.ok && (data.code === "ok" || data.message_id)) return { success: true };
    return { success: false, error: data.message ?? JSON.stringify(data) };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Network error" };
  }
}

async function sendVonage(phone: string, message: string, apiKey: string, senderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const [key, secret] = apiKey.split(":");
    const resp = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, api_secret: secret, to: phone, from: senderId || "TrustCorp", text: message }),
      signal: AbortSignal.timeout(10_000),
    });
    const data: any = await resp.json();
    const msg = data?.messages?.[0];
    if (msg?.status === "0") return { success: true };
    return { success: false, error: msg?.["error-text"] ?? JSON.stringify(data) };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Network error" };
  }
}

async function sendWebhook(phone: string, message: string, webhookUrl: string, senderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, message, from: senderId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) return { success: true };
    return { success: false, error: `HTTP ${resp.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Network error" };
  }
}

export async function sendSms(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  let config: SmsConfig;
  try {
    config = await getSmsConfig();
  } catch (err: any) {
    logger.error({ err }, "Failed to load SMS config");
    return { success: false, error: "SMS configuration unavailable" };
  }

  if (!config.enabled) {
    logger.info({ phone }, "SMS skipped — SMS gateway disabled");
    return { success: false, error: "SMS gateway is disabled" };
  }

  if (!config.apiKey && config.provider !== "textbelt") {
    logger.warn({ provider: config.provider }, "SMS skipped — no API key configured");
    return { success: false, error: "No API key configured" };
  }

  let result: { success: boolean; error?: string };

  switch (config.provider) {
    case "textbelt":
      result = await sendTextBelt(phone, message, config.apiKey);
      break;
    case "termii":
      result = await sendTermii(phone, message, config.apiKey, config.senderId);
      break;
    case "vonage":
      result = await sendVonage(phone, message, config.apiKey, config.senderId);
      break;
    case "webhook":
      result = await sendWebhook(phone, message, config.webhookUrl ?? "", config.senderId);
      break;
    default:
      result = { success: false, error: `Unknown provider: ${config.provider}` };
  }

  await logSms(phone, message, config.provider, result.success ? "sent" : "failed", result.error);

  if (!result.success) {
    logger.warn({ phone, provider: config.provider, error: result.error }, "SMS send failed");
  } else {
    logger.info({ phone, provider: config.provider }, "SMS sent successfully");
  }

  return result;
}

export function formatSmsAlert(type: "transfer" | "topup" | "exchange" | "card" | "login", data: Record<string, string | number>): string {
  switch (type) {
    case "transfer":
      return `TrustCorp: You sent ${data.currency} ${Number(data.amount).toFixed(2)} to ${data.recipient}. Ref: ${data.ref}. Balance: ${data.currency} ${Number(data.balance).toFixed(2)}. Not you? Call support immediately.`;
    case "topup":
      return `TrustCorp: Your account was topped up with ${data.currency} ${Number(data.amount).toFixed(2)}. New balance: ${data.currency} ${Number(data.balance).toFixed(2)}. Ref: ${data.ref}.`;
    case "exchange":
      return `TrustCorp: Currency exchange complete. ${data.fromCurrency} ${Number(data.fromAmount).toFixed(2)} → ${data.toCurrency} ${Number(data.toAmount).toFixed(2)}. Ref: ${data.ref}.`;
    case "card":
      return `TrustCorp: A new ${data.cardType} card ending in ${data.last4} has been issued to your account. Not you? Contact support.`;
    case "login":
      return `TrustCorp: New sign-in to your account at ${data.time}. Not you? Secure your account immediately.`;
    default:
      return `TrustCorp: Account activity detected. Check your app for details.`;
  }
}
