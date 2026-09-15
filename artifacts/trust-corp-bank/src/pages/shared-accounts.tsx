import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useListAccountMembers,
  useInviteAccountMember,
  useUpdateAccountMember,
  useRemoveAccountMember,
  getListAccountsQueryKey,
  getListAccountMembersQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, Check, Crown, MailPlus, Shield, Trash2, UserPlus, Users, WalletCards } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

function errorMessage(error: unknown): string {
  const value = error as { data?: { error?: string }; message?: string };
  return value?.data?.error ?? value?.message ?? "Please try again.";
}

export function SharedAccounts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: accounts, isLoading: loadingAccounts } = useListAccounts({
    query: { queryKey: getListAccountsQueryKey() },
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedAccount = accounts?.find((account) => account.id === selectedId) ?? accounts?.[0];
  const accountId = selectedAccount?.id ?? 0;
  const { data: members, isLoading: loadingMembers } = useListAccountMembers(accountId, {
    query: { queryKey: getListAccountMembersQueryKey(accountId), enabled: accountId > 0 },
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "viewer">("manager");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListAccountMembersQueryKey(accountId) });
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
  };

  const invite = useInviteAccountMember({
    mutation: {
      onSuccess: () => {
        toast({ title: "Invitation added", description: "The collaborator can sign in with this email to join the account." });
        setEmail("");
        refresh();
      },
      onError: (error) => toast({ title: "Invitation failed", description: errorMessage(error), variant: "destructive" }),
    },
  });
  const update = useUpdateAccountMember({
    mutation: {
      onSuccess: () => { toast({ title: "Role updated" }); refresh(); },
      onError: (error) => toast({ title: "Update failed", description: errorMessage(error), variant: "destructive" }),
    },
  });
  const remove = useRemoveAccountMember({
    mutation: {
      onSuccess: () => { toast({ title: "Collaborator removed" }); refresh(); },
      onError: (error) => toast({ title: "Remove failed", description: errorMessage(error), variant: "destructive" }),
    },
  });

  const canManage = selectedAccount?.permissions.canManage ?? false;

  return (
    <div className="px-4 sm:px-6 py-4 pb-8 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/home" className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-white">
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Shared access</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Collaborate securely on your bank accounts.</p>
        </div>
      </div>

      {loadingAccounts ? (
        <div className="h-28 rounded-2xl bg-card border border-border animate-pulse" />
      ) : !accounts?.length ? (
        <div className="rounded-2xl bg-card border border-border p-6 text-center">
          <WalletCards className="mx-auto text-muted-foreground mb-3" size={28} />
          <p className="text-sm font-semibold text-white">Open an account first</p>
          <p className="text-xs text-muted-foreground mt-1">Once you have an account, you can invite trusted collaborators.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Choose an account</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => setSelectedId(account.id)}
                  className={`min-w-[170px] text-left rounded-2xl p-3 border transition-colors ${
                    account.id === accountId ? "bg-primary/15 border-primary/50" : "bg-card border-border hover:border-primary/30"
                  }`}
                >
                  <p className="text-xs text-muted-foreground capitalize">{account.accountType} · {account.currency}</p>
                  <p className="text-lg text-white font-bold mt-1">{new Intl.NumberFormat("en-US", { style: "currency", currency: account.currency }).format(account.balance)}</p>
                  <p className="text-[11px] text-primary mt-1 capitalize">{account.accessRole} access · {account.memberCount} people</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border/70 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Users size={19} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">People with access</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Balances and activity are shared with active members.</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">
                {selectedAccount?.accessRole} role
              </span>
            </div>

            <div className="p-4 space-y-3">
              {loadingMembers ? (
                <div className="h-16 rounded-xl bg-background animate-pulse" />
              ) : members?.map((member) => (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border/60">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    member.role === "owner" ? "bg-amber-500/15 text-amber-400" : "bg-primary/10 text-primary"
                  }`}>
                    {member.role === "owner" ? <Crown size={16} /> : <Shield size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{member.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={member.role}
                      disabled={!canManage || member.role === "owner" || update.isPending}
                      onChange={(event) => update.mutate({ accountId, memberId: member.id, data: { role: event.target.value as "manager" | "viewer" } })}
                      className="bg-card border border-border rounded-lg text-[11px] text-white px-2 py-1.5 disabled:opacity-70"
                    >
                      <option value="owner">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    {canManage && member.role !== "owner" && (
                      <button
                        onClick={() => remove.mutate({ accountId, memberId: member.id })}
                        disabled={remove.isPending}
                        aria-label={`Remove ${member.email}`}
                        className="w-8 h-8 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {canManage ? (
            <div className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <UserPlus size={19} className="text-green-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Invite a collaborator</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Use the email they use for their verified bank login.</p>
                </div>
              </div>
              <div className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="collaborator@example.com"
                  className="w-full bg-background border border-border rounded-xl px-3 py-3 text-sm text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setRole("manager")} className={`rounded-xl border px-3 py-2.5 text-left ${role === "manager" ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
                    <p className="text-xs font-semibold text-white">Manager</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">View and transact</p>
                  </button>
                  <button onClick={() => setRole("viewer")} className={`rounded-xl border px-3 py-2.5 text-left ${role === "viewer" ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
                    <p className="text-xs font-semibold text-white">Viewer</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">View only</p>
                  </button>
                </div>
                <button
                  onClick={() => invite.mutate({ accountId, data: { email: email.trim(), role } })}
                  disabled={!email.trim() || invite.isPending}
                  className="w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <MailPlus size={16} />
                  {invite.isPending ? "Adding…" : "Add collaborator"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card/60 p-4">
              <div className="flex items-start gap-3">
                <Check size={17} className="text-green-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-white">Your access is protected</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {selectedAccount?.permissions.canTransact
                      ? "You can view balances, execute transfers, request deposits, exchange currencies, and manage cards."
                      : "You can view balances and activity. A manager or owner can grant transaction access."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}