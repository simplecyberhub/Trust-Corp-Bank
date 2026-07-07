import { Link, useLocation } from "wouter";
import { Home, Activity, Send, CreditCard, User, Bell } from "lucide-react";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const NAV_ITEMS = [
  { href: "/activity", icon: Activity, label: "Activity" },
  { href: "/transfer", icon: Send, label: "Transfer" },
  { href: "/home",     icon: Home,     label: "Home", primary: true },
  { href: "/cards",    icon: CreditCard, label: "Cards" },
  { href: "/profile",  icon: User,     label: "Profile" },
];

/** Play a gentle two-note chime using the Web Audio API (no file needed). */
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [880, 1320]; // A5 → E6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch { /* AudioContext blocked or unavailable */ }
}

/** Show a browser-native notification if permission is granted. */
function showBrowserNotification(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico", badge: "/favicon.ico" });
    } catch { /* some browsers block in iframes */ }
  }
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { user: clerkUser } = useUser();

  const { data: notifications } = useListNotifications({
    query: {
      queryKey: getListNotificationsQueryKey(),
      refetchInterval: 30_000, // poll every 30 s for real-time feel
    },
  });
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  // Sync Clerk profile info to our backend on first load
  useEffect(() => {
    if (!clerkUser || !me) return;
    const clerkName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ");
    const clerkEmail = clerkUser.primaryEmailAddress?.emailAddress ?? "";
    const needsSync = (me.fullName === "User" || me.fullName === "") || (!me.email && clerkEmail);
    if (needsSync && clerkName) {
      fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fullName: clerkName || me.fullName, email: clerkEmail || me.email }),
      }).then(() => queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }));
    }
  }, [clerkUser?.id, me?.fullName]);

  // Request browser notification permission once
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;
  const prevUnreadRef = useRef<number | null>(null); // null = initial load, don't chime

  // Play chime + browser notification when unread count increases
  useEffect(() => {
    if (prevUnreadRef.current === null) {
      // First render — set baseline without sounding
      prevUnreadRef.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnreadRef.current) {
      playChime();
      showBrowserNotification("Trust Corp Bank", "You have a new notification");
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  return (
    <div className="flex justify-center w-full min-h-[100dvh] bg-[#050810]">
      {/* Mobile container — full width on small, max 430 centered on large */}
      <div className="w-full sm:max-w-[430px] bg-background min-h-[100dvh] flex flex-col relative shadow-2xl overflow-hidden">

        {/* Top Bar */}
        <header className="px-5 py-3.5 flex items-center justify-between sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-[11px] font-black text-white leading-none">TC</span>
            </div>
            <span className="text-base font-bold text-white tracking-tight">Trust Corp</span>
          </div>
          <Link href="/notifications" className="relative p-2 -mr-1 text-muted-foreground hover:text-white transition-colors rounded-xl hover:bg-card" data-testid="link-notifications">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 bg-destructive rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-background px-0.5">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto pb-[76px]" id="main-content">
          {children}
        </main>

        {/* Bottom Navigation */}
        <nav className="absolute bottom-0 left-0 right-0 bg-card/95 backdrop-blur-2xl border-t border-border/60" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="flex items-end justify-around px-1 pt-1 pb-2">
            {NAV_ITEMS.map(({ href, icon: Icon, label, primary }) => {
              const isActive = location === href || (href !== "/home" && location.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={`nav-${label.toLowerCase()}`}
                  className={`flex flex-col items-center gap-1 min-w-[56px] py-1 transition-all ${
                    primary
                      ? "relative -mt-4"
                      : ""
                  }`}
                >
                  {primary ? (
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isActive ? "bg-primary shadow-primary/40" : "bg-primary/80 hover:bg-primary shadow-primary/20"}`}>
                      <Icon size={26} className="text-white" strokeWidth={isActive ? 2.5 : 2} />
                    </div>
                  ) : (
                    <div className={`w-11 h-8 rounded-xl flex items-center justify-center transition-all ${isActive ? "bg-primary/15" : "hover:bg-white/5"}`}>
                      <Icon size={22} className={isActive ? "text-primary" : "text-muted-foreground"} strokeWidth={isActive ? 2.5 : 2} />
                    </div>
                  )}
                  <span className={`text-[10px] font-medium leading-none ${primary ? "mt-1" : ""} ${isActive ? (primary ? "text-primary" : "text-primary") : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
