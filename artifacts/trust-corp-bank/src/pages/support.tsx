import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, ChevronDown, ChevronUp, Plus, Send } from "lucide-react";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface SupportTicket {
  id: number;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ─── Config ────────────────────────────────────────────────────────────────── */

const statusCfg: Record<string, { label: string; dot: string; text: string }> = {
  open: { label: "Open", dot: "bg-green-400", text: "text-green-400" },
  in_progress: { label: "In Progress", dot: "bg-yellow-400", text: "text-yellow-400" },
  resolved: { label: "Resolved", dot: "bg-blue-400", text: "text-blue-400" },
  closed: { label: "Closed", dot: "bg-gray-400", text: "text-gray-400" },
};

const priorityLabels: Record<string, string> = {
  low: "Low Priority",
  medium: "Medium Priority",
  high: "High Priority",
  urgent: "Urgent",
};

/* ─── API hook ──────────────────────────────────────────────────────────────── */

function useBankApi() {
  const { getToken } = useAuth();
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Request failed");
    }
    return res.json() as Promise<T>;
  }
  return call;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function Support() {
  const call = useBankApi();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form state
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: () => call<SupportTicket[]>("GET", "/support-tickets"),
  });

  const submit = useMutation({
    mutationFn: () => call("POST", "/support-tickets", { subject: subject.trim(), message: message.trim(), priority }),
    onSuccess: () => {
      toast({ title: "Support ticket submitted", description: "We'll get back to you as soon as possible." });
      qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
      setSubject("");
      setMessage("");
      setPriority("medium");
      setShowForm(false);
    },
    onError: (err: any) => toast({ title: "Failed to submit", description: err.message, variant: "destructive" }),
  });

  const canSubmit = subject.trim().length >= 3 && message.trim().length >= 10;

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Help & Support</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Submit and track support requests</p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            className="gap-1.5"
          >
            <Plus size={14} />
            New Ticket
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">

        {/* ── New Ticket Form ── */}
        {showForm && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-foreground">New Support Request</h2>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What do you need help with?"
                maxLength={200}
                className="bg-background border-border text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue in detail…"
                rows={4}
                maxLength={5000}
                className="bg-background border-border text-foreground resize-none"
              />
              <p className="text-[11px] text-muted-foreground text-right">{message.length}/5000</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Priority</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["low", "medium", "high", "urgent"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      priority === p
                        ? p === "urgent" ? "bg-red-500/20 border-red-500/40 text-red-400"
                          : p === "high" ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                          : p === "medium" ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                          : "bg-gray-500/20 border-gray-500/40 text-gray-300"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {priorityLabels[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-1.5"
                disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate()}
              >
                <Send size={14} />
                {submit.isPending ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Ticket List ── */}
        {isLoading ? (
          <div className="space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-16 h-16 bg-muted/30 rounded-2xl flex items-center justify-center mx-auto">
              <MessageSquare size={28} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No support tickets yet</p>
              <p className="text-xs text-muted-foreground mt-1">Tap "New Ticket" to get help</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const sc = statusCfg[t.status] ?? statusCfg["open"];
              const isExpanded = expandedId === t.id;
              return (
                <div key={t.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="w-full p-4 flex items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />
                        <span className={`text-[11px] font-semibold ${sc.text}`}>{sc.label}</span>
                        <span className="text-[11px] text-muted-foreground capitalize">· {priorityLabels[t.priority]}</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{t.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(t.createdAt), "MMM d, yyyy")}
                        {t.adminReply && <span className="ml-2 text-primary">· Admin replied</span>}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0 mt-0.5" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Your Message</p>
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap">{t.message}</p>
                      </div>
                      {t.adminReply && (
                        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1.5">Support Reply</p>
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{t.adminReply}</p>
                          <p className="text-[11px] text-muted-foreground mt-2">Updated {format(new Date(t.updatedAt), "MMM d, yyyy HH:mm")}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
