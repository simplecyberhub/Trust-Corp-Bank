import { useState } from "react";
import { useListCards, useCreateCard, useUpdateCard, useListAccounts, getListCardsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, CreditCard as CardIcon, Shield, Snowflake, CheckCircle2 } from "lucide-react";
import { getListAccountsQueryKey } from "@workspace/api-client-react";

export function Cards() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [issueOpen, setIssueOpen] = useState(false);
  const [newCardAccountId, setNewCardAccountId] = useState("");
  const [newCardType, setNewCardType] = useState<"virtual" | "physical">("virtual");
  const [newCardNetwork, setNewCardNetwork] = useState<"visa" | "mastercard">("visa");

  const { data: cards, isLoading } = useListCards({ query: { queryKey: getListCardsQueryKey() } });
  const { data: accounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const updateCard = useUpdateCard();
  const createCard = useCreateCard();

  const activeAccounts = accounts?.filter((a) => a.status === "active") ?? [];

  const handleToggleFreeze = (cardId: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "frozen" : "active";
    updateCard.mutate(
      { cardId, data: { status: newStatus as "active" | "frozen" } },
      {
        onSuccess: () => {
          toast({ title: newStatus === "frozen" ? "Card frozen" : "Card unfrozen", description: `Card is now ${newStatus}.` });
          queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      },
    );
  };

  const handleIssueCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardAccountId) { toast({ title: "Select an account", variant: "destructive" }); return; }
    createCard.mutate(
      { data: { accountId: parseInt(newCardAccountId), cardType: newCardType, network: newCardNetwork } },
      {
        onSuccess: () => {
          toast({ title: "Card issued", description: `Your new ${newCardType} ${newCardNetwork} card is ready.` });
          setIssueOpen(false); setNewCardAccountId(""); setNewCardType("virtual"); setNewCardNetwork("visa");
          queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
        },
        onError: (err: any) => toast({ title: "Failed to issue card", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      },
    );
  };

  const cardGradient = (network: string | undefined, frozen: boolean) => {
    if (frozen) return "from-neutral-700 to-neutral-800";
    return network === "mastercard" ? "from-orange-500 to-red-700" : "from-blue-600 to-indigo-800";
  };

  return (
    <div className="px-4 sm:px-6 py-4 pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">Cards</h1>
        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9 rounded-full px-4 text-xs font-semibold gap-1.5" data-testid="button-issue-card">
              <Plus size={15} /> New Card
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border w-[92vw] max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-white text-lg">Issue New Card</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleIssueCard} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Linked Account</Label>
                {activeAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No active accounts found. Create one first.</p>
                ) : (
                  <Select value={newCardAccountId} onValueChange={setNewCardAccountId}>
                    <SelectTrigger className="bg-background h-11 rounded-xl" data-testid="select-card-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {activeAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={String(acc.id)}>
                          {acc.nickname || acc.accountType} — {acc.currency} {acc.balance.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Card Type</Label>
                  <Select value={newCardType} onValueChange={(v) => setNewCardType(v as "virtual" | "physical")}>
                    <SelectTrigger className="bg-background h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="virtual">Virtual</SelectItem>
                      <SelectItem value="physical">Physical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Network</Label>
                  <Select value={newCardNetwork} onValueChange={(v) => setNewCardNetwork(v as "visa" | "mastercard")}>
                    <SelectTrigger className="bg-background h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visa">Visa</SelectItem>
                      <SelectItem value="mastercard">Mastercard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Preview */}
              <div className={`relative w-full h-36 rounded-2xl bg-gradient-to-br ${cardGradient(newCardNetwork, false)} p-4 overflow-hidden`}>
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="text-lg tracking-[0.2em] font-mono text-white/90">•••• •••• •••• ????</p>
                  <div className="flex justify-between mt-2">
                    <p className="text-xs text-white/70 uppercase">{newCardType}</p>
                    <p className="text-sm font-bold italic text-white/90">{newCardNetwork === "mastercard" ? "mastercard" : "VISA"}</p>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full h-11 rounded-xl font-semibold" disabled={createCard.isPending || activeAccounts.length === 0} data-testid="button-confirm-issue-card">
                {createCard.isPending ? "Issuing…" : "Issue Card"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          Array(2).fill(0).map((_, i) => <Skeleton key={i} className="w-full h-56 rounded-2xl" />)
        ) : cards?.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-2xl border border-border">
            <CardIcon size={44} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-white font-semibold">No cards yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Issue a virtual or physical card to get started.</p>
            <Button size="sm" className="rounded-full px-5" onClick={() => setIssueOpen(true)} data-testid="button-issue-first-card">
              <Plus size={15} className="mr-1.5" /> Issue Card
            </Button>
          </div>
        ) : (
          cards?.map((card) => (
            <div key={card.id} data-testid={`card-${card.id}`} className="space-y-3">
              {/* Card Visual */}
              <div className={`relative w-full h-52 rounded-2xl bg-gradient-to-br ${cardGradient(card.network, card.status === "frozen")} p-6 overflow-hidden shadow-xl`}>
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white blur-3xl -mr-12 -mt-12" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-black blur-2xl -ml-8 -mb-8" />
                </div>

                {card.status === "frozen" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] rounded-2xl z-10">
                    <div className="flex flex-col items-center gap-1.5">
                      <Snowflake size={28} className="text-blue-300" />
                      <span className="text-sm font-semibold text-white">Frozen</span>
                    </div>
                  </div>
                )}

                <div className="relative z-10 h-full flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] uppercase tracking-widest text-white/60 font-medium">{card.cardType}</span>
                    </div>
                    <span className="text-lg font-bold italic text-white/90">
                      {card.network === "mastercard" ? "mastercard" : "VISA"}
                    </span>
                  </div>

                  <div>
                    <p className="text-xl sm:text-2xl tracking-[0.2em] font-mono text-white mb-4">
                      •••• &nbsp;•••• &nbsp;•••• &nbsp;{card.last4}
                    </p>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/50 mb-0.5">Card Holder</p>
                        <p className="text-sm font-semibold text-white tracking-wide uppercase">{card.holderName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-white/50 mb-0.5">Expires</p>
                        <p className="text-sm font-semibold text-white">
                          {String(card.expiryMonth).padStart(2, "0")}/{String(card.expiryYear).slice(-2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center border border-border">
                      {card.status === "frozen" ? <Snowflake size={17} className="text-blue-400" /> : <Shield size={17} className="text-primary" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{card.status === "frozen" ? "Unfreeze Card" : "Freeze Card"}</p>
                      <p className="text-xs text-muted-foreground">Temporarily {card.status === "frozen" ? "re-enable" : "disable"} this card</p>
                    </div>
                  </div>
                  <Switch
                    checked={card.status === "frozen"}
                    onCheckedChange={() => handleToggleFreeze(card.id, card.status)}
                    data-testid={`switch-freeze-${card.id}`}
                  />
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center border border-border">
                      <CheckCircle2 size={17} className="text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Card Status</p>
                      <p className="text-xs text-muted-foreground capitalize">{card.status} · {card.cardType}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${card.status === "active" ? "bg-green-500/15 text-green-400 border border-green-500/20" : "bg-blue-500/15 text-blue-400 border border-blue-500/20"}`}>
                    {card.status}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
