import { useState, useEffect } from "react";
import { useGetExchangeRates, useConvertCurrency, getGetExchangeRatesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownUp, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const MAJOR_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD"];

export function Exchange() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("EUR");
  const [amount, setAmount] = useState("");

  const { data: rates, isLoading: loadingRates, refetch: refetchRates } = useGetExchangeRates(
    { base: fromCurrency },
    { query: { queryKey: getGetExchangeRatesQueryKey({ base: fromCurrency }), refetchInterval: 30000 } }
  );

  const convertMutation = useConvertCurrency();

  // Find current rate
  const currentRate = rates?.entries.find(e => e.code === toCurrency)?.rate || 0;
  const previewAmount = amount ? (parseFloat(amount) * currentRate).toFixed(2) : "0.00";

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const handleExchange = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" });
      return;
    }

    convertMutation.mutate(
      {
        data: {
          fromCurrency,
          toCurrency,
          amount: parseFloat(amount),
          execute: true
        }
      },
      {
        onSuccess: (result) => {
          toast({ 
            title: "Exchange Successful", 
            description: `Exchanged ${result.fromAmount} ${result.fromCurrency} to ${result.toAmount} ${result.toCurrency}` 
          });
          setAmount("");
        },
        onError: (err: any) => {
          toast({ title: "Exchange Failed", description: err.message || "Something went wrong", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="px-6 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">Exchange</h1>
        <Button variant="ghost" size="icon" onClick={() => refetchRates()} className="text-muted-foreground hover:text-white">
          <RefreshCw size={20} className={loadingRates ? "animate-spin" : ""} />
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        {/* From */}
        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">You Send</Label>
          <div className="flex gap-2">
            <Select value={fromCurrency} onValueChange={setFromCurrency}>
              <SelectTrigger className="w-[110px] bg-background border-border h-14 rounded-xl font-semibold">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {MAJOR_CURRENCIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input 
              type="number" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              placeholder="0.00"
              className="flex-1 bg-background border-border h-14 rounded-xl text-right text-lg font-semibold"
            />
          </div>
        </div>

        {/* Swap Button & Rate */}
        <div className="relative py-2 flex justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            className="relative rounded-full h-10 w-10 bg-card border-border hover:bg-background"
            onClick={handleSwap}
          >
            <ArrowDownUp size={16} className="text-primary" />
          </Button>
        </div>

        {/* To */}
        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">You Receive</Label>
          <div className="flex gap-2">
            <Select value={toCurrency} onValueChange={setToCurrency}>
              <SelectTrigger className="w-[110px] bg-background border-border h-14 rounded-xl font-semibold">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                {MAJOR_CURRENCIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1 bg-background border-border h-14 rounded-xl flex items-center justify-end px-3 text-lg font-semibold text-white/80">
              {previewAmount}
            </div>
          </div>
        </div>
        
        {/* Rate Info */}
        <div className="pt-2 text-center text-sm text-muted-foreground">
          {loadingRates ? (
            <Skeleton className="h-4 w-32 mx-auto" />
          ) : (
            <p>1 {fromCurrency} = {currentRate.toFixed(4)} {toCurrency}</p>
          )}
        </div>
      </div>

      <Button 
        className="w-full h-14 rounded-xl mt-4 text-base font-semibold" 
        onClick={handleExchange}
        disabled={convertMutation.isPending || loadingRates || !amount}
      >
        {convertMutation.isPending ? "Executing..." : "Execute Exchange"}
      </Button>
    </div>
  );
}