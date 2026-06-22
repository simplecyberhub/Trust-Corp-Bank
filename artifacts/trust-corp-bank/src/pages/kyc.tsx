import { useSubmitKyc, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ShieldCheck } from "lucide-react";

const kycSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  address: z.string().min(5, "Address is required"),
  idType: z.enum(["passport", "drivers_license", "national_id"]),
  idNumber: z.string().min(4, "ID Number is required"),
});

type KycFormValues = z.infer<typeof kycSchema>;

export function Kyc() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  
  const submitKyc = useSubmitKyc();

  const form = useForm<KycFormValues>({
    resolver: zodResolver(kycSchema),
    defaultValues: {
      fullName: user?.fullName || "",
      dateOfBirth: user?.dateOfBirth || "",
      address: user?.address || "",
      idType: "passport",
      idNumber: "",
    },
  });

  const onSubmit = (data: KycFormValues) => {
    submitKyc.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "KYC Submitted", description: "Your identity verification is pending review." });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation("/profile");
      },
      onError: (err: any) => {
        toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
      }
    });
  };

  if (user?.kycStatus === 'approved') {
    return (
      <div className="px-6 py-12 text-center space-y-4">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
          <ShieldCheck size={40} className="text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-white">Identity Verified</h2>
        <p className="text-muted-foreground text-sm">Your account is fully verified and unrestricted.</p>
        <Button onClick={() => setLocation("/home")} className="mt-8">Return Home</Button>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Identity Verification</h1>
        <p className="text-sm text-muted-foreground mt-1">Please provide your details to unlock all features.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 bg-card p-4 rounded-2xl border border-border">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">Full Legal Name</FormLabel>
                <FormControl>
                  <Input placeholder="John Doe" className="bg-background h-12 rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">Date of Birth</FormLabel>
                <FormControl>
                  <Input placeholder="YYYY-MM-DD" className="bg-background h-12 rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">Residential Address</FormLabel>
                <FormControl>
                  <Input placeholder="123 Main St..." className="bg-background h-12 rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="idType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">ID Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background h-12 rounded-xl">
                        <SelectValue placeholder="Select ID" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="passport">Passport</SelectItem>
                      <SelectItem value="drivers_license">Driver's License</SelectItem>
                      <SelectItem value="national_id">National ID</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="idNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">ID Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Document number" className="bg-background h-12 rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-14 rounded-xl mt-6 text-base font-semibold"
            disabled={submitKyc.isPending}
          >
            {submitKyc.isPending ? "Submitting..." : "Submit Verification"}
          </Button>
        </form>
      </Form>
    </div>
  );
}