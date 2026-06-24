import { useState, useEffect } from "react";
import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  User, ShieldCheck, LogOut, ChevronRight, Edit3, Check, X,
  Phone, Mail, MapPin, Calendar, CreditCard, Lock,
} from "lucide-react";

export function Profile() {
  const { signOut } = useClerk();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const updateMe = useUpdateMe();

  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState({ fullName: "", phone: "", address: "" });

  useEffect(() => {
    if (user) {
      setFieldValues({
        fullName: user.fullName ?? "",
        phone: user.phone ?? "",
        address: user.address ?? "",
      });
    }
  }, [user]);

  const saveField = (field: keyof typeof fieldValues) => {
    updateMe.mutate(
      { data: { [field]: fieldValues[field] } },
      {
        onSuccess: () => {
          toast({ title: "Profile updated" });
          setEditingField(null);
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Update failed", description: err?.data?.error ?? err?.message, variant: "destructive" });
        },
      },
    );
  };

  const cancelEdit = (field: string) => {
    setEditingField(null);
    setFieldValues((prev) => ({ ...prev, [field]: (user as any)?.[field] ?? "" }));
  };

  const handleSignOut = () => signOut({ redirectUrl: "/sign-in" });

  const kycBadge = () => {
    switch (user?.kycStatus) {
      case "approved": return { label: "Verified", color: "text-green-400", bg: "bg-green-500/15 border-green-500/20" };
      case "submitted": return { label: "Under Review", color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/20" };
      case "rejected": return { label: "Rejected", color: "text-red-400", bg: "bg-red-500/15 border-red-500/20" };
      default: return { label: "Not Verified", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/20" };
    }
  };

  const badge = kycBadge();

  const EditableRow = ({
    icon: Icon, label, fieldKey, value, type = "text",
  }: {
    icon: React.ElementType; label: string; fieldKey: keyof typeof fieldValues; value?: string | null; type?: string;
  }) => {
    const isEditing = editingField === fieldKey;
    return (
      <div className="flex items-start gap-3 py-4 border-b border-border/50 last:border-0">
        <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shrink-0 mt-0.5">
          <Icon size={15} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                type={type}
                value={fieldValues[fieldKey]}
                onChange={(e) => setFieldValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
                className="bg-background border-border h-9 rounded-lg text-sm flex-1 px-3"
                autoFocus
                data-testid={`input-edit-${fieldKey}`}
                onKeyDown={(e) => { if (e.key === "Enter") saveField(fieldKey); if (e.key === "Escape") cancelEdit(fieldKey); }}
              />
              <button onClick={() => saveField(fieldKey)} disabled={updateMe.isPending} className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30 transition-colors" data-testid={`button-save-${fieldKey}`}>
                <Check size={15} />
              </button>
              <button onClick={() => cancelEdit(fieldKey)} className="w-8 h-8 rounded-lg bg-card text-muted-foreground flex items-center justify-center hover:text-white transition-colors" data-testid={`button-cancel-${fieldKey}`}>
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-white font-medium truncate">{value || <span className="text-muted-foreground/60 text-xs italic font-normal">Not set</span>}</p>
              <button onClick={() => setEditingField(fieldKey)} className="shrink-0 text-muted-foreground hover:text-primary transition-colors p-1 rounded-lg hover:bg-primary/10" data-testid={`button-edit-${fieldKey}`}>
                <Edit3 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ReadOnlyRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) => (
    <div className="flex items-start gap-3 py-4 border-b border-border/50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={15} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-sm text-white font-medium truncate">{value || <span className="text-muted-foreground/60 text-xs italic font-normal">Not set</span>}</p>
      </div>
    </div>
  );

  return (
    <div className="px-4 sm:px-6 py-4 pb-8 space-y-5">
      <h1 className="text-2xl font-bold text-white tracking-tight">Profile</h1>

      {/* Avatar & Name Header */}
      <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-primary/20 to-card rounded-2xl border border-border">
        {isLoading ? (
          <Skeleton className="w-16 h-16 rounded-full shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold border-2 border-primary/30 shrink-0 uppercase">
            {user?.fullName?.charAt(0) || user?.email?.charAt(0) || "U"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <><Skeleton className="h-5 w-36 mb-2" /><Skeleton className="h-4 w-52" /></>
          ) : (
            <>
              <h2 className="text-lg font-bold text-white truncate">{user?.fullName || "User"}</h2>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            </>
          )}
        </div>
      </div>

      {/* KYC Status */}
      <div className={`flex items-center justify-between p-4 rounded-2xl border ${badge.bg}`}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className={badge.color} />
          <div>
            <p className="text-sm font-semibold text-white">Identity Verification</p>
            <p className={`text-xs font-medium mt-0.5 ${badge.color}`}>{badge.label}</p>
          </div>
        </div>
        {user?.kycStatus !== "approved" && (
          <button onClick={() => setLocation("/kyc")} className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${badge.bg} ${badge.color}`} data-testid="button-verify-kyc">
            {user?.kycStatus === "submitted" ? "View Status" : "Verify Now"}
          </button>
        )}
      </div>

      {/* Personal Information — editable */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Personal Information</h3>
        <EditableRow icon={User} label="Full Name" fieldKey="fullName" value={user?.fullName} />
        <ReadOnlyRow icon={Mail} label="Email Address" value={user?.email} />
        <EditableRow icon={Phone} label="Phone Number" fieldKey="phone" value={user?.phone} />
        <EditableRow icon={MapPin} label="Address" fieldKey="address" value={user?.address} />
        <div className="flex items-start gap-3 py-4 border-t border-border/50">
          <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shrink-0 mt-0.5">
            <Calendar size={15} className="text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Date of Birth</p>
            <p className="text-sm text-white font-medium">{user?.dateOfBirth || <span className="text-muted-foreground/60 text-xs italic font-normal">Not set — complete KYC</span>}</p>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-4 pb-1">Account</h3>
        {[
          { icon: CreditCard, label: "Manage Accounts", href: "/home" },
          { icon: Lock, label: "Security & Privacy", href: "/kyc" },
        ].map(({ icon: Icon, label, href }) => (
          <button key={label} onClick={() => setLocation(href)} className="w-full flex items-center justify-between px-4 py-4 border-t border-border/50 hover:bg-white/5 transition-colors" data-testid={`link-${label.toLowerCase().replace(/ /g, "-")}`}>
            <div className="flex items-center gap-3">
              <Icon size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium text-white">{label}</span>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Sign Out */}
      <Button
        variant="destructive"
        className="w-full h-14 rounded-xl text-base font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
        onClick={handleSignOut}
        data-testid="button-sign-out"
      >
        <LogOut className="mr-2" size={20} />
        Sign Out
      </Button>
    </div>
  );
}
