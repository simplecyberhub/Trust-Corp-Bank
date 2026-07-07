import { useQuery } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { Download, BarChart3, RefreshCw, TrendingUp, ArrowDownLeft, ArrowUpRight, RefreshCcw } from "lucide-react";
import { useState } from "react";

interface TxRow {
  id: number;
  accountId: number;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  reference: string | null;
  recipientName: string | null;
  recipientAccount: string | null;
  balanceAfter: number | null;
  createdAt: string;
  userEmail?: string;
  userFullName?: string;
}

interface TransactionList {
  items: TxRow[];
  total: number;
}

function txIcon(type: string) {
  switch (type) {
    case "credit": return <ArrowDownLeft size={13} className="text-green-400" />;
    case "debit": return <ArrowUpRight size={13} className="text-red-400" />;
    case "exchange": return <RefreshCcw size={13} className="text-blue-400" />;
    default: return <ArrowUpRight size={13} className="text-orange-400" />;
  }
}

function typeBadge(type: string) {
  const m: Record<string, string> = {
    transfer: "bg-orange-500/10 text-orange-400",
    topup: "bg-green-500/10 text-green-400",
    exchange: "bg-blue-500/10 text-blue-400",
    credit: "bg-green-500/10 text-green-400",
    debit: "bg-red-500/10 text-red-400",
  };
  return m[type] ?? "bg-gray-500/10 text-gray-400";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function downloadCsv(rows: TxRow[]) {
  const headers = ["ID", "Date", "Type", "Amount", "Currency", "Status", "Description", "Reference", "Recipient", "Balance After", "Account ID"];
  const csvRows = rows.map(r => [
    r.id,
    r.createdAt,
    r.type,
    r.amount,
    r.currency,
    r.status,
    `"${(r.description ?? "").replace(/"/g, '""')}"`,
    r.reference ?? "",
    r.recipientName ?? r.recipientAccount ?? "",
    r.balanceAfter ?? "",
    r.accountId,
  ].join(","));
  const csv = [headers.join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trustcorp-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Reports() {
  const api = useAdminApi();
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const limit = 100;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["reports-transactions", page, typeFilter],
    queryFn: () =>
      api.get<TransactionList>(`/admin/transactions?limit=${limit}&offset=${page * limit}${typeFilter ? `&type=${typeFilter}` : ""}`),
    staleTime: 15_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Summary stats from visible items
  const totalVolume = items.reduce((s, t) => s + Number(t.amount), 0);
  const byType = items.reduce((acc, t) => { acc[t.type] = (acc[t.type] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  const types = ["", "transfer", "topup", "exchange", "credit", "debit"];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Exports</h1>
          <p className="text-sm text-gray-400 mt-0.5">View and export transaction data</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-xl text-sm hover:bg-gray-700 transition-colors"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => downloadCsv(items)}
            disabled={items.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            <Download size={14} />
            Export CSV ({items.length})
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total on page</p>
          <p className="text-xl font-bold text-white">{total.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Volume (page)</p>
          <p className="text-xl font-bold text-white">${totalVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Transfers</p>
          <p className="text-xl font-bold text-white">{(byType.transfer ?? 0) + (byType.topup ?? 0)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Exchanges</p>
          <p className="text-xl font-bold text-white">{byType.exchange ?? 0}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {types.map(t => (
          <button
            key={t || "all"}
            onClick={() => { setTypeFilter(t); setPage(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              typeFilter === t
                ? "bg-blue-600 text-white"
                : "bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            {t === "" ? "All Types" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Date</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Type</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Amount</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Description</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Reference</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-800 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500 py-16">
                    <BarChart3 size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No transactions found</p>
                  </td>
                </tr>
              ) : items.map(tx => (
                <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(tx.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge(tx.type)}`}>
                      {txIcon(tx.type)}
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-white whitespace-nowrap">
                    {Number(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs max-w-[200px] truncate">{tx.description}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">{tx.reference ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      tx.status === "completed" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">{total.toLocaleString()} total transactions</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-700">
              Previous
            </button>
            <span className="px-3 py-1.5 text-xs text-gray-400">Page {page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-700">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
