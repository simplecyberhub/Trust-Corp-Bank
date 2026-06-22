import { useState } from "react";
import { useListAccounts, useSendMoney, useListBeneficiaries, useCreateBeneficiary } from "@workspace/api-client-react";
import { getListAccountsQueryKey, getListBeneficiariesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export function Transfer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState<string>("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientName, setRecipientName] = useState("");

  const { data: accounts } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const sendMoney = useSendMoney();

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceAccountId || !amount || !recipientAccount || !recipientName) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    sendMoney.mutate(
      {
        data: {
          fromAccountId: parseInt(sourceAccountId),
          amount: parseFloat(amount),
          currency: "USD",
          description: description || "Transfer",
          recipientAccount,
          recipientName,
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Transfer Successful", description: `Sent $${amount} to ${recipientName}` });
          setAmount("");
          setDescription("");
          setRecipientAccount("");
          setRecipientName("");
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Transfer Failed", description: err?.message || "An error occurred", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="px-6 py-4 space-y-6">
      <h1 className="text-2xl font-bold text-white tracking-tight">Transfer Money</h1>

      <form onSubmit={handleTransfer} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">From Account</Label>
          <Select value={sourceAccountId} onValueChange={setSourceAccountId}>
            <SelectTrigger className="w-full bg-card border-border h-14 rounded-xl">
              <SelectValue placeholder="Select source account" />
            </SelectTrigger>
            <SelectContent>
              {accounts?.map((acc) => (
                <SelectItem key={acc.id} value={acc.id.toString()}>
                  {acc.nickname || 'Account'} (•••• {acc.accountNumber.slice(-4)}) - ${acc.balance}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">Recipient Name</Label>
          <Input 
            value={recipientName} 
            onChange={(e) => setRecipientName(e.target.value)} 
            placeholder="John Doe"
            className="bg-card border-border h-14 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">Recipient Account Number</Label>
          <Input 
            value={recipientAccount} 
            onChange={(e) => setRecipientAccount(e.target.value)} 
            placeholder="0000000000"
            className="bg-card border-border h-14 rounded-xl"
          />
        </div>

        <div className="space-y-2 pt-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">Amount (USD)</Label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-xl">$</span>
            <Input 
              type="number" 
              step="0.01"
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              placeholder="0.00"
              className="bg-card border-border h-16 rounded-xl pl-8 text-2xl font-semibold"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">Description (Optional)</Label>
          <Input 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            placeholder="Payment for..."
            className="bg-card border-border h-14 rounded-xl"
          />
        </div>

        <Button 
          type="submit" 
          className="w-full h-14 rounded-xl mt-6 text-base font-semibold" 
          disabled={sendMoney.isPending}
        >
          {sendMoney.isPending ? "Processing..." : "Send Money"}
        </Button>
      </form>
    </div>
  );
}