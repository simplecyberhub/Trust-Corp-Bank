import { useListCards, useUpdateCard, getListCardsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, CreditCard as CardIcon, Shield, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Cards() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: cards, isLoading } = useListCards({ query: { queryKey: getListCardsQueryKey() } });
  const updateCard = useUpdateCard();

  const handleToggleFreeze = (cardId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'frozen' : 'active';
    updateCard.mutate(
      { cardId, data: { status: newStatus as any } },
      {
        onSuccess: () => {
          toast({ title: "Card Updated", description: `Card is now ${newStatus}` });
          queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update card status", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="px-6 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">Your Cards</h1>
        <Button variant="ghost" size="icon" className="text-primary hover:text-white hover:bg-card">
          <Plus size={24} />
        </Button>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          <Skeleton className="w-full h-56 rounded-2xl" />
        ) : cards?.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <CardIcon size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-white font-medium">No cards found</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Request a new virtual or physical card.</p>
            <Button variant="outline" className="rounded-full">Request Card</Button>
          </div>
        ) : (
          cards?.map((card) => (
            <div key={card.id} className="space-y-4">
              {/* Card Visual */}
              <div className={`relative w-full h-56 rounded-2xl p-6 overflow-hidden shadow-xl transition-all ${
                card.status === 'frozen' ? 'opacity-60 grayscale' : ''
              } ${card.network === 'mastercard' ? 'bg-gradient-to-br from-orange-500 to-red-600' : 'bg-gradient-to-br from-blue-600 to-indigo-900'}`}>
                
                <div className="absolute top-6 right-6 font-bold text-lg italic text-white/90">
                  {card.network === 'mastercard' ? 'mastercard' : 'VISA'}
                </div>
                
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="flex items-center justify-between text-white/80 font-medium mb-2 text-sm">
                    <span>{card.cardType.toUpperCase()}</span>
                  </div>
                  <p className="text-2xl tracking-[0.2em] font-mono text-white mb-4">
                    •••• •••• •••• {card.last4}
                  </p>
                  <div className="flex justify-between items-end text-white/90">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider opacity-80">Card Holder</p>
                      <p className="font-medium tracking-wide">{card.holderName || "JOHN DOE"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider opacity-80">Expires</p>
                      <p className="font-medium">{card.expiryMonth.toString().padStart(2, '0')}/{card.expiryYear.toString().slice(-2)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Controls */}
              <div className="bg-card rounded-2xl border border-border p-2">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center">
                      <Shield size={20} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Freeze Card</p>
                      <p className="text-xs text-muted-foreground">Temporarily disable</p>
                    </div>
                  </div>
                  <Switch 
                    checked={card.status === 'frozen'} 
                    onCheckedChange={() => handleToggleFreeze(card.id, card.status)}
                  />
                </div>
                
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center">
                      <Settings size={20} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Settings</p>
                      <p className="text-xs text-muted-foreground">Limits & PIN</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}