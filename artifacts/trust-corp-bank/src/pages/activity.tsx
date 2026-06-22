import { useState } from "react";
import { useListTransactions, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Plus, RefreshCw } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";

type TxFilter = "all" | "credit" | "debit" | "transfer" | "exchange" | "topup";

const FILTERS: { key: TxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "credit", label: "Credit" },
  { key: "debit", label: "Debit" },
  { key: "transfer", label: "Transfer" },
  { key: "topup", label: "Top Up" },
  { key: "exchange", label: "Exchange" },
];

function groupByDate(items: Array<{ createdAt: string; [key: string]: any }>) {
  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    const date = parseISO(item.createdAt);
    const key = isToday(date) ? "Today" : isYesterday(date) ? "Yesterday" : format(date, "MMMM d, yyyy");
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

export function Activity() {
  const [filter, setFilter] = useState<TxFilter>("all");

  const { data: transactionList, isLoading } = useListTransactions(
    { type: filter === "all" ? undefined : filter, limit: 50 },
    { query: { queryKey: getListTransactionsQueryKey({ type: filter === "all" ? undefined : filter, limit: 50 }) } },
  );

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);

  const getIcon = (type: string) => {
    switch (type) {
      case "credit":   return <ArrowDownLeft size={18} className="text-green-500" />;
      case "debit":    return <ArrowUpRight size={18} className="text-red-400" />;
      case "transfer": return <ArrowRightLeft size={18} className="text-primary" />;
      case "topup":    return <Plus size={18} className="text-blue-400" />;
      case "exchange": return <RefreshCw size={18} className="text-purple-400" />;
      default:         return <ArrowRightLeft size={18} className="text-muted-foreground" />;
    }
  };

  const getAmountColor = (type: string) => {
    if (type === "credit" || type === "topup") return "text-green-400";
    if (type === "debit" || type === "transfer") return "text-red-400";
    return "text-white";
  };

  const getPrefix = (type: string) => {
    if (type === "credit" || type === "topup") return "+";
    if (type === "debit" || type === "transfer") return "−";
    return "";
  };

  const getStatusBadge = (status: string) => {
    if (status === "completed") return null;
    const colors: Record<string, string> = { pending: "text-yellow-400 bg-yellow-500/10", failed: "text-red-400 bg-red-500/10" };
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "text-muted-foreground bg-card"}`}>{status}</span>;
  };

  const items = transactionList?.items ?? [];
  const grouped = groupByDate(items);
  const dateKeys = Object.keys(grouped);

  return (
    <div className="px-4 sm:px-6 py-4 pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">Activity</h1>
        {!isLoading && <span className="text-xs text-muted-foreground">{transactionList?.total ?? 0} transactions</span>}
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            data-testid={`filter-${key}`}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              filter === key ? "bg-primary text-white shadow-sm shadow-primary/30" : "bg-card border border-border text-muted-foreground hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-5">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border gap-4">
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="w-11 h-11 rounded-full shrink-0" />
                <div className="flex-1"><Skeleton className="w-32 h-4 mb-2" /><Skeleton className="w-24 h-3" /></div>
              </div>
              <div className="flex flex-col items-end gap-1"><Skeleton className="w-20 h-4" /><Skeleton className="w-12 h-3" /></div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-card rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border">
              <RefreshCw size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-white font-medium">No transactions</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === "all" ? "Make your first transfer or top up your account." : `No ${filter} transactions yet.`}
            </p>
          </div>
        ) : (
          dateKeys.map((dateKey) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{dateKey}</p>
              <div className="space-y-2">
                {grouped[dateKey].map((tx) => (
                  <div key={tx.id} data-testid={`tx-row-${tx.id}`} className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border hover:bg-card/80 transition-colors cursor-default">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-background flex items-center justify-center border border-border shrink-0">
                        {getIcon(tx.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{tx.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">{format(parseISO(tx.createdAt), "h:mm a")}</p>
                          {tx.recipientName && <span className="text-xs text-muted-foreground/60">· {tx.recipientName}</span>}
                          {getStatusBadge(tx.status)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-3">
                      <p className={`text-sm font-bold ${getAmountColor(tx.type)}`}>
                        {getPrefix(tx.type)}{formatCurrency(Math.abs(tx.amount), tx.currency)}
                      </p>
                      {tx.balanceAfter != null && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                          Bal: {formatCurrency(tx.balanceAfter, tx.currency)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
