import { useState } from "react";
import { useListTransactions, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Plus, RefreshCw, X, Copy, Check } from "lucide-react";
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

type Transaction = {
  id: number;
  accountId: number;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  reference?: string | null;
  recipientName?: string | null;
  recipientAccount?: string | null;
  senderName?: string | null;
  balanceAfter?: number | null;
  createdAt: string;
  updatedAt?: string;
};

function groupByDate(items: Transaction[]) {
  const groups: Record<string, Transaction[]> = {};
  for (const item of items) {
    const date = parseISO(item.createdAt);
    const key = isToday(date) ? "Today" : isYesterday(date) ? "Yesterday" : format(date, "MMMM d, yyyy");
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function TypeLabel({ type }: { type: string }) {
  const map: Record<string, string> = {
    credit: "Credit",
    debit: "Debit",
    transfer: "Transfer",
    topup: "Top Up",
    exchange: "Exchange",
  };
  return <>{map[type] ?? type}</>;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="ml-2 text-muted-foreground hover:text-white transition-colors shrink-0" aria-label="Copy">
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );
}

function DetailRow({ label, value, mono = false, copyable = false }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
      <div className="flex items-center min-w-0 justify-end">
        <span className={`text-sm text-white text-right break-all ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</span>
        {copyable && <CopyButton value={value} />}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "text-green-400 bg-green-500/10 border-green-500/20",
    pending:   "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    failed:    "text-red-400 bg-red-500/10 border-red-500/20",
    reversed:  "text-orange-400 bg-orange-500/10 border-orange-500/20",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${map[status] ?? "text-muted-foreground bg-card border-border"}`}>
      {status}
    </span>
  );
}

function TransactionDetailSheet({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

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

  const getIcon = (type: string) => {
    switch (type) {
      case "credit":   return <ArrowDownLeft size={22} className="text-green-500" />;
      case "debit":    return <ArrowUpRight size={22} className="text-red-400" />;
      case "transfer": return <ArrowRightLeft size={22} className="text-primary" />;
      case "topup":    return <Plus size={22} className="text-blue-400" />;
      case "exchange": return <RefreshCw size={22} className="text-purple-400" />;
      default:         return <ArrowRightLeft size={22} className="text-muted-foreground" />;
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-card border border-border rounded-t-3xl shadow-2xl overflow-hidden">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-border rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-2 pb-4">
            <h2 className="text-base font-semibold text-white">Transaction Details</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-background text-muted-foreground hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Amount hero */}
          <div className="flex flex-col items-center gap-2 pb-6 px-5">
            <div className="w-14 h-14 rounded-full bg-background border border-border flex items-center justify-center mb-1">
              {getIcon(tx.type)}
            </div>
            <p className={`text-3xl font-bold tracking-tight ${getAmountColor(tx.type)}`}>
              {getPrefix(tx.type)}{formatCurrency(Math.abs(tx.amount), tx.currency)}
            </p>
            <div className="flex items-center gap-2">
              <StatusPill status={tx.status} />
              <span className="text-xs text-muted-foreground capitalize"><TypeLabel type={tx.type} /></span>
            </div>
          </div>

          {/* Details */}
          <div className="px-5 pb-6 pb-safe">
            <div className="bg-background rounded-2xl px-4 border border-border">
              <DetailRow label="Description" value={tx.description} />
              {tx.reference && <DetailRow label="Reference" value={tx.reference} mono copyable />}
              {tx.recipientName && <DetailRow label="Recipient" value={tx.recipientName} />}
              {tx.recipientAccount && <DetailRow label="Recipient Acct" value={tx.recipientAccount} mono copyable />}
              {tx.senderName && <DetailRow label="Sender" value={tx.senderName} />}
              <DetailRow label="Account ID" value={`#${tx.accountId}`} />
              {tx.balanceAfter != null && (
                <DetailRow label="Balance After" value={formatCurrency(tx.balanceAfter, tx.currency)} />
              )}
              <DetailRow label="Date" value={format(parseISO(tx.createdAt), "MMM d, yyyy")} />
              <DetailRow label="Time" value={format(parseISO(tx.createdAt), "h:mm:ss a")} />
              <DetailRow label="Transaction ID" value={`#${tx.id}`} mono copyable />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function Activity() {
  const [filter, setFilter] = useState<TxFilter>("all");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

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

  const items: Transaction[] = transactionList?.items ?? [];
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
                  <button
                    key={tx.id}
                    data-testid={`tx-row-${tx.id}`}
                    onClick={() => setSelectedTx(tx)}
                    className="w-full flex items-center justify-between p-4 bg-card rounded-2xl border border-border hover:bg-card/70 active:scale-[0.99] transition-all cursor-pointer text-left"
                  >
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
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Transaction detail sheet */}
      {selectedTx && (
        <TransactionDetailSheet tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}
    </div>
  );
}
