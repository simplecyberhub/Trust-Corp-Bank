import { 
  useGetMe, 
  useGetAccountSummary, 
  useListAccounts, 
  useGetRecentActivity,
  useListBeneficiaries
} from "@workspace/api-client-react";
import { 
  getGetMeQueryKey, 
  getGetAccountSummaryQueryKey, 
  getListAccountsQueryKey,
  getGetRecentActivityQueryKey,
  getListBeneficiariesQueryKey
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownLeft, Plus, MoreHorizontal, ArrowRightLeft, RefreshCw, Send } from "lucide-react";
import { Link } from "wouter";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { format } from "date-fns";

export function Home() {
  const { data: user, isLoading: loadingUser } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: summary, isLoading: loadingSummary } = useGetAccountSummary({ query: { queryKey: getGetAccountSummaryQueryKey() } });
  const { data: accounts, isLoading: loadingAccounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const { data: beneficiaries, isLoading: loadingBeneficiaries } = useListBeneficiaries({ query: { queryKey: getListBeneficiariesQueryKey() } });

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  const getTxIcon = (type: string) => {
    switch (type) {
      case "credit": return <ArrowDownLeft className="text-green-500" size={16} />;
      case "debit": return <ArrowUpRight className="text-white" size={16} />;
      case "transfer": return <ArrowRightLeft className="text-primary" size={16} />;
      case "topup": return <Plus className="text-blue-400" size={16} />;
      case "exchange": return <RefreshCw className="text-purple-400" size={16} />;
      default: return <ArrowRightLeft className="text-white" size={16} />;
    }
  };

  return (
    <div className="px-6 py-2 space-y-8">
      {/* Greeting */}
      <section>
        <h2 className="text-muted-foreground text-sm">Good morning,</h2>
        {loadingUser ? (
          <Skeleton className="h-8 w-48 mt-1" />
        ) : (
          <h1 className="text-2xl font-bold text-white">{user?.fullName?.split(" ")[0] || "User"}</h1>
        )}
      </section>

      {/* KYC Alert */}
      {user?.kycStatus && user.kycStatus !== 'approved' && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Identity Verification</p>
            <p className="text-xs text-orange-200/70 mt-0.5">Required to unlock all features.</p>
          </div>
          <Link href="/kyc" className="text-xs font-semibold text-orange-500 px-3 py-1.5 bg-orange-500/20 rounded-lg whitespace-nowrap">
            Verify Now
          </Link>
        </div>
      )}

      {/* Account Cards */}
      <section className="-mx-6 px-6">
        {loadingAccounts || loadingSummary ? (
          <Skeleton className="h-48 w-full rounded-2xl" />
        ) : (
          <Carousel className="w-full">
            <CarouselContent className="-ml-4">
              {/* Summary Card */}
              <CarouselItem className="pl-4 basis-11/12">
                <div className="bg-gradient-to-br from-primary to-blue-900 rounded-2xl p-6 text-white shadow-xl shadow-primary/20 relative overflow-hidden h-48 flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/20 rounded-full blur-xl -ml-8 -mb-8" />
                  
                  <div className="relative z-10">
                    <p className="text-blue-200 text-sm font-medium">Total Balance</p>
                    <h2 className="text-4xl font-bold mt-1 tracking-tight">
                      {formatCurrency(summary?.totalBalanceUsd || 0)}
                    </h2>
                  </div>
                  <div className="relative z-10 flex justify-between items-end">
                    <div>
                      <p className="text-xs text-blue-200">Total Accounts</p>
                      <p className="text-sm font-medium tracking-wide mt-0.5">
                        {summary?.accountCount || 0}
                      </p>
                    </div>
                    <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium border border-white/10">
                      Summary
                    </div>
                  </div>
                </div>
              </CarouselItem>

              {/* Individual Account Cards */}
              {accounts?.map((acc) => (
                <CarouselItem key={acc.id} className="pl-4 basis-11/12">
                  <div className="bg-card rounded-2xl p-6 text-white shadow-lg border border-border relative overflow-hidden h-48 flex flex-col justify-between">
                    <div className="relative z-10">
                      <p className="text-muted-foreground text-sm font-medium">{acc.nickname || acc.accountType.toUpperCase()}</p>
                      <h2 className="text-3xl font-bold mt-1 tracking-tight text-white">
                        {formatCurrency(acc.balance, acc.currency)}
                      </h2>
                    </div>
                    <div className="relative z-10 flex justify-between items-end">
                      <div>
                        <p className="text-xs text-muted-foreground">Account Number</p>
                        <p className="text-sm font-medium tracking-widest mt-0.5 text-white/90">
                          •••• {acc.accountNumber.slice(-4)}
                        </p>
                      </div>
                      <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium border border-primary/20 capitalize">
                        {acc.status}
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        )}
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-4 gap-4">
        {[
          { icon: Plus, label: "Top Up", href: "/transfer?type=topup" },
          { icon: ArrowUpRight, label: "Transfer", href: "/transfer" },
          { icon: RefreshCw, label: "Exchange", href: "/exchange" },
          { icon: MoreHorizontal, label: "More", href: "/profile" },
        ].map((action, i) => (
          <Link key={i} href={action.href} className="flex flex-col items-center gap-2 group">
            <div className="w-14 h-14 bg-card rounded-full flex items-center justify-center border border-border group-hover:bg-card/80 transition-colors shadow-sm">
              <action.icon size={22} className="text-primary" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">{action.label}</span>
          </Link>
        ))}
      </section>

      {/* Quick Transfer */}
      <section>
        <h3 className="font-semibold text-white mb-4">Quick Transfer</h3>
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar -mx-6 px-6">
          <Link href="/transfer" className="flex flex-col items-center gap-2 shrink-0">
            <div className="w-14 h-14 rounded-full border border-dashed border-border bg-card/50 flex items-center justify-center">
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
          ) : (
            beneficiaries?.map((ben) => (
              <Link key={ben.id} href={`/transfer?beneficiary=${ben.id}`} className="flex flex-col items-center gap-2 shrink-0 group">
                <div className="w-14 h-14 rounded-full bg-card border border-border flex items-center justify-center text-lg font-bold text-primary group-hover:bg-primary/10 transition-colors">
                  {ben.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-muted-foreground truncate w-16 text-center">{ben.name.split(' ')[0]}</span>
              </Link>
            ))
          )}
        </div>
      </section>

      {/* Recent Activity */}
      <section className="pb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Recent Activity</h3>
          <Link href="/activity" className="text-sm text-primary font-medium">View All</Link>
        </div>
        
        <div className="space-y-3">
          {loadingActivity ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div>
                    <Skeleton className="w-24 h-4 mb-1" />
                    <Skeleton className="w-16 h-3" />
                  </div>
                </div>
                <Skeleton className="w-16 h-4" />
              </div>
            ))
          ) : activity?.length === 0 ? (
            <div className="text-center py-6 bg-card rounded-xl border border-border">
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            </div>
          ) : (
            activity?.slice(0, 5).map((tx) => (
              <Link key={tx.id} href={`/activity`} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center border border-border">
                    {getTxIcon(tx.type)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white line-clamp-1">{tx.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(tx.createdAt), 'MMM d')}</p>
                  </div>
                </div>
                <p className={`text-sm font-semibold ${tx.amount > 0 ? "text-green-500" : "text-white"}`}>
                  {tx.amount > 0 ? "+" : ""}{formatCurrency(Math.abs(tx.amount), tx.currency)}
                </p>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}