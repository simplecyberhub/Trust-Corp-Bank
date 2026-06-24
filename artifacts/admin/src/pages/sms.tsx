import { useState, useEffect } from "react";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Save, Send, RefreshCw, CheckCircle2, XCircle,
  Eye, EyeOff, Info, Zap, Globe, Webhook,
} from "lucide-react";

type Provider = "textbelt" | "termii" | "vonage" | "webhook";

const PROVIDERS: { value: Provider; label: string; description: string; icon: React.ElementType; keyLabel: string; keyPlaceholder: string; free: string }[] = [
  {
    value: "textbelt",
    label: "TextBelt",
    description: "No signup needed. Free tier sends 1 SMS/day globally. Use a paid quota key for unlimited sends.",
    icon: Zap,
    keyLabel: "API Key",
    keyPlaceholder: 'Leave blank for free (1/day) or enter paid key',
    free: "Free — no account required",
  },
  {
    value: "termii",
    label: "Termii",
    description: "Easy signup, free trial credits, global coverage. Popular for fintech apps. No strict KYC.",
    icon: Globe,
    keyLabel: "API Key",
    keyPlaceholder: "Termii API key from your dashboard",
    free: "Free trial credits on signup",
  },
  {
    value: "vonage",
    label: "Vonage (Nexmo)",
    description: "Global coverage, free €2 trial credit. Enter API key and secret separated by a colon: key:secret",
    icon: Globe,
    keyLabel: "API Key:Secret",
    keyPlaceholder: "your_api_key:your_api_secret",
    free: "Free €2 trial credit",
  },
  {
    value: "webhook",
    label: "Custom Webhook",
    description: "POST to any URL with JSON body { to, message, from }. Use with any SMS provider's HTTP API.",
    icon: Webhook,
    keyLabel: "Authorization Header (optional)",
    keyPlaceholder: "Bearer token or API key for Authorization header",
    free: "Bring your own provider",
  },
];

interface SmsConfig {
  provider: Provider;
  apiKey: string;
  apiKeySet: boolean;
  senderId: string;
  webhookUrl: string;
  enabled: boolean;
}

interface SmsLog {
  id: number;
  to: string;
  message: string;
  provider: string;
  status: "sent" | "failed";
  error: string | null;
  createdAt: string;
}

export function Sms() {
  const api = useAdminApi();
  const { toast } = useToast();

  const [config, setConfig] = useState<SmsConfig>({
    provider: "textbelt",
    apiKey: "",
    apiKeySet: false,
    senderId: "TrustCorp",
    webhookUrl: "",
    enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setSending] = useState(false);

  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsTotal, setLogsTotal] = useState(0);

  const selectedProvider = PROVIDERS.find(p => p.value === config.provider) ?? PROVIDERS[0];

  useEffect(() => { fetchConfig(); fetchLogs(); }, []);

  async function fetchConfig() {
    setLoading(true);
    try {
      const data = await api.get<SmsConfig>("/admin/sms/config");
      setConfig(data);
    } catch (err: any) {
      toast({ title: "Failed to load SMS config", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      const data = await api.get<{ items: SmsLog[]; total: number }>("/admin/sms/logs?limit=50");
      setLogs(data.items ?? []);
      setLogsTotal(data.total ?? 0);
    } catch {
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/admin/sms/config", {
        provider: config.provider,
        ...(config.apiKey && { apiKey: config.apiKey }),
        senderId: config.senderId,
        webhookUrl: config.webhookUrl,
        enabled: config.enabled,
      });
      toast({ title: "SMS configuration saved", description: "Settings updated successfully." });
      fetchConfig();
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testPhone.trim()) { toast({ title: "Enter a phone number", variant: "destructive" }); return; }
    setSending(true);
    try {
      await api.post("/admin/sms/test", { phone: testPhone.trim() });
      toast({ title: "Test SMS sent!", description: `Message delivered to ${testPhone}.` });
      fetchLogs();
    } catch (err: any) {
      toast({ title: "Test SMS failed", description: err?.data?.error ?? err?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  const statusBadge = (status: string) =>
    status === "sent"
      ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400"><CheckCircle2 size={11} />Sent</span>
      : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400"><XCircle size={11} />Failed</span>;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/20">
            <MessageSquare size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">SMS Gateway</h1>
            <p className="text-sm text-gray-400">Configure and manage transaction SMS alerts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${config.enabled ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-gray-700/50 text-gray-400 border-gray-600"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.enabled ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
            {config.enabled ? "Active" : "Disabled"}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Enable/Disable toggle */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">SMS Notifications</p>
            <p className="text-xs text-gray-400 mt-0.5">Send automated alerts for transfers, top-ups, and exchanges</p>
          </div>
          <button
            type="button"
            onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? "bg-blue-600" : "bg-gray-700"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${config.enabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        {/* Provider Selection */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">SMS Provider</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROVIDERS.map((p) => {
              const Icon = p.icon;
              const active = config.provider === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setConfig(c => ({ ...c, provider: p.value }))}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${active ? "border-blue-500 bg-blue-500/10" : "border-gray-700 bg-gray-800/50 hover:border-gray-600"}`}
                >
                  <Icon size={16} className={`mt-0.5 shrink-0 ${active ? "text-blue-400" : "text-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${active ? "text-blue-300" : "text-white"}`}>{p.label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{p.description}</p>
                    <span className="inline-block mt-1.5 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">{p.free}</span>
                  </div>
                  {active && <CheckCircle2 size={14} className="text-blue-400 shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>

          {/* Info Banner for TextBelt Free */}
          {config.provider === "textbelt" && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300 leading-relaxed">
                <strong>Free tier:</strong> Leave the API key blank to use "textbelt" (1 SMS/day globally, shared quota). For more volume, buy a quota key at <span className="underline">textbelt.com</span> — no account or KYC required, just a credit card.
              </p>
            </div>
          )}
          {config.provider === "vonage" && (
            <div className="flex items-start gap-2.5 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-300 leading-relaxed">
                Enter your API key and secret separated by a colon: <code className="font-mono bg-gray-800 px-1 rounded text-blue-200">key:secret</code>. Both are visible on your Vonage dashboard.
              </p>
            </div>
          )}
        </div>

        {/* Credentials */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Credentials</h2>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{selectedProvider.keyLabel}</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={config.apiKey}
                onChange={(e) => setConfig(c => ({ ...c, apiKey: e.target.value }))}
                placeholder={config.apiKeySet ? "••••••••••• (key saved — enter new to replace)" : selectedProvider.keyPlaceholder}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 pr-10 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Sender ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Sender ID / From Name</label>
            <input
              type="text"
              value={config.senderId}
              onChange={(e) => setConfig(c => ({ ...c, senderId: e.target.value }))}
              placeholder="TrustCorp"
              maxLength={11}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-gray-500">Max 11 characters. Some providers require pre-approved sender IDs.</p>
          </div>

          {/* Webhook URL */}
          {config.provider === "webhook" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Webhook URL</label>
              <input
                type="url"
                value={config.webhookUrl}
                onChange={(e) => setConfig(c => ({ ...c, webhookUrl: e.target.value }))}
                placeholder="https://api.yourprovider.com/sms/send"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-[11px] text-gray-500">Receives a POST with JSON: {"{ to, message, from }"}</p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-60"
        >
          {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={15} />}
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </form>

      {/* Test SMS */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Send Test SMS</h2>
          <p className="text-xs text-gray-400 mt-0.5">Verify your gateway is working by sending a test message.</p>
        </div>
        <form onSubmit={handleTest} className="flex gap-3">
          <input
            type="tel"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="+1234567890 (include country code)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={testing || !config.enabled}
            title={!config.enabled ? "Enable SMS gateway first" : undefined}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 shrink-0"
          >
            {testing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={15} />}
            {testing ? "Sending..." : "Send Test"}
          </button>
        </form>
        {!config.enabled && (
          <p className="text-xs text-amber-400">⚠ Enable the SMS gateway above before sending a test.</p>
        )}
      </div>

      {/* SMS Logs */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-white">SMS Log</h2>
            <p className="text-xs text-gray-400 mt-0.5">{logsTotal} messages total</p>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loadingLogs}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={loadingLogs ? "animate-spin" : ""} />
          </button>
        </div>

        {loadingLogs ? (
          <div className="p-8 flex justify-center">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center">
            <MessageSquare size={28} className="text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No SMS messages sent yet.</p>
            <p className="text-xs text-gray-600 mt-1">Messages will appear here after transactions trigger alerts.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {logs.map((log) => (
              <div key={log.id} className="px-5 py-3.5 flex items-start gap-4">
                <div className="shrink-0 pt-0.5">{statusBadge(log.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-gray-300">{log.to}</span>
                    <span className="text-[10px] text-gray-600 uppercase">{log.provider}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{log.message}</p>
                  {log.error && <p className="text-xs text-red-400 mt-0.5 truncate">{log.error}</p>}
                </div>
                <span className="text-[10px] text-gray-600 shrink-0 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
