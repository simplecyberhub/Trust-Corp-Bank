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
  Phone, Mail, MapPin, Calendar, CreditCard, Lock, KeyRound, Eye, EyeOff, Delete,
  Fingerprint, Copy, CheckCircle2,
} from "lucide-react";

/* ─── PIN Keypad ─────────────────────────────────────────────────────────── */
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
              value.length > i
                ? "border-primary bg-primary/20"
                : "border-border bg-card"
            }`}
          >
            {value.length > i ? (
              <div className="w-3 h-3 rounded-full bg-primary" />
            ) : null}
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

/* ─── PIN Dialog ─────────────────────────────────────────────────────────── */
type PinMode = "set" | "change-old" | "change-new" | "remove";

function PinDialog({
  mode,
  onClose,
  onSuccess,
}: {
  mode: "set" | "change" | "remove";
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<PinMode>(mode === "set" ? "set" : mode === "change" ? "change-old" : "remove");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setPin(""); setConfirm(""); setOldPin(""); setError(""); };

  const title = {
    set: "Set Transaction PIN",
    "change-old": "Enter Current PIN",
    "change-new": "Enter New PIN",
    remove: "Confirm Removal",
  }[step];

  const subtitle = {
    set: "Choose a 4-digit PIN to secure your transfers.",
    "change-old": "Enter your current PIN to continue.",
    "change-new": "Enter a new 4-digit PIN.",
    remove: "Enter your PIN to remove it.",
  }[step];

  const currentEntry = step === "change-old" ? oldPin : step === "change-new" ? confirm : pin;
  const setCurrentEntry = step === "change-old" ? setOldPin : step === "change-new" ? setConfirm : setPin;

  useEffect(() => {
    setError("");
  }, [currentEntry]);

  async function handleSubmit() {
    if (currentEntry.length !== 4) return;
    setLoading(true);
    setError("");

    try {
      if (mode === "set") {
        if (!oldPin) {
          // First phase: store the entered PIN and move to confirm step
          setStep("change-new" as any);
          setOldPin(currentEntry);
          setPin("");
          setLoading(false);
          return;
        }
        // Second phase: compare confirmation against the stored first entry
        if (currentEntry !== oldPin) { setError("PINs don't match. Try again."); setConfirm(""); setLoading(false); return; }
        const resp = await fetch("/api/users/me/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: oldPin }) });
        const data = await resp.json();
        if (!resp.ok) { setError(data.error ?? "Failed to set PIN."); setCurrentEntry(""); setLoading(false); return; }
        toast({ title: "PIN set successfully" });
        onSuccess();
        return;
      }

      if (mode === "change") {
        if (step === "change-old") {
          setStep("change-new");
          setOldPin(currentEntry);
          setCurrentEntry("");
          setLoading(false);
          return;
        }
        if (step === "change-new") {
          const resp = await fetch("/api/users/me/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: currentEntry, currentPin: oldPin }) });
          const data = await resp.json();
          if (!resp.ok) { setError(data.error ?? "Failed to change PIN."); setCurrentEntry(""); setLoading(false); return; }
          toast({ title: "PIN changed successfully" });
          onSuccess();
          return;
        }
      }

      if (mode === "remove") {
        const resp = await fetch("/api/users/me/pin", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: currentEntry }) });
        const data = await resp.json();
        if (!resp.ok) { setError(data.error ?? "Failed to remove PIN."); setCurrentEntry(""); setLoading(false); return; }
        toast({ title: "PIN removed" });
        onSuccess();
        return;
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // For "set" mode: first phase enters pin, second phase confirms
  const isSetFirstPhase = mode === "set" && step === "set";
  const isSetConfirmPhase = mode === "set" && (step as string) === "change-new";

  const displayStep = isSetFirstPhase ? "Enter PIN" : isSetConfirmPhase ? "Confirm PIN" : title;
  const displaySub = isSetFirstPhase ? "Choose a 4-digit PIN to secure your transfers." : isSetConfirmPhase ? "Re-enter your PIN to confirm." : subtitle;

  const handleKeypadChange = (v: string) => {
    setCurrentEntry(v);
    setError("");
  };

  useEffect(() => {
    if (currentEntry.length !== 4 || loading) return;
    const timer = setTimeout(() => { handleSubmit(); }, 200);
    return () => clearTimeout(timer);
  }, [currentEntry]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6 space-y-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{displayStep}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{displaySub}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-xs text-destructive font-medium text-center">
            {error}
          </div>
        )}

        <PinKeypad value={currentEntry} onChange={handleKeypadChange} disabled={loading} />

        {loading && (
          <div className="flex justify-center">
            <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {mode === "set" ? "Your PIN protects all outgoing transfers." : mode === "remove" ? "Removing your PIN will disable transfer protection." : "Forgot PIN? Contact support."}
        </p>
      </div>
    </div>
  );
}

/* ─── TOTP Dialog ────────────────────────────────────────────────────────── */
function TotpDialog({
  mode,
  onClose,
  onSuccess,
}: {
  mode: "setup" | "disable";
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<"loading" | "show" | "verify">(mode === "setup" ? "loading" : "verify");
  const [setupData, setSetupData] = useState<{ secret: string; secretFormatted: string; otpAuthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (mode !== "setup") return;
    fetch("/api/users/me/totp/setup", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); setStep("verify"); return; }
        setSetupData(data);
        setStep("show");
      })
      .catch(() => setError("Network error — please try again."));
  }, []);

  const handleCopy = () => {
    if (setupData) {
      navigator.clipboard.writeText(setupData.secretFormatted.replace(/\s/g, "")).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(
        mode === "setup" ? "/api/users/me/totp/enable" : "/api/users/me/totp",
        {
          method: mode === "setup" ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        },
      );
      const data = await resp.json();
      if (!resp.ok) { setError(data.error ?? "Failed."); setLoading(false); return; }
      toast({ title: mode === "setup" ? "Authenticator app enabled" : "Authenticator app disabled" });
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6 space-y-5 shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">
              {mode === "setup" ? "Enable Security Token" : "Disable Authenticator"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === "setup" ? "Link Google Authenticator or Authy." : "Enter your current 6-digit code to disable."}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground hover:text-white">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-xs text-destructive font-medium text-center">
            {error}
          </div>
        )}

        {step === "loading" && (
          <div className="flex justify-center py-8">
            <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {step === "show" && setupData && (
          <div className="space-y-4">
            <div className="bg-background rounded-2xl p-4 border border-border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Setup Instructions</p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Open <strong className="text-white">Google Authenticator</strong> or <strong className="text-white">Authy</strong></li>
                <li>Tap <strong className="text-white">+</strong> → "Enter a setup key"</li>
                <li>Enter your email and the key below</li>
                <li>Come back and enter the 6-digit code</li>
              </ol>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
              <p className="text-xs text-muted-foreground mb-2">Your Setup Key</p>
              <p className="font-mono text-sm font-bold text-primary tracking-widest text-center break-all">
                {setupData.secretFormatted}
              </p>
              <button
                onClick={handleCopy}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy Key"}
              </button>
            </div>

            <button
              onClick={() => setStep("verify")}
              className="w-full bg-primary text-white text-sm font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors"
            >
              I've Added It → Enter Code
            </button>
          </div>
        )}

        {step === "verify" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-white font-medium text-center">Enter 6-digit code</p>
              <p className="text-xs text-muted-foreground text-center">From your authenticator app</p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              placeholder="000000"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-center text-2xl font-mono font-bold text-white tracking-[0.5em] placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
            <button
              onClick={handleVerify}
              disabled={code.length !== 6 || loading}
              className="w-full bg-primary text-white text-sm font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Verifying…" : mode === "setup" ? "Verify & Enable" : "Verify & Disable"}
            </button>
            {mode === "setup" && step === "verify" && (
              <button onClick={() => setStep("show")} className="w-full text-xs text-muted-foreground hover:text-white transition-colors">
                ← Back to setup key
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Profile Page ───────────────────────────────────────────────────────── */
export function Profile() {
  const { signOut, openUserProfile } = useClerk();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const updateMe = useUpdateMe();

  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState({ fullName: "", phone: "", address: "" });
  const [pinDialog, setPinDialog] = useState<"set" | "change" | "remove" | null>(null);
  const [totpDialog, setTotpDialog] = useState<"setup" | "disable" | null>(null);

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

  const pinStatus = user?.hasPin;

  return (
    <div className="px-4 sm:px-6 py-4 pb-8 space-y-5">
      {pinDialog && (
        <PinDialog
          mode={pinDialog}
          onClose={() => setPinDialog(null)}
          onSuccess={() => {
            setPinDialog(null);
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          }}
        />
      )}
      {totpDialog && (
        <TotpDialog
          mode={totpDialog}
          onClose={() => setTotpDialog(null)}
          onSuccess={() => {
            setTotpDialog(null);
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          }}
        />
      )}

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

      {/* Transaction PIN */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Transaction PIN</h3>
        <div className="flex items-center gap-3 py-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
            <KeyRound size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              {isLoading ? <Skeleton className="h-4 w-28" /> : pinStatus ? "PIN Enabled" : "PIN Not Set"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pinStatus ? "Required to confirm all outgoing transfers." : "Set a 4-digit PIN to protect your transfers."}
            </p>
          </div>
          {!isLoading && (
            <div className={`w-2 h-2 rounded-full shrink-0 ${pinStatus ? "bg-green-400" : "bg-orange-400"}`} />
          )}
        </div>

        {!isLoading && (
          <div className="flex gap-2 mt-4">
            {!pinStatus ? (
              <button
                onClick={() => setPinDialog("set")}
                className="flex-1 bg-primary text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                data-testid="button-set-pin"
              >
                <Lock size={15} />
                Set PIN
              </button>
            ) : (
              <>
                <button
                  onClick={() => setPinDialog("change")}
                  className="flex-1 bg-card border border-border text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/5 transition-colors flex items-center justify-center gap-1.5"
                  data-testid="button-change-pin"
                >
                  <Edit3 size={14} />
                  Change PIN
                </button>
                <button
                  onClick={() => setPinDialog("remove")}
                  className="px-4 bg-destructive/10 border border-destructive/20 text-destructive text-sm font-semibold py-2.5 rounded-xl hover:bg-destructive/20 transition-colors"
                  data-testid="button-remove-pin"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Security Token (TOTP) */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Security Token</h3>
        <div className="flex items-center gap-3 py-1">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
            user?.totpEnabled
              ? "bg-green-500/10 border-green-500/20"
              : "bg-primary/10 border-primary/20"
          }`}>
            <Fingerprint size={18} className={user?.totpEnabled ? "text-green-400" : "text-primary"} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              {isLoading ? <Skeleton className="h-4 w-36" /> : user?.totpEnabled ? "Authenticator Enabled" : "Authenticator App"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {user?.totpEnabled
                ? "Google Authenticator is protecting your account."
                : "Link an authenticator app for an extra security layer."}
            </p>
          </div>
          {!isLoading && (
            <div className={`w-2 h-2 rounded-full shrink-0 ${user?.totpEnabled ? "bg-green-400" : "bg-muted-foreground/30"}`} />
          )}
        </div>

        {!isLoading && (
          <div className="flex gap-2 mt-4">
            {!user?.totpEnabled ? (
              <button
                onClick={() => setTotpDialog("setup")}
                className="flex-1 bg-primary text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
              >
                <Fingerprint size={15} />
                Enable Token
              </button>
            ) : (
              <button
                onClick={() => setTotpDialog("disable")}
                className="flex-1 bg-destructive/10 border border-destructive/20 text-destructive text-sm font-semibold py-2.5 rounded-xl hover:bg-destructive/20 transition-colors flex items-center justify-center gap-1.5"
              >
                <X size={14} />
                Disable Token
              </button>
            )}
          </div>
        )}
      </div>

      {/* Personal Information — editable */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Personal Information</h3>
        <EditableRow icon={User} label="Full Name" fieldKey="fullName" value={user?.fullName} />
        {/* Email — managed via Clerk; opens Clerk's profile modal for changes */}
        <div className="flex items-start gap-3 py-4 border-t border-border/50">
          <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shrink-0 mt-0.5">
            <Mail size={15} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Email Address</p>
            <p className="text-sm text-white font-medium truncate">{user?.email || "—"}</p>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">Tap ✎ to update via your account settings</p>
          </div>
          <button
            onClick={() => openUserProfile()}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-colors mt-0.5"
            title="Update email address"
            data-testid="button-update-email"
          >
            <Edit3 size={14} />
          </button>
        </div>
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
