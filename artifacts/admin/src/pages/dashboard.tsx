import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { Users, CreditCard, ArrowRightLeft, Shield, DollarSign, TrendingUp, Bell, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface Stats {
  userCount: number;
  accountCount: number;
  transactionCount: number;
  pendingKyc: number;
  totalBalanceUsd: number;
  transactionVolume24h: number;
}

interface AdminMe {
  isAdmin: boolean;
  role: string;
  email: string;
  fullName: string;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">{label}</p>
          <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const api = useAdminApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [setupSecret, setSetupSecret] = useState("");

  const { data: me, isLoading: loadingMe } = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => api.get<AdminMe>("/admin/me"),
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<Stats>("/admin/stats"),
    enabled: me?.isAdmin,
  });

  const setupAdmin = useMutation({
    mutationFn: () => api.post<{ success: boolean; message: string }>("/admin/setup", { secret: setupSecret }),
    onSuccess: (data) => {
      toast({ title: "Admin setup complete", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["admin-me"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: any) => toast({ title: "Setup failed", description: err.message, variant: "destructive" }),
  });

  const broadcast = useMutation({
    mutationFn: () => api.post("/admin/notifications/broadcast", { title: broadcastTitle, message: broadcastMsg, type: "system" }),
    onSuccess: (data: any) => {
      toast({ title: "Broadcast sent", description: data.message });
      setBroadcastTitle(""); setBroadcastMsg("");
    },
    onError: (err: any) => toast({ title: "Broadcast failed", description: err.message, variant: "destructive" }),
  });

  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
  const fmtUsd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  if (loadingMe) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!me?.isAdmin) {
    return (
      <div className="p-8 max-w-md">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
          <Shield size={40} className="text-blue-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Admin Setup Required</h2>
          <p className="text-sm text-gray-400 mb-4">
            Sign in to the main banking app first, then enter the setup secret below to claim admin access.
            Only one administrator is allowed.
          </p>
          <input
            type="password"
            value={setupSecret}
            onChange={(e) => setSetupSecret(e.target.value)}
            placeholder="Enter admin setup secret…"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 mb-3 transition-colors"
          />
          <Button
            onClick={() => setupAdmin.mutate()}
            disabled={setupAdmin.isPending || !setupSecret.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {setupAdmin.isPending ? "Setting up…" : "Claim Admin Access"}
          </Button>
          {setupAdmin.isError && (
            <p className="text-xs text-red-400 mt-3">{(setupAdmin.error as any)?.message}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Trust Corp Bank — Admin Overview</p>
      </div>

      {/* Stats Grid */}
      {loadingStats ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard icon={Users} label="Total Users" value={fmt(stats.userCount)} color="bg-blue-600" />
          <StatCard icon={CreditCard} label="Accounts" value={fmt(stats.accountCount)} color="bg-purple-600" />
          <StatCard icon={ArrowRightLeft} label="Transactions" value={fmt(stats.transactionCount)} color="bg-green-600" />
          <StatCard
            icon={Shield}
            label="Pending KYC"
            value={stats.pendingKyc}
            sub="Awaiting review"
            color={stats.pendingKyc > 0 ? "bg-orange-500" : "bg-gray-700"}
          />
          <StatCard
            icon={DollarSign}
            label="USD Balances"
            value={fmtUsd(stats.totalBalanceUsd)}
            sub="Total across accounts"
            color="bg-emerald-600"
          />
          <StatCard
            icon={TrendingUp}
            label="Volume (24h)"
            value={fmtUsd(stats.transactionVolume24h)}
            sub="Transaction volume"
            color="bg-indigo-600"
          />
        </div>
      ) : null}

      {/* Broadcast */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={17} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Broadcast Notification</h3>
        </div>
        <div className="space-y-3">
          <input
            value={broadcastTitle}
            onChange={(e) => setBroadcastTitle(e.target.value)}
            placeholder="Notification title…"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <textarea
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
            placeholder="Message body…"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
          />
          <Button
            onClick={() => broadcast.mutate()}
            disabled={broadcast.isPending || !broadcastTitle || !broadcastMsg}
            className="bg-blue-600 hover:bg-blue-700 h-10 px-5 text-sm"
          >
            {broadcast.isPending ? "Sending…" : "Send to All Users"}
          </Button>
        </div>
      </div>
    </div>
  );
}
