import { useQuery } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { format } from "date-fns";
import { ArrowRightLeft, Plus, RefreshCw, ArrowUpRight, ArrowDownLeft, Search } from "lucide-react";
import { useState } from "react";

interface AdminTx {
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
}

interface TxResponse {
  items: AdminTx[];
  total: number;
}

const typeIcon: Record<string, React.ReactNode> = {
  credit: <ArrowDownLeft size={14} className="text-green-400" />,
  debit: <ArrowUpRight size={14} className="text-red-400" />,
  transfer: <ArrowRightLeft size={14} className="text-blue-400" />,
  topup: <Plus size={14} className="text-sky-400" />,
  exchange: <RefreshCw size={14} className="text-purple-400" />,
};

const typeColor: Record<string, string> = {
  credit: "text-green-400 bg-green-500/10 border-green-500/20",
  debit: "text-red-400 bg-red-500/10 border-red-500/20",
  transfer: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  topup: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  exchange: "text-purple-400 bg-purple-500/10 border-purple-500/20",
};

const statusColor: Record<string, string> = {
  completed: "text-green-400",
  pending: "text-yellow-400",
  failed: "text-red-400",
};

export function Transactions() {
  const api = useAdminApi();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-transactions"],
    queryFn: () => api.get<TxResponse>("/admin/transactions?limit=100"),
  });

  const fmtAmt = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);

  const filtered = (data?.items ?? []).filter(
    (t) =>
      !search ||
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.reference?.toLowerCase().includes(search.toLowerCase()) ||
      t.recipientName?.toLowerCase().includes(search.toLowerCase()) ||
      String(t.accountId).includes(search),
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-sm text-gray-400 mt-0.5">{data?.total ?? 0} total transactions</p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions…"
            className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 w-64 transition-colors"
          />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Reference", "Type", "Amount", "Account", "Recipient", "Status", "Date"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {isLoading ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(7).fill(0).map((__, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-4 bg-gray-800 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500 text-sm">No transactions found.</td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono text-gray-300">{tx.reference ?? `#${tx.id}`}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${typeColor[tx.type] ?? "text-gray-400 bg-gray-500/10 border-gray-500/20"}`}>
                        {typeIcon[tx.type]}
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-white">{fmtAmt(tx.amount, tx.currency)}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[140px]">{tx.description}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 font-mono">acc-{tx.accountId}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-300">{tx.recipientName ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold capitalize ${statusColor[tx.status] ?? "text-gray-400"}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">
                      {format(new Date(tx.createdAt), "MMM d, h:mm a")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
