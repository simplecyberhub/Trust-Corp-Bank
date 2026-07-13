import { useState, useEffect } from "react";
import {
  useListAccounts, useSendMoney, useTopUpAccount,
  useListBeneficiaries, useCreateBeneficiary, useDeleteBeneficiary, useCreateAccount,
  getListAccountsQueryKey, getListBeneficiariesQueryKey, getGetRecentActivityQueryKey,
  useGetMe, getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { Send, Plus, Trash2, ArrowDownToLine, X, Building2, Lock, Delete, ShieldAlert, KeyRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "send";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "NGN", "ZAR", "AED"];

/* ─── PIN Keypad ─────────────────────────────────────────────────────────────── */
function PinKeypad({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  const append = (k: string) => {
    if (k === "⌫") { onChange(value.slice(0, -1)); return; }
    if (k === "" || value.length >= 4 || disabled) return;
    onChange(value + k);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${
              value.length > i ? "border-primary bg-primary/20" : "border-border bg-card"
            }`}
          >
            {value.length > i ? <div className="w-3 h-3 rounded-full bg-primary" /> : null}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
        {keys.map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={() => append(k)}
            disabled={disabled || k === ""}
            className={`h-14 rounded-2xl text-xl font-semibold transition-all active:scale-95 select-none ${
              k === ""
                ? "invisible"
                : k === "⌫"
                ? "text-muted-foreground bg-card border border-border hover:bg-white/5"
                : "text-white bg-card border border-border hover:bg-white/5 hover:border-primary/40"
            } ${disabled ? "opacity-50" : ""}`}
          >
            {k === "⌫" ? <Delete size={18} className="mx-auto" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── PIN Confirmation Dialog ────────────────────────────────────────────── */
function PinConfirmDialog({
  onConfirm,
  onClose,
  onSkip,
}: {
  onConfirm: () => void;
  onClose: () => void;
  onSkip?: () => void;
}) {
  const { toast } = useToast();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (pin.length !== 4 || loading) return;
    const t = setTimeout(() => { verifyAndConfirm(); }, 200);
    return () => clearTimeout(t);
  }, [pin]);

  async function verifyAndConfirm() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/users/me/pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Incorrect PIN.");
        setPin("");
        return;
      }
      onConfirm();
    } catch {
      setError("Network error. Please try again.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Lock size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Confirm Transfer</h2>
              <p className="text-xs text-muted-foreground">Enter your 4-digit transaction PIN</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-xs text-destructive font-medium text-center flex items-center gap-2 justify-center">
            <ShieldAlert size={14} />
            {error}
          </div>
        )}

        <PinKeypad value={pin} onChange={(v) => { setPin(v); setError(""); }} disabled={loading} />

        {loading && (
          <div className="flex justify-center">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {onSkip && (
          <button type="button" onClick={onSkip} className="w-full text-xs text-muted-foreground hover:text-white text-center py-1 transition-colors">
            Skip PIN (not recommended)
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Transfer Page ────────────────────────────────────────────────────────────── */
export function Transfer() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const initialTab: Tab = new URLSearchParams(search).get("type") === "topup" ? "topup" : "send";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const [sendFrom, setSendFrom] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendDescription, setSendDescription] = useState("");
  const [sendRecipientAccount, setSendRecipientAccount] = useState("");
  const [sendRecipientName, setSendRecipientName] = useState("");
  // Bank detail fields
  const [transferType, setTransferType] = useState<"domestic" | "international">("domestic");
  const [bankName, setBankName] = useState("");
  const [bankCountry, setBankCountry] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [swiftCode, setSwiftCode] = useState("");
  const [iban, setIban] = useState("");
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<number | null>(null);

  const [topupAccount, setTopupAccount] = useState("");
  const [topupAmount, setTopupAmount] = useState("");
  const [topupCurrency, setTopupCurrency] = useState("USD");

  const [addBenefOpen, setAddBenefOpen] = useState(false);
  const [newBenefName, setNewBenefName] = useState("");
  const [newBenefAccount, setNewBenefAccount] = useState("");
  const [newBenefBank, setNewBenefBank] = useState("");
  const [newBenefCurrency, setNewBenefCurrency] = useState("USD");

  // PIN dialog state
  const [pinDialogAction, setPinDialogAction] = useState<"send" | "topup" | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const { data: accounts, isLoading: loadingAccounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const { data: beneficiaries, isLoading: loadingBeneficiaries } = useListBeneficiaries({ query: { queryKey: getListBeneficiariesQueryKey() } });
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const sendMoney = useSendMoney();
  const topUp = useTopUpAccount();
  const createBenef = useCreateBeneficiary();
  const deleteBenef = useDeleteBeneficiary();

  const activeAccounts = accounts?.filter((a) => a.status === "active") ?? [];
  const hasPin = me?.hasPin ?? false;

  useEffect(() => {
    if (activeAccounts.length === 1) {
      if (!sendFrom) setSendFrom(String(activeAccounts[0].id));
      if (!topupAccount) setTopupAccount(String(activeAccounts[0].id));
    }
  }, [activeAccounts.length]);

  const handlePickBeneficiary = (ben: { id: number; name: string; accountNumber: string; bankName?: string }) => {
    setSelectedBeneficiary(ben.id);
    setSendRecipientName(ben.name);
    setSendRecipientAccount(ben.accountNumber);
    if (ben.bankName) setBankName(ben.bankName);
  };
  const clearBeneficiary = () => {
    setSelectedBeneficiary(null);
    setSendRecipientName(""); setSendRecipientAccount("");
    setBankName(""); setBankCountry(""); setRoutingNumber(""); setSwiftCode(""); setIban("");
  };

  const selectedAccount = activeAccounts.find((a) => a.id === parseInt(sendFrom));

  const currencySymbol = (() => {
    if (!selectedAccount) return "$";
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: selectedAccount.currency })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? selectedAccount.currency;
    } catch {
      return selectedAccount.currency;
    }
  })();

  function executeSend() {
    sendMoney.mutate(
      {
        data: {
          fromAccountId: parseInt(sendFrom),
          amount: parseFloat(sendAmount),
          currency: selectedAccount?.currency ?? "USD",
          description: sendDescription || "Transfer",
          recipientAccount: transferType === "international" && iban ? iban : sendRecipientAccount,
          recipientName: sendRecipientName,
          // Extra bank fields (pass-through — backend reads from raw body)
          ...(bankName && { bankName }),
          ...(bankCountry && { bankCountry }),
          ...(transferType && { transferType }),
          ...(routingNumber && { routingNumber }),
          ...(swiftCode && { swiftCode }),
          ...(iban && { iban }),
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Transfer sent", description: `${selectedAccount?.currency} ${parseFloat(sendAmount).toFixed(2)} sent to ${sendRecipientName}.` });
          setSendAmount(""); setSendDescription(""); clearBeneficiary();
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        },
        onError: (err: any) => toast({ title: "Transfer failed", description: err?.data?.error ?? err?.message ?? "An error occurred.", variant: "destructive" }),
      },
    );
  }

/* function executeTopUp() {
    topUp.mutate(
      { data: { accountId: parseInt(topupAccount), amount: parseFloat(topupAmount), currency: topupCurrency } },
      {
        onSuccess: () => {
          toast({ title: "Account topped up", description: `${topupCurrency} ${parseFloat(topupAmount).toFixed(2)} added successfully.` });
          setTopupAmount("");
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        },
        onError: (err: any) => toast({ title: "Top up failed", description: err?.data?.error ?? err?.message ?? "An error occurred.", variant: "destructive" }),
      },
    );
  } */

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendFrom) { toast({ title: "Select an account", description: "Choose an active account to send from.", variant: "destructive" }); return; }
    if (!sendAmount || parseFloat(sendAmount) <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (!sendRecipientName) { toast({ title: "Recipient name required", description: "Enter the recipient's full legal name.", variant: "destructive" }); return; }
    if (!bankName) { toast({ title: "Bank name required", description: "Enter the recipient's bank name.", variant: "destructive" }); return; }
    if (transferType === "domestic") {
      if (!sendRecipientAccount) { toast({ title: "Account number required", variant: "destructive" }); return; }
      if (!routingNumber) { toast({ title: "Routing number required", description: "Enter the 9-digit ABA routing number.", variant: "destructive" }); return; }
      if (!/^\d{9}$/.test(routingNumber)) { toast({ title: "Invalid routing number", description: "Must be exactly 9 digits.", variant: "destructive" }); return; }
    } else {
      if (!swiftCode) { toast({ title: "SWIFT/BIC code required", description: "Required for international wire transfers.", variant: "destructive" }); return; }
      if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swiftCode)) { toast({ title: "Invalid SWIFT/BIC", description: "Must be 8 or 11 alphanumeric characters.", variant: "destructive" }); return; }
      if (!iban && !sendRecipientAccount) { toast({ title: "Account/IBAN required", description: "Enter the recipient's IBAN or account number.", variant: "destructive" }); return; }
      if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban)) { toast({ title: "Invalid IBAN", description: "IBAN must start with a 2-letter country code followed by digits.", variant: "destructive" }); return; }
      if (!bankCountry) { toast({ title: "Bank country required", variant: "destructive" }); return; }
    }
    if (selectedAccount && parseFloat(sendAmount) > selectedAccount.balance) {
      toast({ title: "Insufficient funds", description: `Balance: ${selectedAccount.currency} ${selectedAccount.balance.toFixed(2)}`, variant: "destructive" });
      return;
    }
    if (hasPin) {
      setPinDialogAction("send");
      setPendingAction(() => executeSend);
    } else {
      executeSend();
    }
  };

  const handleTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topupAccount) { toast({ title: "Select an account", variant: "destructive" }); return; }
    if (!topupAmount || parseFloat(topupAmount) <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    // Top-up doesn't require PIN (it's adding funds, not sending)
    executeTopUp();
  };

  const handleAddBeneficiary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBenefName || !newBenefAccount || !newBenefBank) { toast({ title: "All fields are required", variant: "destructive" }); return; }
    createBenef.mutate(
      { data: { name: newBenefName, accountNumber: newBenefAccount, bankName: newBenefBank, currency: newBenefCurrency } },
      {
        onSuccess: () => {
          toast({ title: "Beneficiary saved" });
          setNewBenefName(""); setNewBenefAccount(""); setNewBenefBank(""); setAddBenefOpen(false);
          queryClient.invalidateQueries({ queryKey: getListBeneficiariesQueryKey() });
        },
        onError: (err: any) => toast({ title: "Failed to save", description: err?.message, variant: "destructive" }),
      },
    );
  };

  const createAccount = useCreateAccount();

  const handleCreateAccount = () => {
    createAccount.mutate(
      { data: { accountType: "checking", currency: "USD", nickname: "Primary Checking" } },
      {
        onSuccess: () => {
          toast({ title: "Account created", description: "Your Primary Checking account is ready." });
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        },
        onError: (err: any) => toast({ title: "Failed to create account", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      },
    );
  };

  const NoAccountBanner = () => (
    <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-3">
      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto border border-primary/20">
        <Building2 size={22} className="text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">No active accounts</p>
        <p className="text-xs text-muted-foreground mt-0.5">You need a bank account to send or receive money.</p>
      </div>
      <button
        type="button"
        onClick={handleCreateAccount}
        disabled={createAccount.isPending}
        className="w-full bg-primary text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
      >
        {createAccount.isPending
          ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Opening…</>
          : <><Plus size={15} />Open Primary Checking Account</>}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col pb-8">
      {/* PIN Confirmation Dialog */}
      {pinDialogAction && pendingAction && (
        <PinConfirmDialog
          onClose={() => { setPinDialogAction(null); setPendingAction(null); }}
          onConfirm={() => {
            setPinDialogAction(null);
            const action = pendingAction;
            setPendingAction(null);
            action();
          }}
        />
      )}

      {/* Tab Bar */}
      <div className="flex border-b border-border bg-card/50">
        {(["send", "topup"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            data-testid={`tab-${tab}`}
            className={`flex-1 py-3.5 text-sm font-semibold transition-colors relative ${activeTab === tab ? "text-white" : "text-muted-foreground hover:text-white/70"}`}
          >
            {tab === "send" ? "Send Money" : "Top Up"}
            {activeTab === tab && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      <div className="px-4 sm:px-6 pt-5">
        {/* ─── SEND TAB ─── */}
        {activeTab === "send" && (
          <div className="space-y-5">
            {/* PIN status hint */}
            {me && !hasPin && (
              <button
                type="button"
                onClick={() => setLocation("/profile")}
                className="w-full flex items-center gap-3 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-left"
              >
                <KeyRound size={16} className="text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-300">No Transaction PIN set</p>
                  <p className="text-[11px] text-amber-400/70 mt-0.5">Tap to set a PIN for enhanced transfer security.</p>
                </div>
                <span className="text-xs text-amber-400 font-medium shrink-0">Set PIN →</span>
              </button>
            )}

            {/* Quick Beneficiaries */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Transfer</p>
                <Dialog open={addBenefOpen} onOpenChange={setAddBenefOpen}>
                  <DialogTrigger asChild>
                    <button data-testid="button-add-beneficiary" className="flex items-center gap-1 text-xs text-primary font-medium">
                      <Plus size={14} /> Add Recipient
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border w-[92vw] max-w-md rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-white text-lg">Add Beneficiary</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddBeneficiary} className="space-y-4 pt-1">
                      {[
                        { label: "Full Name", value: newBenefName, setter: setNewBenefName, placeholder: "John Doe", id: "input-benef-name" },
                        { label: "Bank Name", value: newBenefBank, setter: setNewBenefBank, placeholder: "Chase Bank", id: "input-benef-bank" },
                        { label: "Account Number", value: newBenefAccount, setter: setNewBenefAccount, placeholder: "0000000000", id: "input-benef-account" },
                      ].map(({ label, value, setter, placeholder, id }) => (
                        <div key={id} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</Label>
                          <Input value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder} className="bg-background h-11 rounded-xl" data-testid={id} />
                        </div>
                      ))}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Currency</Label>
                        <Select value={newBenefCurrency} onValueChange={setNewBenefCurrency}>
                          <SelectTrigger className="bg-background h-11 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" className="w-full h-11 rounded-xl font-semibold" disabled={createBenef.isPending} data-testid="button-save-beneficiary">
                        {createBenef.isPending ? "Saving..." : "Save Beneficiary"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {loadingBeneficiaries
                  ? [1, 2, 3].map((i) => (
                      <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
                        <Skeleton className="w-12 h-12 rounded-full" />
                        <Skeleton className="w-10 h-2.5" />
                      </div>
                    ))
                  : beneficiaries?.length === 0
                  ? <p className="text-xs text-muted-foreground py-2 italic">No saved recipients yet.</p>
                  : beneficiaries?.map((ben) => (
                      <button
                        key={ben.id}
                        data-testid={`beneficiary-chip-${ben.id}`}
                        onClick={() => selectedBeneficiary === ben.id ? clearBeneficiary() : handlePickBeneficiary(ben)}
                        className="flex flex-col items-center gap-1.5 shrink-0 group"
                      >
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-bold border-2 transition-colors ${selectedBeneficiary === ben.id ? "bg-primary text-white border-primary" : "bg-primary/10 text-primary border-primary/30 hover:border-primary/60"}`}>
                          {ben.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground truncate w-14 text-center">{ben.name.split(" ")[0]}</span>
                      </button>
                    ))}
              </div>
            </div>

            <form onSubmit={handleSend} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From Account</Label>
                {loadingAccounts ? (
                  <Skeleton className="h-14 w-full rounded-xl" />
                ) : activeAccounts.length === 0 ? (
                  <NoAccountBanner />
                ) : (
                  <>
                    <Select value={sendFrom} onValueChange={setSendFrom}>
                      <SelectTrigger className="w-full bg-card border-border h-14 rounded-xl" data-testid="select-source-account">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeAccounts.map((acc) => (
                          <SelectItem key={acc.id} value={String(acc.id)}>
                            {acc.nickname || acc.accountType} &nbsp;·&nbsp; {acc.currency} {acc.balance.toFixed(2)} &nbsp;(····{acc.accountNumber.slice(-4)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedAccount && (
                      <p className="text-xs text-muted-foreground pl-1">
                        Available: <span className="text-white font-medium">{selectedAccount.currency} {selectedAccount.balance.toFixed(2)}</span>
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Transfer type toggle */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transfer Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["domestic", "international"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTransferType(t)}
                      className={`py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                        transferType === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {t === "domestic" ? "🏦 Domestic" : "🌍 International"}
                    </button>
                  ))}
                </div>
              </div>

              {selectedBeneficiary ? (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                      {sendRecipientName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{sendRecipientName}</p>
                      <p className="text-xs text-muted-foreground">{bankName || "Saved recipient"}</p>
                    </div>
                  </div>
                  <button type="button" onClick={clearBeneficiary} className="text-muted-foreground hover:text-white p-1" data-testid="button-clear-beneficiary"><X size={16} /></button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Recipient Name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipient Full Name</Label>
                    <Input value={sendRecipientName} onChange={(e) => setSendRecipientName(e.target.value)} placeholder="Full legal name as on bank account" className="bg-card border-border h-12 rounded-xl" />
                  </div>

                  {/* Bank Name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bank Name</Label>
                    <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Chase Bank, Wells Fargo, Barclays" className="bg-card border-border h-12 rounded-xl" />
                  </div>

                  {transferType === "domestic" ? (
                    <>
                      {/* Account Number */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Number</Label>
                        <Input value={sendRecipientAccount} onChange={(e) => setSendRecipientAccount(e.target.value)} placeholder="Recipient account number" className="bg-card border-border h-12 rounded-xl" />
                      </div>
                      {/* Routing Number */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Routing Number <span className="text-muted-foreground normal-case font-normal">(ABA)</span></Label>
                        <Input value={routingNumber} onChange={(e) => setRoutingNumber(e.target.value)} placeholder="9-digit routing number" maxLength={9} className="bg-card border-border h-12 rounded-xl" />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* SWIFT/BIC */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SWIFT / BIC Code</Label>
                        <Input value={swiftCode} onChange={(e) => setSwiftCode(e.target.value.toUpperCase())} placeholder="e.g. CHASUS33, BARCGB22" maxLength={11} className="bg-card border-border h-12 rounded-xl" />
                      </div>
                      {/* IBAN */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">IBAN <span className="text-muted-foreground normal-case font-normal">(or account number)</span></Label>
                        <Input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="e.g. GB29NWBK60161331926819" className="bg-card border-border h-12 rounded-xl font-mono text-sm" />
                        {!iban && (
                          <Input value={sendRecipientAccount} onChange={(e) => setSendRecipientAccount(e.target.value)} placeholder="Or enter account number" className="bg-card border-border h-12 rounded-xl" />
                        )}
                      </div>
                      {/* Bank Country */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bank Country</Label>
                        <Input value={bankCountry} onChange={(e) => setBankCountry(e.target.value)} placeholder="e.g. United Kingdom, Germany, Nigeria" className="bg-card border-border h-12 rounded-xl" />
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</Label>
                  {selectedAccount && (
                    <button
                      type="button"
                      onClick={() => setSendAmount(String(selectedAccount.balance))}
                      className="text-xs text-primary font-medium px-2 py-0.5 bg-primary/10 rounded-full hover:bg-primary/20 transition-colors"
                    >
                      Max
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground pointer-events-none">
                    {currencySymbol}
                  </span>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="0.00"
                    className={`bg-card border-border h-16 rounded-xl pl-10 text-3xl font-bold ${selectedAccount && parseFloat(sendAmount) > selectedAccount.balance ? "border-destructive" : ""}`}
                    data-testid="input-send-amount"
                  />
                </div>
                {selectedAccount && parseFloat(sendAmount) > selectedAccount.balance && (
                  <p className="text-xs text-destructive pl-1">Amount exceeds available balance</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Note (optional)</Label>
                <Input value={sendDescription} onChange={(e) => setSendDescription(e.target.value)} placeholder="What's this for?" className="bg-card border-border h-12 rounded-xl" data-testid="input-send-description" />
              </div>

              <Button
                type="submit"
                className="w-full h-14 rounded-xl mt-2 text-base font-semibold"
                disabled={sendMoney.isPending || activeAccounts.length === 0}
                data-testid="button-send-money"
              >
                {sendMoney.isPending
                  ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</span>
                  : <span className="flex items-center gap-2">
                      {hasPin ? <Lock size={16} /> : <Send size={18} />}
                      {hasPin ? "Confirm with PIN" : "Send Money"}
                    </span>}
              </Button>
            </form>

            {beneficiaries && beneficiaries.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Saved Recipients</p>
                <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                  {beneficiaries.map((ben) => (
                    <div key={ben.id} className="flex items-center justify-between px-4 py-3.5" data-testid={`beneficiary-row-${ben.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                          {ben.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{ben.name}</p>
                          <p className="text-xs text-muted-foreground">{ben.bankName} · {ben.currency}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => { handlePickBeneficiary(ben); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs text-primary font-medium px-2.5 py-1 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
                          Select
                        </button>
                        <button type="button" onClick={() => deleteBenef.mutate({ beneficiaryId: ben.id }, { onSuccess: () => { toast({ title: "Beneficiary removed" }); queryClient.invalidateQueries({ queryKey: getListBeneficiariesQueryKey() }); } })} className="p-1 text-muted-foreground hover:text-white transition-colors" data-testid={`button-delete-beneficiary-${ben.id}`}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TOP UP TAB (HIDDEN) ─── */}
        {/* This section is disabled and hidden from the UI */}
        {false && activeTab === "topup" && (
          <form onSubmit={handleTopUp} className="space-y-5">
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-start gap-3">
              <ArrowDownToLine size={20} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">Add Funds to Account</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Deposit funds from an external source into one of your accounts.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Destination Account</Label>
              {loadingAccounts ? (
                <Skeleton className="h-14 w-full rounded-xl" />
              ) : activeAccounts.length === 0 ? (
                <NoAccountBanner />
              ) : (
                <Select value={topupAccount} onValueChange={setTopupAccount}>
                  <SelectTrigger className="w-full bg-card border-border h-14 rounded-xl" data-testid="select-topup-account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.nickname || acc.accountType} &nbsp;·&nbsp; {acc.currency} {acc.balance.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Currency</Label>
              <Select value={topupCurrency} onValueChange={setTopupCurrency}>
                <SelectTrigger className="w-full bg-card border-border h-12 rounded-xl" data-testid="select-topup-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground pointer-events-none">$</span>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-card border-border h-16 rounded-xl pl-10 text-3xl font-bold"
                  data-testid="input-topup-amount"
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-14 rounded-xl mt-2 text-base font-semibold" disabled={topUp.isPending || activeAccounts.length === 0} data-testid="button-topup">
              {topUp.isPending
                ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</span>
                : <span className="flex items-center gap-2"><ArrowDownToLine size={18} />Top Up Account</span>}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
