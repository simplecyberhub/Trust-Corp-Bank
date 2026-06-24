import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CheckCircle, XCircle, Clock, ShieldOff, Search } from "lucide-react";
import { useState } from "react";

interface AdminUser {
  id: number;
  clerkId: string;
  email: string;
  fullName: string;
  kycStatus: "none" | "submitted" | "approved" | "rejected";
  role: string;
  phone: string | null;
  phoneVerified: boolean;
  hasPin: boolean;
  createdAt: string;
}

interface UsersResponse {
  items: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

const KycBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, { label: string; cls: string }> = {
    approved: { label: "Approved", cls: "text-green-400 bg-green-500/10 border-green-500/20" },
    submitted: { label: "Pending", cls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
    rejected: { label: "Rejected", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
    none: { label: "Not Started", cls: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
  };
  const { label, cls } = cfg[status] ?? cfg["none"];
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
  );
};

export function Users() {
  const api = useAdminApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<UsersResponse>("/admin/users?limit=100"),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, string> }) =>
      api.patch(`/admin/users/${id}`, body),
    onSuccess: () => {
      toast({ title: "User updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const filtered = (data?.items ?? []).filter(
    (u) =>
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-400 mt-0.5">{data?.total ?? 0} total users</p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 w-64 transition-colors"
          />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["User", "KYC Status", "Role", "Phone", "Joined", "Actions"].map((h) => (
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
                    {Array(6).fill(0).map((__, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-4 bg-gray-800 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500 text-sm">No users found.</td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="font-medium text-white">{u.fullName || "—"}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <KycBadge status={u.kycStatus} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        u.role === "admin"
                          ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
                          : "text-gray-400 bg-gray-500/10 border-gray-500/20"
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-300 text-xs">{u.phone ?? "—"}</td>
                    <td className="px-4 py-3.5 text-gray-400 text-xs">
                      {format(new Date(u.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {u.kycStatus === "submitted" && (
                          <>
                            <button
                              onClick={() => updateUser.mutate({ id: u.id, body: { kycStatus: "approved" } })}
                              title="Approve KYC"
                              className="p-1.5 rounded-lg hover:bg-green-500/20 text-gray-500 hover:text-green-400 transition-colors"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => updateUser.mutate({ id: u.id, body: { kycStatus: "rejected" } })}
                              title="Reject KYC"
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                        {u.kycStatus === "approved" && (
                          <button
                            onClick={() => updateUser.mutate({ id: u.id, body: { kycStatus: "none" } })}
                            title="Revoke KYC"
                            className="p-1.5 rounded-lg hover:bg-orange-500/20 text-gray-500 hover:text-orange-400 transition-colors"
                          >
                            <ShieldOff size={16} />
                          </button>
                        )}
                        {u.kycStatus === "rejected" && (
                          <button
                            onClick={() => updateUser.mutate({ id: u.id, body: { kycStatus: "submitted" } })}
                            title="Reset to pending"
                            className="p-1.5 rounded-lg hover:bg-yellow-500/20 text-gray-500 hover:text-yellow-400 transition-colors"
                          >
                            <Clock size={16} />
                          </button>
                        )}
                      </div>
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
