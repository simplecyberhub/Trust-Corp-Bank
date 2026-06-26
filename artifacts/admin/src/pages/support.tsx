import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Search, MessageSquare, RefreshCw, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface SupportTicket {
  id: number;
  userId: number;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  adminReply: string | null;
  adminUserId: number | null;
  userEmail: string | null;
  userFullName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TicketsResponse {
  items: SupportTicket[];
  total: number;
}

/* ─── Config ────────────────────────────────────────────────────────────────── */

const statusCfg: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "text-green-400 bg-green-500/10 border-green-500/20" },
  in_progress: { label: "In Progress", cls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  resolved: { label: "Resolved", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  closed: { label: "Closed", cls: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
};

const priorityCfg: Record<string, { label: string; cls: string }> = {
  low: { label: "Low", cls: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
  medium: { label: "Medium", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  high: { label: "High", cls: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  urgent: { label: "Urgent", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const STATUS_FILTERS = ["all", "open", "in_progress", "resolved", "closed"] as const;

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function Support() {
  const api = useAdminApi();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState("");
  const [newStatus, setNewStatus] = useState<string>("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-support-tickets", statusFilter],
    queryFn: () =>
      api.get<TicketsResponse>(
        statusFilter === "all"
          ? "/admin/support-tickets?limit=100"
          : `/admin/support-tickets?limit=100&status=${statusFilter}`
      ),
  });

  const updateTicket = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.patch(`/admin/support-tickets/${selected!.id}`, body),
    onSuccess: (updated: any) => {
      toast({ title: "Ticket updated" });
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      setSelected((prev) => prev ? { ...prev, ...updated } : null);
      setReply("");
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const filtered = (data?.items ?? []).filter((t) =>
    !search ||
    t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
    t.userFullName?.toLowerCase().includes(search.toLowerCase())
  );

  function openTicket(t: SupportTicket) {
    setSelected(t);
    setReply(t.adminReply ?? "");
    setNewStatus(t.status);
  }

  function handleUpdate() {
    const body: Record<string, string> = {};
    if (newStatus && newStatus !== selected?.status) body.status = newStatus;
    if (reply !== (selected?.adminReply ?? "")) body.adminReply = reply;
    if (Object.keys(body).length === 0) return;
    updateTicket.mutate(body);
  }

  const openCount = (data?.items ?? []).filter((t) => t.status === "open").length;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Support Tickets</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {data?.total ?? 0} total
            {openCount > 0 && <span className="ml-2 text-green-400 font-medium">{openCount} open</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors" title="Refresh">
            <RefreshCw size={15} />
          </button>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 w-56 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800 w-fit">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["User", "Subject", "Priority", "Status", "Created", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>{Array(6).fill(0).map((__, j) => (
                    <td key={j} className="px-4 py-3.5"><div className="h-4 bg-gray-800 rounded animate-pulse w-24" /></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-500">
                    <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No support tickets found.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const sc = statusCfg[t.status] ?? statusCfg["open"];
                  const pc = priorityCfg[t.priority] ?? priorityCfg["medium"];
                  return (
                    <tr
                      key={t.id}
                      onClick={() => openTicket(t)}
                      className="hover:bg-gray-800/40 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-white text-xs">{t.userFullName ?? "—"}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{t.userEmail ?? ""}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-white font-medium max-w-[200px] truncate">{t.subject}</p>
                        {t.adminReply && <p className="text-[11px] text-blue-400 mt-0.5">Has reply</p>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${pc.cls}`}>{pc.label}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">{format(new Date(t.createdAt), "MMM d, yyyy")}</td>
                      <td className="px-4 py-3.5"><ChevronDown size={14} className="text-gray-600 rotate-[-90deg]" /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Ticket Detail Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white text-base font-bold pr-6">{selected.subject}</DialogTitle>
                <div className="flex items-center gap-2 pt-1">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${priorityCfg[selected.priority]?.cls}`}>
                    {priorityCfg[selected.priority]?.label}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg[selected.status]?.cls}`}>
                    {statusCfg[selected.status]?.label}
                  </span>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* User info */}
                <div className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2 space-y-0.5">
                  <p>From: <span className="text-white">{selected.userFullName ?? "—"}</span> ({selected.userEmail})</p>
                  <p>Submitted: {format(new Date(selected.createdAt), "MMM d, yyyy HH:mm")}</p>
                </div>

                {/* Message */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Message</p>
                  <p className="text-sm text-gray-200 bg-gray-800 rounded-xl p-4 whitespace-pre-wrap">{selected.message}</p>
                </div>

                {/* Status Update */}
                <div className="space-y-1.5">
                  <Label className="text-gray-300">Update Status</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {(["open", "in_progress", "resolved", "closed"] as const).map((s) => {
                      const c = statusCfg[s];
                      return (
                        <button
                          key={s}
                          onClick={() => setNewStatus(s)}
                          className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors capitalize ${
                            newStatus === s ? c.cls : "text-gray-500 bg-gray-800 border-gray-700 hover:border-gray-500"
                          }`}
                        >
                          {s.replace("_", " ")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Admin Reply */}
                <div className="space-y-1.5">
                  <Label className="text-gray-300">Admin Reply</Label>
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type your reply to the user…"
                    rows={4}
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" className="border-gray-700 text-gray-300" onClick={() => setSelected(null)}>Close</Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={updateTicket.isPending}
                  onClick={handleUpdate}
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
