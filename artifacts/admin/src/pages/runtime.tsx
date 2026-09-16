import { useQuery } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { CheckCircle2, CircleAlert, LockKeyhole, ServerCog } from "lucide-react";

type RuntimeStatus = {
  environment: string;
  production: boolean;
  debugEnabled: boolean;
  portConfigured: boolean;
  clerkConfigured: boolean;
  databaseConfigured: boolean;
  emailConfigured: boolean;
  smsConfigured: boolean;
  adminSetupConfigured: boolean;
  clerkProxyEnabled: boolean;
  allowedOrigins: string[];
  missingRequired: string[];
};

export function Runtime() {
  const api = useAdminApi();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-runtime-config"],
    queryFn: () => api.get<RuntimeStatus>("/admin/runtime-config"),
    staleTime: 15_000,
  });

  const checks = data ? [
    ["Clerk authentication", data.clerkConfigured, "Publishable and secret keys are configured server-side."],
    ["Database", data.databaseConfigured, "A production database connection is configured."],
    ["Production mode", data.production && !data.debugEnabled, "Debug behavior and development overlays are disabled."],
    ["Clerk proxy", data.clerkProxyEnabled, "Custom-domain authentication proxy is enabled."],
    ["Email delivery", data.emailConfigured, "Resend is configured for production notifications."],
    ["SMS delivery", data.smsConfigured, "Termii is configured for production notifications."],
    ["Admin bootstrap", data.adminSetupConfigured, "Admin bootstrap is protected by a server secret."],
  ] as const : [];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center">
            <ServerCog size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Production readiness</h1>
            <p className="text-sm text-gray-400 mt-1">Safe configuration diagnostics for the deployed service.</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 rounded-2xl bg-gray-900 border border-gray-800 animate-pulse" />
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300">
          Unable to read runtime configuration. The admin session may have expired.
        </div>
      ) : data ? (
        <>
          <div className={`rounded-2xl border p-5 ${data.production && data.missingRequired.length === 0 ? "border-green-500/20 bg-green-500/10" : "border-amber-500/20 bg-amber-500/10"}`}>
            <div className="flex items-start gap-3">
              <LockKeyhole size={20} className={data.production ? "text-green-400" : "text-amber-400"} />
              <div>
                <p className="text-sm font-bold text-white">
                  Environment: <span className="capitalize">{data.environment}</span>
                </p>
                <p className="text-xs text-gray-300 mt-1">
                  Secrets are never returned here. This page only reports whether each required capability is configured.
                </p>
                {data.missingRequired.length > 0 && (
                  <p className="text-xs text-amber-300 mt-2">Missing required production settings: {data.missingRequired.join(", ")}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {checks.map(([label, passed, description]) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-start gap-3">
                {passed ? <CheckCircle2 size={19} className="text-green-400 shrink-0" /> : <CircleAlert size={19} className="text-amber-400 shrink-0" />}
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-xs text-gray-400 mt-1">{description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-white mb-3">Allowed browser origins</h2>
            <div className="space-y-2">
              {data.allowedOrigins.length ? data.allowedOrigins.map((origin) => (
                <div key={origin} className="text-xs font-mono text-gray-300 bg-gray-950 rounded-lg px-3 py-2">{origin}</div>
              )) : <p className="text-xs text-gray-500">No custom origin configured. The built-in Replit and Render origin patterns remain active.</p>}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}