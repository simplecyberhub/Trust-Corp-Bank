import { Link, useLocation } from "wouter";
import { Home, Activity, Send, CreditCard, User, Bell } from "lucide-react";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: notifications } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey() } });

  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  const navItems = [
    { href: "/home", icon: Home, label: "Home" },
    { href: "/activity", icon: Activity, label: "Activity" },
    { href: "/transfer", icon: Send, label: "Transfer" },
    { href: "/cards", icon: CreditCard, label: "Cards" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="flex justify-center w-full min-h-[100dvh] bg-black/50">
      <div className="w-full max-w-[430px] bg-background min-h-[100dvh] flex flex-col relative shadow-2xl overflow-hidden">
        {/* Top Bar */}
        <header className="px-6 py-4 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md">
          <div className="text-lg font-bold text-white tracking-tight">
            Trust Corp
          </div>
          <Link href="/notifications" className="relative p-2 -mr-2 text-muted-foreground hover:text-white transition-colors">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-background"></span>
            )}
          </Link>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-24">
          {children}
        </main>

        {/* Bottom Nav */}
        <nav className="absolute bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border pb-safe">
          <div className="flex items-center justify-around px-2 py-3">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 min-w-[64px] p-2 rounded-xl transition-all ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-white"
                  }`}
                >
                  <Icon size={24} className={isActive ? "fill-primary/20" : ""} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}