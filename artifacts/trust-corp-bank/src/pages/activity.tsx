import { useState } from "react";
import { useListTransactions, getListTransactionsQueryKey, type ListTransactionsType } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Plus, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export function Activity() {
  const [filter, setFilter] = useState<ListTransactionsType | "all">("all");
  
  const { data: transactionList, isLoading } = useListTransactions(
    { type: filter === "all" ? undefined : filter },
    { query: { queryKey: getListTransactionsQueryKey({ type: filter === "all" ? undefined : filter }) } }
  );

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "credit": return <ArrowDownLeft className="text-green-500" size={20} />;
      case "debit": return <ArrowUpRight className="text-white" size={20} />;
      case "transfer": return <ArrowRightLeft className="text-primary" size={20} />;
      case "topup": return <Plus className="text-blue-400" size={20} />;
      case "exchange": return <RefreshCw className="text-purple-400" size={20} />;
      default: return <ArrowRightLeft className="text-white" size={20} />;
    }
  };

  const getColor = (type: string, amount: number) => {
    if (type === "credit" || type === "topup") return "text-green-500";
    if (type === "debit") return "text-white";
    return amount > 0 ? "text-green-500" : "text-white";
  };

  const getPrefix = (type: string, amount: number) => {
    if (type === "credit" || type === "topup") return "+";
    if (type === "debit") return "-";
    return amount > 0 ? "+" : "";
  };

  return (
    <div className="px-6 py-4 space-y-6">
      <h1 className="text-2xl font-bold text-white tracking-tight">Activity</h1>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {["all", "credit", "debit", "transfer", "exchange", "topup"].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t as any)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === t 
                ? "bg-primary text-white" 
                : "bg-card border border-border text-muted-foreground hover:text-white"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <div className="space-y-4">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
              <div className="flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div>
                  <Skeleton className="w-24 h-4 mb-1.5" />
                  <Skeleton className="w-16 h-3" />
                </div>
              </div>
              <div className="flex flex-col items-end">
                <Skeleton className="w-20 h-4 mb-1.5" />
                <Skeleton className="w-12 h-3" />
              </div>
            </div>
          ))
        ) : transactionList?.items?.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
              <RefreshCw size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-white font-medium">No transactions found</h3>
            <p className="text-sm text-muted-foreground mt-1">Try changing your filters.</p>
          </div>
        ) : (
          transactionList?.items?.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center border border-border">
                  {getIcon(tx.type)}
                </div>
                <div>
                  <p className="text-sm font-medium text-white line-clamp-1">{tx.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(tx.createdAt), 'MMM d, h:mm a')}</p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <p className={`text-sm font-semibold ${getColor(tx.type, tx.amount)}`}>
                  {getPrefix(tx.type, tx.amount)}{formatCurrency(Math.abs(tx.amount), tx.currency)}
                </p>
                {tx.status !== 'completed' && (
                  <span className="text-[10px] uppercase tracking-wider text-orange-400 font-medium mt-0.5">
                    {tx.status}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}