import { useLocation, Link } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import {
  LayoutDashboard, Users, ArrowRightLeft, CreditCard, LogOut, Shield, MessageSquare,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/accounts", label: "Accounts", icon: CreditCard },
  { href: "/transactions", label: "Transactions", icon: ArrowRightLeft },
  { href: "/sms", label: "SMS Gateway", icon: MessageSquare },
];

export function Sidebar() {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();

  return (
    <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-sm font-black text-white">TC</span>
          </div>
          <div>
            <p className="text-sm font-bold text-white">Trust Corp</p>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600/20 text-blue-400 border border-blue-600/20"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="p-3 border-t border-gray-800 space-y-2">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
            {user?.firstName?.charAt(0) ?? user?.emailAddresses?.[0]?.emailAddress?.charAt(0) ?? "A"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user?.fullName ?? "Admin"}</p>
            <div className="flex items-center gap-1">
              <Shield size={10} className="text-blue-400" />
              <span className="text-[10px] text-blue-400 font-medium">Administrator</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => signOut({ redirectUrl: "/sign-in" })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={17} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
