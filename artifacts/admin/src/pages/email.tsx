import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { Mail, Save, Send, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface EmailConfig {
  provider: string;
  apiKey: string;
  fromAddress: string;
  enabled: boolean;
}

export function Email() {
  const api = useAdminApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showKey, setShowKey] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [form, setForm] = useState<EmailConfig | null>(null);

  const { isLoading } = useQuery({
    queryKey: ["email-config"],
    queryFn: async () => {
      const config = await api.get<EmailConfig>("/admin/email/config");
      setForm(config);
      return config;
    },
  });

  const saveMutation = useMutation({
    mutationFn: (config: EmailConfig) => api.post("/admin/email/config", config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-config"] });
      toast({ title: "Email config saved", description: "Settings updated successfully." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (to: string) => api.post<{ success: boolean; error?: string }>("/admin/email/test", { to }),
    onSuccess: (result) => {
      if (result.success) {
        toast({ title: "Test email sent", description: `Email delivered to ${testTo}` });
      } else {
        toast({ title: "Test failed", description: result.error ?? "Unknown error", variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Test failed", variant: "destructive" }),
  });

  if (isLoading || !form) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Email Notifications</h1>
        <p className="text-sm text-gray-400 mt-0.5">Configure email alerts sent to users on every transaction</p>
      </div>

      {/* Enable toggle */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${form.enabled ? "bg-blue-500/10 border-blue-500/20" : "bg-gray-800 border-gray-700"}`}>
              <Mail size={18} className={form.enabled ? "text-blue-400" : "text-gray-500"} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Email Notifications</p>
              <p className="text-xs text-gray-400 mt-0.5">{form.enabled ? "Active — users receive email alerts" : "Disabled"}</p>
            </div>
          </div>
          <button
            onClick={() => setForm(f => f ? { ...f, enabled: !f.enabled } : f)}
            className={`relative w-12 h-6 rounded-full transition-colors ${form.enabled ? "bg-blue-600" : "bg-gray-700"}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${form.enabled ? "translate-x-7" : "translate-x-1"}`} />
          </button>
        </div>
      </div>

      {/* Provider selection */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 space-y-4">
        <h3 className="text-sm font-semibold text-white">Provider</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "resend", label: "Resend", sub: "resend.com — free tier 3,000 emails/mo" },
            { value: "disabled", label: "Disabled", sub: "No emails sent" },
          ].map(p => (
            <button
              key={p.value}
              onClick={() => setForm(f => f ? { ...f, provider: p.value } : f)}
              className={`p-4 rounded-xl border text-left transition-colors ${
                form.provider === p.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-700 bg-gray-800 hover:border-gray-600"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-white">{p.label}</p>
                {form.provider === p.value && <CheckCircle2 size={14} className="text-blue-400" />}
              </div>
              <p className="text-xs text-gray-400">{p.sub}</p>
            </button>
          ))}
        </div>

        {form.provider === "resend" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">Resend API Key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={form.apiKey}
                  onChange={e => setForm(f => f ? { ...f, apiKey: e.target.value } : f)}
                  placeholder="re_..."
                  className="w-full pr-10 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button onClick={() => setShowKey(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Get your key at <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">resend.com/api-keys</a></p>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">From Address</label>
              <input
                type="email"
                value={form.fromAddress}
                onChange={e => setForm(f => f ? { ...f, fromAddress: e.target.value } : f)}
                placeholder="noreply@yourdomain.com"
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Must be a verified domain in Resend. Use <code className="text-gray-400">onboarding@resend.dev</code> to test with resend.com email.</p>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <button
        onClick={() => saveMutation.mutate(form)}
        disabled={saveMutation.isPending}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60 mb-6"
      >
        <Save size={15} />
        {saveMutation.isPending ? "Saving…" : "Save Email Config"}
      </button>

      {/* Test email */}
      {form.enabled && form.provider !== "disabled" && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Send Test Email</h3>
          <div className="flex gap-2">
            <input
              type="email"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => testTo && testMutation.mutate(testTo)}
              disabled={!testTo || testMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-xl text-sm font-medium hover:bg-gray-600 transition-colors disabled:opacity-40"
            >
              <Send size={13} />
              {testMutation.isPending ? "Sending…" : "Send"}
            </button>
          </div>
          {testMutation.data && (
            <div className={`mt-3 flex items-center gap-2 text-sm ${testMutation.data.success ? "text-green-400" : "text-red-400"}`}>
              {testMutation.data.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {testMutation.data.success ? "Test email sent successfully" : testMutation.data.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
