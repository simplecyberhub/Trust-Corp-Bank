import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Lock, Unlock, Search } from "lucide-react";
import { useState } from "react";

interface AdminAccount {
  id: number;
  userId: number;
  accountNumber: string;
  accountType: string;
  currency: string;
  balance: number;
  status: string;
  nickname: string | null;
  userEmail: string | null;
  userFullName: string | null;
  createdAt: string;
}

interface AccountsResponse {
  items: AdminAccount[];
  total: number;
}

export function Accounts() {
  const api = useAdminApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: () => api.get<AccountsResponse>("/admin/accounts?limit=100"),
  });

  const updateAccount = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch(`/admin/accounts/${id}`, body),
    onSuccess: () => {
      toast({ title: "Account updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const fmtAmt = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);

  const filtered = (data?.items ?? []).filter(
    (a) =>
      !search ||
      a.accountNumber.includes(search) ||
      a.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
      a.userFullName?.toLowerCase().includes(search.toLowerCase()) ||
      a.currency.toLowerCase().includes(search.toLowerCase()),
  );

  const totalsByStatus = (data?.items ?? []).reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Accounts</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {data?.total ?? 0} total · {totalsByStatus["active"] ?? 0} active · {totalsByStatus["frozen"] ?? 0} frozen
          </p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts…"
            className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 w-64 transition-colors"
          />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Account", "Owner", "Currency", "Balance", "Type", "Status", "Created", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {isLoading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((__, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-4 bg-gray-800 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500 text-sm">No accounts found.</td>
                </tr>
              ) : (
                filtered.map((acc) => (
                  <tr key={acc.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono text-gray-300">····{acc.accountNumber.slice(-4)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-white text-xs">{acc.userFullName ?? "—"}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{acc.userEmail ?? ""}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono font-semibold text-gray-200">{acc.currency}</span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-white text-xs">
                      {fmtAmt(acc.balance, acc.currency)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 capitalize">{acc.accountType}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        acc.status === "active"
                          ? "text-green-400 bg-green-500/10 border-green-500/20"
                          : acc.status === "frozen"
                          ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
                          : "text-gray-400 bg-gray-500/10 border-gray-500/20"
                      }`}>
                        {acc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">
                      {format(new Date(acc.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() =>
                          updateAccount.mutate({
                            id: acc.id,
                            body: { status: acc.status === "active" ? "frozen" : "active" },
                          })
                        }
                        title={acc.status === "active" ? "Freeze account" : "Unfreeze account"}
                        className={`p-1.5 rounded-lg transition-colors ${
                          acc.status === "active"
                            ? "text-gray-500 hover:text-blue-400 hover:bg-blue-500/20"
                            : "text-blue-400 hover:text-green-400 hover:bg-green-500/20"
                        }`}
                      >
                        {acc.status === "active" ? <Lock size={15} /> : <Unlock size={15} />}
                      </button>
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
