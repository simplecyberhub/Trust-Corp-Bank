import { useState, useEffect } from "react";
import {
  useListAccounts, useSendMoney, useTopUpAccount,
  useListBeneficiaries, useCreateBeneficiary, useDeleteBeneficiary,
  getListAccountsQueryKey, getListBeneficiariesQueryKey, getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { Send, Plus, Trash2, ArrowDownToLine, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "send" | "topup";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "NGN", "ZAR", "AED"];

export function Transfer() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  // Read ?type=topup from URL (set by home page quick action)
  const initialTab: Tab = new URLSearchParams(search).get("type") === "topup" ? "topup" : "send";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const [sendFrom, setSendFrom] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendDescription, setSendDescription] = useState("");
  const [sendRecipientAccount, setSendRecipientAccount] = useState("");
  const [sendRecipientName, setSendRecipientName] = useState("");
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<number | null>(null);

  const [topupAccount, setTopupAccount] = useState("");
  const [topupAmount, setTopupAmount] = useState("");
  const [topupCurrency, setTopupCurrency] = useState("USD");

  const [addBenefOpen, setAddBenefOpen] = useState(false);
  const [newBenefName, setNewBenefName] = useState("");
  const [newBenefAccount, setNewBenefAccount] = useState("");
  const [newBenefBank, setNewBenefBank] = useState("");
  const [newBenefCurrency, setNewBenefCurrency] = useState("USD");

  const { data: accounts, isLoading: loadingAccounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const { data: beneficiaries, isLoading: loadingBeneficiaries } = useListBeneficiaries({ query: { queryKey: getListBeneficiariesQueryKey() } });

  const sendMoney = useSendMoney();
  const topUp = useTopUpAccount();
  const createBenef = useCreateBeneficiary();
  const deleteBenef = useDeleteBeneficiary();

  const activeAccounts = accounts?.filter((a) => a.status === "active") ?? [];

  useEffect(() => {
    if (activeAccounts.length === 1) {
      if (!sendFrom) setSendFrom(String(activeAccounts[0].id));
      if (!topupAccount) setTopupAccount(String(activeAccounts[0].id));
    }
  }, [activeAccounts.length]);

  const handlePickBeneficiary = (ben: { id: number; name: string; accountNumber: string }) => {
    setSelectedBeneficiary(ben.id);
    setSendRecipientName(ben.name);
    setSendRecipientAccount(ben.accountNumber);
  };
  const clearBeneficiary = () => { setSelectedBeneficiary(null); setSendRecipientName(""); setSendRecipientAccount(""); };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendFrom) { toast({ title: "Select an account", description: "Choose an active account to send from.", variant: "destructive" }); return; }
    if (!sendAmount || parseFloat(sendAmount) <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (!sendRecipientAccount || !sendRecipientName) { toast({ title: "Recipient required", description: "Enter the recipient's name and account number.", variant: "destructive" }); return; }
    const account = activeAccounts.find((a) => a.id === parseInt(sendFrom));
    if (account && parseFloat(sendAmount) > account.balance) { toast({ title: "Insufficient funds", description: `Balance: ${account.currency} ${account.balance.toFixed(2)}`, variant: "destructive" }); return; }
    sendMoney.mutate(
      { data: { fromAccountId: parseInt(sendFrom), amount: parseFloat(sendAmount), currency: account?.currency ?? "USD", description: sendDescription || "Transfer", recipientAccount: sendRecipientAccount, recipientName: sendRecipientName } },
      {
        onSuccess: () => {
          toast({ title: "Transfer sent", description: `${account?.currency} ${parseFloat(sendAmount).toFixed(2)} sent to ${sendRecipientName}.` });
          setSendAmount(""); setSendDescription(""); clearBeneficiary();
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        },
        onError: (err: any) => toast({ title: "Transfer failed", description: err?.data?.error ?? err?.message ?? "An error occurred.", variant: "destructive" }),
      },
    );
  };

  const handleTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topupAccount) { toast({ title: "Select an account", variant: "destructive" }); return; }
    if (!topupAmount || parseFloat(topupAmount) <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
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

  const selectedAccount = activeAccounts.find((a) => a.id === parseInt(sendFrom));

  const NoAccountBanner = () => (
    <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-sm text-orange-300">
      No active accounts available.{" "}
      <button type="button" onClick={() => setLocation("/home")} className="underline text-orange-400 font-medium">
        Create one first.
      </button>
    </div>
  );

  return (
    <div className="flex flex-col pb-8">
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
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-bold border-2 transition-colors ${selectedBeneficiary === ben.id ? "bg-primary text-white border-primary" : "bg-card text-primary border-border hover:border-primary/50"}`}>
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
                      <p className="text-xs text-muted-foreground pl-1">Balance: <span className="text-white font-medium">{selectedAccount.currency} {selectedAccount.balance.toFixed(2)}</span></p>
                    )}
                  </>
                )}
              </div>

              {selectedBeneficiary ? (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                      {sendRecipientName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{sendRecipientName}</p>
                      <p className="text-xs text-muted-foreground font-mono">····{sendRecipientAccount.slice(-4)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={clearBeneficiary} className="text-muted-foreground hover:text-white p-1" data-testid="button-clear-beneficiary"><X size={16} /></button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipient Name</Label>
                    <Input value={sendRecipientName} onChange={(e) => setSendRecipientName(e.target.value)} placeholder="Full legal name" className="bg-card border-border h-12 rounded-xl" data-testid="input-recipient-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Number</Label>
                    <Input value={sendRecipientAccount} onChange={(e) => setSendRecipientAccount(e.target.value)} placeholder="Enter account number" className="bg-card border-border h-12 rounded-xl font-mono tracking-wider" data-testid="input-recipient-account" />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground pointer-events-none">$</span>
                  <Input type="number" min="0.01" step="0.01" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="0.00" className="bg-card border-border h-16 rounded-xl pl-10 text-3xl font-bold" data-testid="input-send-amount" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Note (optional)</Label>
                <Input value={sendDescription} onChange={(e) => setSendDescription(e.target.value)} placeholder="What's this for?" className="bg-card border-border h-12 rounded-xl" data-testid="input-send-note" />
              </div>

              <Button type="submit" className="w-full h-14 rounded-xl mt-2 text-base font-semibold" disabled={sendMoney.isPending || activeAccounts.length === 0} data-testid="button-send-money">
                {sendMoney.isPending
                  ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</span>
                  : <span className="flex items-center gap-2"><Send size={18} />Send Money</span>}
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
                        <button type="button" onClick={() => { handlePickBeneficiary(ben); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs text-primary font-medium px-2.5 py-1 bg-primary/10 rounded-full hover:bg-primary/20 transition-colors">
                          Select
                        </button>
                        <button type="button" onClick={() => deleteBenef.mutate({ beneficiaryId: ben.id }, { onSuccess: () => { toast({ title: "Beneficiary removed" }); queryClient.invalidateQueries({ queryKey: getListBeneficiariesQueryKey() }); } })} className="text-muted-foreground hover:text-destructive transition-colors p-1" data-testid={`delete-beneficiary-${ben.id}`}>
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

        {/* ─── TOP UP TAB ─── */}
        {activeTab === "topup" && (
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

            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Currency</Label>
                <Select value={topupCurrency} onValueChange={setTopupCurrency}>
                  <SelectTrigger className="bg-card border-border h-12 rounded-xl font-semibold"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</Label>
                <Input type="number" min="1" step="0.01" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} placeholder="0.00" className="bg-card border-border h-12 rounded-xl text-lg font-bold text-right" data-testid="input-topup-amount" />
              </div>
            </div>

            {topupAmount && parseFloat(topupAmount) > 0 && (
              <div className="bg-card border border-border rounded-xl p-3.5 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">You will receive</span>
                <span className="text-lg font-bold text-white">{topupCurrency} {parseFloat(topupAmount).toFixed(2)}</span>
              </div>
            )}

            <Button type="submit" className="w-full h-14 rounded-xl text-base font-semibold" disabled={topUp.isPending || activeAccounts.length === 0} data-testid="button-topup">
              {topUp.isPending
                ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</span>
                : <span className="flex items-center gap-2"><ArrowDownToLine size={18} />Confirm Top Up</span>}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
