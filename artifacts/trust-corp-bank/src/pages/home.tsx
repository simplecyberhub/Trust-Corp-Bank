import { useState } from "react";
import {
  useGetMe,
  useGetAccountSummary,
  useListAccounts,
  useGetRecentActivity,
  useListBeneficiaries,
  useCreateAccount,
} from "@workspace/api-client-react";
import {
  getGetMeQueryKey,
  getGetAccountSummaryQueryKey,
  getListAccountsQueryKey,
  getGetRecentActivityQueryKey,
  getListBeneficiariesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowUpRight, ArrowDownLeft, Plus, MoreHorizontal,
  ArrowRightLeft, RefreshCw, Send, Eye, EyeOff, Building2,
} from "lucide-react";
import { Link } from "wouter";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { format } from "date-fns";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning,";
  if (hour < 17) return "Good afternoon,";
  return "Good evening,";
}

function maskAccountNumber(num: string, reveal: boolean): string {
  if (reveal) {
    const n = num.replace(/\D/g, "");
    return n.length >= 10
      ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 10)}`
      : num;
  }
  return `•••• •••• ${num.slice(-4)}`;
}

export function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revealedAccounts, setRevealedAccounts] = useState<Set<number>>(new Set());

  const { data: user, isLoading: loadingUser } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: summary, isLoading: loadingSummary } = useGetAccountSummary({ query: { queryKey: getGetAccountSummaryQueryKey() } });
  const { data: accounts, isLoading: loadingAccounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const { data: beneficiaries, isLoading: loadingBeneficiaries } = useListBeneficiaries({ query: { queryKey: getListBeneficiariesQueryKey() } });

  const createAccount = useCreateAccount();

  const formatCurrency = (amount: number, currency: string = "USD") =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

  const toggleReveal = (id: number) => {
    setRevealedAccounts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreateDefaultAccount = () => {
    createAccount.mutate(
      { data: { accountType: "checking", currency: "USD", nickname: "Primary Checking" } },
      {
        onSuccess: () => {
          toast({ title: "Account created", description: "Your Primary Checking account is ready." });
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAccountSummaryQueryKey() });
        },
        onError: (err: any) => toast({ title: "Failed", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      },
    );
  };

  const getTxIcon = (type: string) => {
    switch (type) {
      case "credit":   return <ArrowDownLeft className="text-green-500" size={16} />;
      case "debit":    return <ArrowUpRight className="text-red-400" size={16} />;
      case "transfer": return <ArrowRightLeft className="text-primary" size={16} />;
      case "topup":    return <Plus className="text-blue-400" size={16} />;
      case "exchange": return <RefreshCw className="text-purple-400" size={16} />;
      default:         return <ArrowRightLeft className="text-muted-foreground" size={16} />;
    }
  };

  const getTxAmountColor = (type: string) => {
    if (type === "credit" || type === "topup") return "text-green-400";
    if (type === "debit" || type === "transfer") return "text-red-400";
    return "text-white";
  };

  const getTxPrefix = (type: string) => {
    if (type === "credit" || type === "topup") return "+";
    if (type === "debit" || type === "transfer") return "−";
    return "";
  };

  const accountTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      checking: "Checking Account",
      savings: "Savings Account",
      fiat: "Banking Account",
    };
    return map[type] ?? type.toUpperCase();
  };

  const hasNoAccounts = !loadingAccounts && (accounts?.length ?? 0) === 0;

  return (
    <div className="px-6 py-2 space-y-8">
      {/* Greeting */}
      <section>
        <h2 className="text-muted-foreground text-sm font-medium">{getGreeting()}</h2>
        {loadingUser ? (
          <Skeleton className="h-8 w-48 mt-1" />
        ) : (
          <h1 className="text-2xl font-bold text-white">{user?.fullName?.split(" ")[0] || "Welcome"}</h1>
        )}
      </section>

      {/* KYC Alert */}
      {!loadingUser && user?.kycStatus && user.kycStatus !== "approved" && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Identity Verification</p>
            <p className="text-xs text-orange-300/80 mt-0.5">Required to unlock all features.</p>
          </div>
          <Link href="/kyc" className="text-xs font-bold text-orange-400 px-3 py-1.5 bg-orange-500/20 rounded-lg whitespace-nowrap border border-orange-500/20 shrink-0">
            Verify Now
          </Link>
        </div>
      )}

      {/* Account Cards */}
      <section className="-mx-6 px-6">
        {loadingAccounts || loadingSummary ? (
          <Skeleton className="h-48 w-full rounded-2xl" />
        ) : hasNoAccounts ? (
          /* ── No accounts: onboarding CTA ── */
          <div className="bg-gradient-to-br from-primary/20 to-card rounded-2xl border border-primary/20 p-6 text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-primary/20">
              <Building2 size={26} className="text-primary" />
            </div>
            <h3 className="text-white font-bold text-lg">Open Your First Account</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4 leading-relaxed">
              You don't have any bank accounts yet. Create a free USD checking account to start banking.
            </p>
            <button
              onClick={handleCreateDefaultAccount}
              disabled={createAccount.isPending}
              className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {createAccount.isPending
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Opening Account…</>
                : <><Plus size={18} />Open Primary Checking Account</>}
            </button>
          </div>
        ) : (
          <Carousel className="w-full">
            <CarouselContent className="-ml-4">
              {/* Summary Card */}
              <CarouselItem className="pl-4 basis-11/12">
                <div className="bg-gradient-to-br from-primary to-blue-900 rounded-2xl p-6 text-white shadow-xl shadow-primary/20 relative overflow-hidden h-52 flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-12 -mt-12" />
                  <div className="absolute bottom-0 left-0 w-28 h-28 bg-black/20 rounded-full blur-xl -ml-8 -mb-8" />

                  <div className="relative z-10">
                    <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider">Total Balance</p>
                    <h2 className="text-4xl font-bold mt-1 tracking-tight">
                      {formatCurrency(summary?.totalBalanceUsd || 0)}
                    </h2>
                  </div>
                  <div className="relative z-10 flex justify-between items-end">
                    <div>
                      <p className="text-[11px] text-blue-200/80 uppercase tracking-wider">Accounts</p>
                      <p className="text-sm font-bold mt-0.5">{summary?.accountCount || 0} active</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold border border-white/10">
                      Trust Corp Bank
                    </div>
                  </div>
                </div>
              </CarouselItem>

              {/* Individual Account Cards */}
              {accounts?.map((acc) => {
                const revealed = revealedAccounts.has(acc.id);
                return (
                  <CarouselItem key={acc.id} className="pl-4 basis-11/12">
                    <div className="bg-card rounded-2xl p-5 text-white shadow-lg border border-border/60 relative overflow-hidden h-52 flex flex-col justify-between">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-8 -mt-8" />

                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                            {accountTypeLabel(acc.accountType)}
                          </p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border capitalize ${
                            acc.status === "active"
                              ? "text-green-400 bg-green-500/10 border-green-500/20"
                              : "text-red-400 bg-red-500/10 border-red-500/20"
                          }`}>
                            {acc.status}
                          </span>
                        </div>
                        <h2 className="text-3xl font-bold mt-1 tracking-tight text-white">
                          {formatCurrency(acc.balance, acc.currency)}
                        </h2>
                        {acc.nickname && (
                          <p className="text-xs text-primary/80 font-medium mt-0.5">{acc.nickname}</p>
                        )}
                      </div>

                      <div className="relative z-10 flex justify-between items-end">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Account Number</p>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-mono font-semibold text-white/90 tracking-widest">
                              {maskAccountNumber(acc.accountNumber, revealed)}
                            </p>
                            <button
                              onClick={() => toggleReveal(acc.id)}
                              className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                              aria-label={revealed ? "Hide account number" : "Show account number"}
                            >
                              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Currency</p>
                          <p className="text-sm font-bold text-white">{acc.currency}</p>
                        </div>
                      </div>
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
          </Carousel>
        )}
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-4 gap-4">
        {[
          { icon: Send, label: "Transfer", href: "/transfer" },
          { icon: RefreshCw, label: "Exchange", href: "/exchange" },
          { icon: MoreHorizontal, label: "More", href: "/profile" },
        ].map((action, i) => (
          <Link key={i} href={action.href} className="flex flex-col items-center gap-2 group">
            <div className="w-14 h-14 bg-card rounded-full flex items-center justify-center border border-border group-hover:bg-primary/10 group-hover:border-primary/30 transition-colors shadow-sm">
              <action.icon size={22} className="text-primary" />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground group-hover:text-white transition-colors">{action.label}</span>
          </Link>
        ))}
      </section>

      {/* Quick Transfer */}
      <section>
        <h3 className="font-bold text-white text-sm mb-3">Quick Transfer</h3>
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar -mx-6 px-6">
          <Link href="/transfer" className="flex flex-col items-center gap-2 shrink-0">
            <div className="w-14 h-14 rounded-full border border-dashed border-border/80 bg-card/50 flex items-center justify-center hover:border-primary/40 transition-colors">
              <Plus size={20} className="text-muted-foreground" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">New</span>
          </Link>

          {loadingBeneficiaries ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 shrink-0">
                <Skeleton className="w-14 h-14 rounded-full" />
                <Skeleton className="w-10 h-3" />
              </div>
            ))
          ) : beneficiaries && beneficiaries.length > 0 ? (
            beneficiaries.map((ben) => (
              <Link key={ben.id} href={`/transfer?beneficiary=${ben.id}`} className="flex flex-col items-center gap-2 shrink-0 group">
                <div className="w-14 h-14 rounded-full bg-card border border-border flex items-center justify-center text-lg font-bold text-primary group-hover:bg-primary/10 group-hover:border-primary/30 transition-colors">
                  {ben.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-muted-foreground truncate w-16 text-center">{ben.name.split(" ")[0]}</span>
              </Link>
            ))
          ) : (
            <div className="flex items-center">
              <p className="text-xs text-muted-foreground/60 italic">No saved recipients yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* Recent Activity */}
      <section className="pb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-white text-sm">Recent Activity</h3>
          <Link href="/activity" className="text-xs text-primary font-semibold hover:text-primary/80 transition-colors">View All</Link>
        </div>

        <div className="space-y-2.5">
          {loadingActivity ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3.5 bg-card rounded-xl border border-border">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div>
                    <Skeleton className="w-28 h-4 mb-1.5" />
                    <Skeleton className="w-16 h-3" />
                  </div>
                </div>
                <Skeleton className="w-16 h-4" />
              </div>
            ))
          ) : !activity || activity.length === 0 ? (
            <div className="text-center py-8 bg-card rounded-xl border border-border">
              <RefreshCw size={22} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No recent activity.</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Your transactions will appear here.</p>
            </div>
          ) : (
            activity.slice(0, 5).map((tx) => (
              <Link
                key={tx.id}
                href="/activity"
                className="flex items-center justify-between p-3.5 bg-card rounded-xl border border-border/60 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center border border-border shrink-0">
                    {getTxIcon(tx.type)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white line-clamp-1">{tx.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(tx.createdAt), "MMM d, h:mm a")}</p>
                  </div>
                </div>
                <p className={`text-sm font-bold shrink-0 ml-3 ${getTxAmountColor(tx.type)}`}>
                  {getTxPrefix(tx.type)}{formatCurrency(Math.abs(tx.amount), tx.currency)}
                </p>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
