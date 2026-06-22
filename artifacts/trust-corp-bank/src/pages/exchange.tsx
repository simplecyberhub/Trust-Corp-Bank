import { useState, useEffect, useRef } from "react";
import {
  useGetExchangeRates, useConvertCurrency, useListAccounts,
  getGetExchangeRatesQueryKey, getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownUp, RefreshCw, TrendingUp, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const MAJOR_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "INR", "SGD", "AED", "NGN", "ZAR"];

export function Exchange() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("EUR");
  const [amount, setAmount] = useState("");
  const [useAccounts, setUseAccounts] = useState(false);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const lastFetchRef = useRef<number>(Date.now());

  const { data: rates, isLoading: loadingRates, refetch, dataUpdatedAt } = useGetExchangeRates(
    { base: fromCurrency },
    { query: { queryKey: getGetExchangeRatesQueryKey({ base: fromCurrency }), refetchInterval: 30_000 } },
  );

  const { data: accounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const convertMutation = useConvertCurrency();

  const activeAccounts = accounts?.filter((a) => a.status === "active") ?? [];

  const currentRate = rates?.entries?.find((e: { code: string; rate: number }) => e.code === toCurrency)?.rate ?? 0;
  const fee = amount ? parseFloat(amount) * 0.005 : 0;
  const previewAmount = amount && currentRate ? ((parseFloat(amount) - fee) * currentRate).toFixed(4) : "";

  const handleSwap = () => { setFromCurrency(toCurrency); setToCurrency(fromCurrency); };

  const handleExchange = () => {
    if (!amount || parseFloat(amount) <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    if (useAccounts && (!fromAccountId || !toAccountId)) { toast({ title: "Select both accounts", variant: "destructive" }); return; }
    if (useAccounts && fromAccountId === toAccountId) { toast({ title: "Source and destination must differ", variant: "destructive" }); return; }

    convertMutation.mutate(
      {
        data: {
          fromCurrency,
          toCurrency,
          amount: parseFloat(amount),
          execute: useAccounts,
          fromAccountId: useAccounts ? parseInt(fromAccountId) : undefined,
          toAccountId: useAccounts ? parseInt(toAccountId) : undefined,
        },
      },
      {
        onSuccess: (result) => {
          toast({
            title: "Exchange successful",
            description: `${parseFloat(amount).toFixed(2)} ${result.fromCurrency} → ${Number(result.toAmount).toFixed(4)} ${result.toCurrency}`,
          });
          setAmount("");
          if (useAccounts) queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        },
        onError: (err: any) => toast({ title: "Exchange failed", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      },
    );
  };

  // Auto-select first active account for from/to
  useEffect(() => {
    if (activeAccounts.length >= 1 && !fromAccountId) setFromAccountId(String(activeAccounts[0].id));
    if (activeAccounts.length >= 2 && !toAccountId) setToAccountId(String(activeAccounts[1].id));
  }, [activeAccounts.length]);

  return (
    <div className="px-4 sm:px-6 py-4 pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">Exchange</h1>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-xl hover:bg-card text-muted-foreground hover:text-white transition-colors"
          data-testid="button-refresh-rates"
          title="Refresh rates"
        >
          <RefreshCw size={18} className={loadingRates ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Rate freshness indicator */}
      {dataUpdatedAt > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
          <TrendingUp size={12} className="text-green-400/70" />
          Rates updated {format(new Date(dataUpdatedAt), "h:mm:ss a")} · Auto-refreshes every 30s
        </div>
      )}

      {/* Exchange Card */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        {/* From */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">You Send</Label>
          <div className="flex gap-2">
            <Select value={fromCurrency} onValueChange={setFromCurrency}>
              <SelectTrigger className="w-[100px] bg-background border-border h-14 rounded-xl font-bold" data-testid="select-from-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAJOR_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0.01"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-background border-border h-14 rounded-xl text-right text-xl font-bold"
              data-testid="input-exchange-amount"
            />
          </div>
        </div>

        {/* Swap */}
        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-border" />
          <button
            type="button"
            onClick={handleSwap}
            className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
            data-testid="button-swap-currencies"
          >
            <ArrowDownUp size={16} />
          </button>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* To */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">You Receive</Label>
          <div className="flex gap-2">
            <Select value={toCurrency} onValueChange={setToCurrency}>
              <SelectTrigger className="w-[100px] bg-background border-border h-14 rounded-xl font-bold" data-testid="select-to-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAJOR_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex-1 bg-background border border-border h-14 rounded-xl flex items-center justify-end px-4 text-xl font-bold text-white/80 tabular-nums">
              {loadingRates ? <span className="text-sm text-muted-foreground animate-pulse">Loading…</span> : previewAmount || "0.00"}
            </div>
          </div>
        </div>

        {/* Rate */}
        <div className="bg-background rounded-xl p-3 flex items-center justify-between gap-2">
          {loadingRates ? (
            <Skeleton className="h-4 w-48" />
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                1 {fromCurrency} = <span className="text-white font-semibold">{currentRate.toFixed(6)}</span> {toCurrency}
              </span>
              {amount && parseFloat(amount) > 0 && (
                <span className="text-xs text-muted-foreground">
                  Fee: <span className="text-white">{fee.toFixed(4)} {fromCurrency}</span>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Execute with accounts toggle */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setUseAccounts(!useAccounts)}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors"
          data-testid="button-toggle-account-exchange"
        >
          <div className="flex items-center gap-3">
            <Info size={16} className="text-primary" />
            <span className="text-sm font-medium text-white">Execute between my accounts</span>
          </div>
          <div className={`w-10 h-5.5 rounded-full transition-colors ${useAccounts ? "bg-primary" : "bg-muted"} relative`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useAccounts ? "translate-x-5" : "translate-x-0.5"}`} />
          </div>
        </button>

        {useAccounts && (
          <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Funds will be moved between your actual account balances.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">From Account</Label>
                <Select value={fromAccountId} onValueChange={setFromAccountId}>
                  <SelectTrigger className="bg-background h-11 rounded-xl text-xs" data-testid="select-exchange-from-account">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.nickname || acc.currency} ({acc.balance.toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">To Account</Label>
                <Select value={toAccountId} onValueChange={setToAccountId}>
                  <SelectTrigger className="bg-background h-11 rounded-xl text-xs" data-testid="select-exchange-to-account">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.nickname || acc.currency} ({acc.balance.toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>

      <Button
        className="w-full h-14 rounded-xl text-base font-semibold"
        onClick={handleExchange}
        disabled={convertMutation.isPending || loadingRates || !amount || parseFloat(amount) <= 0}
        data-testid="button-execute-exchange"
      >
        {convertMutation.isPending
          ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Executing…</span>
          : `${useAccounts ? "Execute" : "Preview"} Exchange`}
      </Button>

      {/* Rates Table */}
      {rates?.entries && rates.entries.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Live Rates (base: {fromCurrency})</p>
          <div className="bg-card rounded-2xl border border-border overflow-hidden divide-y divide-border/50">
            {MAJOR_CURRENCIES.filter((c) => c !== fromCurrency).map((code) => {
              const rate = rates.entries.find((e: { code: string; rate: number }) => e.code === code)?.rate;
              return rate ? (
                <div key={code} className="flex items-center justify-between px-4 py-3" data-testid={`rate-row-${code}`}>
                  <span className="text-sm font-semibold text-white">{code}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{rate.toFixed(4)}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
