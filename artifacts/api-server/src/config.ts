const nodeEnv = process.env.NODE_ENV === "production" ? "production" : "development";
const isProduction = nodeEnv === "production";

const requiredProductionKeys = [
  ["CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY],
  ["CLERK_PUBLISHABLE_KEY", process.env.CLERK_PUBLISHABLE_KEY],
  ["SUPABASE_DATABASE_URL or DATABASE_URL", process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL],
] as const;

const missingProductionKeys = requiredProductionKeys
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (isProduction && missingProductionKeys.length > 0) {
  throw new Error(
    `Production configuration is incomplete. Set: ${missingProductionKeys.join(", ")}. ` +
    "Do not use development placeholders in a production deployment.",
  );
}

const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const appConfig = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? "3000"),
  allowedOrigins,
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? "",
  clerkSecretKeyConfigured: Boolean(process.env.CLERK_SECRET_KEY),
  databaseConfigured: Boolean(process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL),
  emailConfigured: Boolean(process.env.RESEND_API_KEY),
  smsConfigured: Boolean(process.env.TERMII_API_KEY),
  adminSetupConfigured: Boolean(process.env.ADMIN_SETUP_SECRET),
  logLevel: process.env.LOG_LEVEL ?? "info",
} as const;

if (!Number.isInteger(appConfig.port) || appConfig.port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT ?? ""}"`);
}

export function getSafeRuntimeStatus() {
  return {
    environment: appConfig.nodeEnv,
    production: appConfig.isProduction,
    debugEnabled: !appConfig.isProduction,
    portConfigured: Boolean(process.env.PORT),
    clerkConfigured: Boolean(appConfig.clerkPublishableKey && appConfig.clerkSecretKeyConfigured),
    databaseConfigured: appConfig.databaseConfigured,
    emailConfigured: appConfig.emailConfigured,
    smsConfigured: appConfig.smsConfigured,
    adminSetupConfigured: appConfig.adminSetupConfigured,
    clerkProxyEnabled: appConfig.isProduction && appConfig.clerkSecretKeyConfigured,
    allowedOrigins: appConfig.allowedOrigins,
    missingRequired: missingProductionKeys,
  };
}