import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { User, ShieldCheck, Settings, LogOut, ChevronRight } from "lucide-react";
import { Link } from "wouter";

export function Profile() {
  const { signOut } = useClerk();
  const { data: user, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const handleSignOut = () => {
    signOut({ redirectUrl: "/sign-in" });
  };

  return (
    <div className="px-6 py-4 space-y-6">
      <h1 className="text-2xl font-bold text-white tracking-tight">Profile</h1>

      {/* User Info Header */}
      <div className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border">
        {isLoading ? (
          <Skeleton className="w-16 h-16 rounded-full" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-bold border border-primary/30">
            {user?.fullName?.charAt(0) || user?.email?.charAt(0) || "U"}
          </div>
        )}
        <div className="flex-1">
          {isLoading ? (
            <>
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-white">{user?.fullName || "User"}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </>
          )}
        </div>
      </div>

      {/* KYC Status */}
      <div className="p-4 bg-card rounded-2xl border border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            user?.kycStatus === 'approved' ? 'bg-green-500/20 text-green-500' : 'bg-orange-500/20 text-orange-500'
          }`}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Identity Verification</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.kycStatus || 'pending'}</p>
          </div>
        </div>
        {user?.kycStatus !== 'approved' && (
          <Link href="/kyc" className="text-xs font-semibold text-primary px-3 py-1.5 bg-primary/10 rounded-full">
            Verify Now
          </Link>
        )}
      </div>

      {/* Menu Links */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {[
          { icon: User, label: "Personal Information", href: "/profile/info" },
          { icon: Settings, label: "Account Settings", href: "/profile/settings" },
        ].map((item, i) => (
          <Link key={i} href={item.href} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-border last:border-0">
            <div className="flex items-center gap-3">
              <item.icon size={20} className="text-muted-foreground" />
              <span className="text-sm font-medium text-white">{item.label}</span>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* Logout */}
      <Button 
        variant="destructive" 
        className="w-full h-14 rounded-xl text-base font-semibold mt-8 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
        onClick={handleSignOut}
      >
        <LogOut className="mr-2" size={20} />
        Sign Out
      </Button>
    </div>
  );
}