import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  CheckCircle, XCircle, Clock, ShieldOff, Search, Ban, Lock, Unlock,
  CreditCard, MessageSquare, ShieldCheck, ArrowLeftRight, Snowflake,
  AlertTriangle, ChevronRight, User as UserIcon, RefreshCw, Mail,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/* ─── Types ────────────────────────────────────────────────────────────────── */

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
  totpEnabled: boolean;
  transferRestricted: boolean;
  banned: boolean;
  bannedReason: string | null;
  bannedAt: string | null;
  hardFrozen: boolean;
  createdAt: string;
}

interface AdminAccount {
  id: number;
  accountNumber: string;
  accountType: string;
  currency: string;
  balance: number;
  status: string;
  nickname: string | null;
}

interface ClerkInfo {
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  primaryEmail: string | null;
  externalAccounts: string[];
  lastSignInAt: string | null;
}

/* ─── Small helpers ─────────────────────────────────────────────────────────── */

const kycCfg: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "text-green-400 bg-green-500/10 border-green-500/20" },
  submitted: { label: "Pending", cls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  rejected: { label: "Rejected", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
  none: { label: "No KYC", cls: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
};

function KycBadge({ status }: { status: string }) {
  const { label, cls } = kycCfg[status] ?? kycCfg["none"];
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">{children}</h3>;
}

function Divider() {
  return <div className="border-t border-gray-800 my-5" />;
}

function fmtMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(amount);
}

/* ─── User Status Row Badges ─────────────────────────────────────────────── */

function UserStatusBadges({ user }: { user: AdminUser }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.banned && <Badge label="Banned" cls="text-red-400 bg-red-500/10 border-red-500/20" />}
      {user.hardFrozen && <Badge label="Hard Frozen" cls="text-blue-400 bg-blue-500/10 border-blue-500/20" />}
      {user.transferRestricted && <Badge label="Transfer Restricted" cls="text-orange-400 bg-orange-500/10 border-orange-500/20" />}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

export function Users() {
  const api = useAdminApi();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Ban dialog state
  const [banDialog, setBanDialog] = useState(false);
  const [banReason, setBanReason] = useState("");

  // Finance dialog state
  const [financeDialog, setFinanceDialog] = useState<"credit" | "debit" | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [financeAmount, setFinanceAmount] = useState("");
  const [financeDesc, setFinanceDesc] = useState("");

  // SMS dialog state
  const [smsDialog, setSmsDialog] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");

  /* queries */
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<{ items: AdminUser[]; total: number }>("/admin/users?limit=200"),
  });

  const { data: userAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["admin-user-accounts", selectedUser?.id],
    queryFn: () => api.get<AdminAccount[]>(`/admin/users/${selectedUser!.id}/accounts`),
    enabled: !!selectedUser,
  });

  const { data: clerkInfo, isLoading: clerkLoading } = useQuery({
    queryKey: ["admin-clerk-info", selectedUser?.id],
    queryFn: () => api.get<ClerkInfo>(`/admin/users/${selectedUser!.id}/clerk-info`),
    enabled: !!selectedUser,
  });

  /* mutations */
  const patchUser = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/admin/users/${selectedUser!.id}`, body),
    onSuccess: (updated: any) => {
      toast({ title: "User updated" });
      qc.setQueryData(["admin-users"], (old: any) => old
        ? { ...old, items: old.items.map((u: AdminUser) => u.id === updated.id ? { ...u, ...updated } : u) }
        : old);
      setSelectedUser((prev) => prev ? { ...prev, ...updated } : prev);
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const hardFreeze = useMutation({
    mutationFn: ({ freeze }: { freeze: boolean }) =>
      api.post<{ success: boolean; hardFrozen: boolean }>(`/admin/users/${selectedUser!.id}/hard-freeze`, { freeze }),
    onSuccess: (_data, { freeze }) => {
      toast({ title: freeze ? "All accounts frozen" : "All accounts unfrozen" });
      setSelectedUser((prev) => prev ? { ...prev, hardFrozen: freeze } : prev);
      qc.invalidateQueries({ queryKey: ["admin-user-accounts", selectedUser?.id] });
      qc.invalidateQueries({ queryKey: ["admin-accounts"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const creditDebit = useMutation({
    mutationFn: ({ type, body }: { type: "credit" | "debit"; body: object }) =>
      api.post(`/admin/users/${selectedUser!.id}/${type}`, body),
    onSuccess: (_: any, { type }) => {
      toast({ title: `Account ${type}ed successfully` });
      qc.invalidateQueries({ queryKey: ["admin-user-accounts", selectedUser?.id] });
      qc.invalidateQueries({ queryKey: ["admin-accounts"] });
      setFinanceDialog(null);
      setFinanceAmount("");
      setFinanceDesc("");
      setSelectedAccountId(null);
    },
    onError: (err: any) => toast({ title: "Transaction failed", description: err.message, variant: "destructive" }),
  });

  const sendSms = useMutation({
    mutationFn: () => api.post(`/admin/users/${selectedUser!.id}/sms`, { message: smsMessage }),
    onSuccess: () => {
      toast({ title: "SMS sent" });
      setSmsDialog(false);
      setSmsMessage("");
    },
    onError: (err: any) => toast({ title: "SMS failed", description: err.message, variant: "destructive" }),
  });

  /* helpers */
  const filtered = (data?.items ?? []).filter(
    (u) => !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  function handleBanConfirm() {
    patchUser.mutate({ banned: true, bannedReason: banReason || "Policy violation" }, {
      onSettled: () => { setBanDialog(false); setBanReason(""); },
    });
  }

  function handleFinanceSubmit() {
    if (!selectedAccountId || !financeAmount) return;
    creditDebit.mutate({
      type: financeDialog!,
      body: { accountId: selectedAccountId, amount: Number(financeAmount), description: financeDesc || undefined },
    });
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-400 mt-0.5">{data?.total ?? 0} total users</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
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
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["User", "Status / Flags", "KYC", "Role", "Joined", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {isLoading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>{Array(6).fill(0).map((__, j) => (
                    <td key={j} className="px-4 py-3.5"><div className="h-4 bg-gray-800 rounded animate-pulse w-24" /></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500 text-sm">No users found.</td></tr>
              ) : (
                filtered.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className={`hover:bg-gray-800/40 transition-colors cursor-pointer ${u.banned ? "bg-red-500/5" : ""}`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
                          {u.fullName?.charAt(0) || u.email.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-white">{u.fullName || "—"}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <UserStatusBadges user={u} />
                    </td>
                    <td className="px-4 py-3.5"><KycBadge status={u.kycStatus} /></td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        u.role === "admin" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" : "text-gray-400 bg-gray-500/10 border-gray-500/20"
                      }`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-400 text-xs">{format(new Date(u.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3.5">
                      <ChevronRight size={14} className="text-gray-600" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── User Management Sheet ─────────────────────────────────────────── */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => { if (!open) setSelectedUser(null); }}>
        <SheetContent className="w-full sm:max-w-lg bg-gray-950 border-gray-800 overflow-y-auto p-0">
          {selectedUser && (
            <>
              {/* Sheet Header */}
              <SheetHeader className="p-6 border-b border-gray-800 bg-gray-900">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gray-700 flex items-center justify-center text-lg font-bold text-white uppercase shrink-0">
                    {selectedUser.fullName?.charAt(0) || selectedUser.email.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-white text-lg font-bold leading-tight">
                      {selectedUser.fullName || "Unnamed User"}
                    </SheetTitle>
                    <p className="text-sm text-gray-400 mt-0.5">{selectedUser.email}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        selectedUser.role === "admin" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" : "text-gray-400 bg-gray-500/10 border-gray-500/20"
                      }`}>{selectedUser.role}</span>
                      <KycBadge status={selectedUser.kycStatus} />
                      {selectedUser.banned && <Badge label="Banned" cls="text-red-400 bg-red-500/10 border-red-500/20" />}
                      {selectedUser.hardFrozen && <Badge label="Hard Frozen" cls="text-blue-400 bg-blue-500/10 border-blue-500/20" />}
                      {selectedUser.transferRestricted && <Badge label="Transfer Restricted" cls="text-orange-400 bg-orange-500/10 border-orange-500/20" />}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="p-6 space-y-0">

                {/* ── User Info ── */}
                <SectionTitle>User Details</SectionTitle>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Phone</span><span className="text-white">{selectedUser.phone || "—"} {selectedUser.phoneVerified && <span className="text-green-400 text-xs ml-1">✓ Verified</span>}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">PIN Set</span><span className="text-white">{selectedUser.hasPin ? "Yes" : "No"}</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Security Token</span>
                    <span className={selectedUser.totpEnabled ? "text-green-400 text-xs font-semibold" : "text-yellow-400 text-xs"}>
                      {selectedUser.totpEnabled ? "✓ Authenticator Linked" : "Not Enabled"}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-400">Joined</span><span className="text-white">{format(new Date(selectedUser.createdAt), "MMM d, yyyy")}</span></div>
                  {selectedUser.bannedAt && <div className="flex justify-between"><span className="text-gray-400">Banned At</span><span className="text-red-400 text-xs">{format(new Date(selectedUser.bannedAt), "MMM d, yyyy HH:mm")}</span></div>}
                  {selectedUser.bannedReason && <div className="flex justify-between"><span className="text-gray-400">Ban Reason</span><span className="text-red-300 text-xs">{selectedUser.bannedReason}</span></div>}
                </div>

                <Divider />

                {/* ── KYC Management ── */}
                <SectionTitle>KYC Verification</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.kycStatus === "submitted" && (
                    <>
                      <Button size="sm" variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                        onClick={() => patchUser.mutate({ kycStatus: "approved" })}>
                        <CheckCircle size={14} className="mr-1.5" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={() => patchUser.mutate({ kycStatus: "rejected" })}>
                        <XCircle size={14} className="mr-1.5" /> Reject
                      </Button>
                    </>
                  )}
                  {selectedUser.kycStatus === "approved" && (
                    <Button size="sm" variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                      onClick={() => patchUser.mutate({ kycStatus: "none" })}>
                      <ShieldOff size={14} className="mr-1.5" /> Revoke KYC
                    </Button>
                  )}
                  {selectedUser.kycStatus === "rejected" && (
                    <Button size="sm" variant="outline" className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                      onClick={() => patchUser.mutate({ kycStatus: "submitted" })}>
                      <Clock size={14} className="mr-1.5" /> Reset to Pending
                    </Button>
                  )}
                  {selectedUser.kycStatus === "none" && <p className="text-xs text-gray-500">No KYC submission yet.</p>}
                </div>

                <Divider />

                {/* ── Access Control ── */}
                <SectionTitle>Access Control</SectionTitle>
                <div className="space-y-2.5">

                  {/* Transfer Restriction */}
                  <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <ArrowLeftRight size={16} className="text-orange-400" />
                      <div>
                        <p className="text-sm font-medium text-white">Transfer Restriction</p>
                        <p className="text-xs text-gray-500">Block outgoing transfers for this user</p>
                      </div>
                    </div>
                    <button
                      onClick={() => patchUser.mutate({ transferRestricted: !selectedUser.transferRestricted })}
                      disabled={patchUser.isPending}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${selectedUser.transferRestricted ? "bg-orange-500" : "bg-gray-700"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${selectedUser.transferRestricted ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>

                  {/* Hard Freeze */}
                  <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Snowflake size={16} className="text-blue-400" />
                      <div>
                        <p className="text-sm font-medium text-white">Hard Freeze</p>
                        <p className="text-xs text-gray-500">Freeze all accounts simultaneously</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={hardFreeze.isPending}
                      onClick={() => hardFreeze.mutate({ freeze: !selectedUser.hardFrozen })}
                      className={selectedUser.hardFrozen
                        ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                        : "border-gray-600 text-gray-300 hover:bg-gray-800"}
                    >
                      {selectedUser.hardFrozen ? <><Unlock size={13} className="mr-1" />Unfreeze All</> : <><Snowflake size={13} className="mr-1" />Freeze All</>}
                    </Button>
                  </div>

                  {/* Ban / Unban */}
                  <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Ban size={16} className="text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-white">Account Ban</p>
                        <p className="text-xs text-gray-500">Suspend all access, freeze all accounts</p>
                      </div>
                    </div>
                    {selectedUser.banned ? (
                      <Button size="sm" variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                        disabled={patchUser.isPending}
                        onClick={() => patchUser.mutate({ banned: false })}>
                        <CheckCircle size={13} className="mr-1" /> Unban
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={() => setBanDialog(true)}>
                        <Ban size={13} className="mr-1" /> Ban User
                      </Button>
                    )}
                  </div>
                </div>

                <Divider />

                {/* ── Finance ── */}
                <SectionTitle>Financial Actions</SectionTitle>
                {accountsLoading ? (
                  <div className="text-xs text-gray-500 animate-pulse">Loading accounts…</div>
                ) : !userAccounts?.length ? (
                  <p className="text-xs text-gray-500">This user has no bank accounts.</p>
                ) : (
                  <div className="space-y-2">
                    {userAccounts.map((acc) => (
                      <div key={acc.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-mono text-gray-300">
                            ····{acc.accountNumber.slice(-4)}
                            {acc.nickname && <span className="text-gray-500 ml-1.5 not-italic font-sans">({acc.nickname})</span>}
                          </p>
                          <p className="text-sm font-semibold text-white mt-0.5">{fmtMoney(acc.balance, acc.currency)}</p>
                          <div className="flex gap-1 mt-1">
                            <span className="text-[10px] text-gray-500 capitalize">{acc.currency} · {acc.accountType}</span>
                            {acc.status === "frozen" && <span className="text-[10px] text-blue-400">· Frozen</span>}
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { setSelectedAccountId(acc.id); setFinanceDialog("credit"); }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-green-400 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 transition-colors"
                          >
                            + Credit
                          </button>
                          <button
                            onClick={() => { setSelectedAccountId(acc.id); setFinanceDialog("debit"); }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                          >
                            − Debit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Divider />

                {/* ── Communications ── */}
                <SectionTitle>Communications & Auth</SectionTitle>
                <div className="space-y-2.5">

                  {/* Send SMS */}
                  <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <MessageSquare size={16} className="text-blue-400" />
                      <div>
                        <p className="text-sm font-medium text-white">Send SMS</p>
                        <p className="text-xs text-gray-500">{selectedUser.phone ?? "No phone on file"}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                      disabled={!selectedUser.phone}
                      onClick={() => setSmsDialog(true)}>
                      <MessageSquare size={13} className="mr-1" /> Send
                    </Button>
                  </div>

                  {/* Clerk Info */}
                  {clerkLoading ? (
                    <div className="text-xs text-gray-500 animate-pulse px-1">Loading auth info…</div>
                  ) : clerkInfo && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2"><Mail size={14} className="text-gray-400" /><span className="text-gray-400">Email Verified</span></div>
                        <span className={clerkInfo.emailVerified ? "text-green-400" : "text-red-400"}>
                          {clerkInfo.emailVerified ? "✓ Verified" : "✗ Unverified"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-gray-400" /><span className="text-gray-400">Two-Factor Auth</span></div>
                        <span className={clerkInfo.twoFactorEnabled ? "text-green-400" : "text-yellow-400"}>
                          {clerkInfo.twoFactorEnabled ? "✓ Enabled" : "Not Enabled"}
                        </span>
                      </div>
                      {clerkInfo.externalAccounts.length > 0 && (
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2"><UserIcon size={14} className="text-gray-400" /><span className="text-gray-400">Login Methods</span></div>
                          <span className="text-gray-200 text-xs capitalize">{clerkInfo.externalAccounts.join(", ") || "Email"}</span>
                        </div>
                      )}
                      {clerkInfo.lastSignInAt && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Last Sign-In</span>
                          <span className="text-gray-300 text-xs">{format(new Date(clerkInfo.lastSignInAt), "MMM d, yyyy HH:mm")}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pb-8" />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Ban Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={banDialog} onOpenChange={setBanDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-400" /> Ban User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-400">
              This will suspend <strong className="text-white">{selectedUser?.fullName}</strong>'s access and freeze all their accounts.
            </p>
            <div className="space-y-1.5">
              <Label className="text-gray-300">Reason <span className="text-gray-500">(optional)</span></Label>
              <Input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Policy violation, suspicious activity…"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-700 text-gray-300" onClick={() => setBanDialog(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleBanConfirm} disabled={patchUser.isPending}>
              <Ban size={14} className="mr-1.5" /> Confirm Ban
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Finance Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!financeDialog} onOpenChange={(open) => { if (!open) { setFinanceDialog(null); setFinanceAmount(""); setFinanceDesc(""); } }}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white capitalize flex items-center gap-2">
              <CreditCard size={18} className={financeDialog === "credit" ? "text-green-400" : "text-red-400"} />
              {financeDialog === "credit" ? "Credit Account" : "Debit Account"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-gray-300">Amount</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={financeAmount}
                onChange={(e) => setFinanceAmount(e.target.value)}
                placeholder="0.00"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300">Description <span className="text-gray-500">(optional)</span></Label>
              <Input
                value={financeDesc}
                onChange={(e) => setFinanceDesc(e.target.value)}
                placeholder={financeDialog === "credit" ? "Admin credit adjustment" : "Admin debit adjustment"}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-700 text-gray-300" onClick={() => setFinanceDialog(null)}>Cancel</Button>
            <Button
              disabled={!financeAmount || Number(financeAmount) <= 0 || creditDebit.isPending}
              onClick={handleFinanceSubmit}
              className={financeDialog === "credit" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
            >
              Confirm {financeDialog === "credit" ? "Credit" : "Debit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── SMS Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={smsDialog} onOpenChange={setSmsDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <MessageSquare size={18} className="text-blue-400" /> Send SMS to {selectedUser?.fullName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-gray-300">Message</Label>
            <Textarea
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              placeholder="Type your message…"
              rows={4}
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none"
            />
            <p className="text-xs text-gray-500 text-right">{smsMessage.length} characters</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-700 text-gray-300" onClick={() => setSmsDialog(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={smsMessage.trim().length < 5 || sendSms.isPending}
              onClick={() => sendSms.mutate()}>
              <MessageSquare size={14} className="mr-1.5" /> Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
