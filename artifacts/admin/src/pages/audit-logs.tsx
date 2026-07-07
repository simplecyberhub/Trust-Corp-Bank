import { useQuery } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { Shield, RefreshCw, Search } from "lucide-react";
import { useState } from "react";

interface AuditLog {
  id: number;
  adminId: number;
  adminEmail: string;
  action: string;
  targetUserId: number | null;
  targetEmail: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

function actionBadge(action: string) {
  const colors: Record<string, string> = {
    kyc_approved: "bg-green-500/10 text-green-400 border-green-500/20",
    kyc_rejected: "bg-red-500/10 text-red-400 border-red-500/20",
    kyc_revoked: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    user_banned: "bg-red-500/10 text-red-400 border-red-500/20",
    user_unbanned: "bg-green-500/10 text-green-400 border-green-500/20",
    hard_freeze: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    hard_unfreeze: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    account_credited: "bg-green-500/10 text-green-400 border-green-500/20",
    account_debited: "bg-red-500/10 text-red-400 border-red-500/20",
    transfer_restricted: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    transfer_unrestricted: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    broadcast: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return colors[action] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20";
}

function fmtAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function AuditLogs() {
  const api = useAdminApi();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: () => api.get<{ items: AuditLog[]; total: number }>(`/admin/audit-logs?limit=${limit}&offset=${page * limit}`),
    staleTime: 10_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const filtered = search.trim()
    ? items.filter(l =>
        l.action.includes(search.toLowerCase()) ||
        l.adminEmail.toLowerCase().includes(search.toLowerCase()) ||
        (l.targetEmail ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (l.details ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : items;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-gray-400 mt-0.5">All admin actions recorded for compliance</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-xl text-sm hover:bg-gray-700 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by action, admin, or user..."
          className="w-full pl-9 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Time</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Admin</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Action</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Target</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-800/50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-800 rounded animate-pulse" style={{ width: `${60 + j * 10}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-gray-500 py-16">
                  <Shield size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No audit log entries found</p>
                </td>
              </tr>
            ) : (
              filtered.map(log => (
                <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">{fmtDate(log.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs truncate max-w-[160px]">{log.adminEmail}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${actionBadge(log.action)}`}>
                      {fmtAction(log.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[180px]">
                    {log.targetEmail ?? (log.targetUserId ? `User #${log.targetUserId}` : "—")}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-[240px] truncate" title={log.details ?? ""}>
                    {log.details ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">{total} total entries</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-xs text-gray-400">Page {page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
