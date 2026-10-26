import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getSecurityPostureFn } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import {
  Shield,
  LayoutDashboard,
  Users,
  Receipt,
  Activity,
  Laptop,
  Ban,
  RotateCcw,
  FileText,
  PlugZap,
  LogOut,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
} from "lucide-react";

interface AdminShellProps {
  children: ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [labMode, setLabMode] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const p = await getSecurityPostureFn();
        setLabMode((p as any)?.lab_mode ?? true);
      } catch {
        setLabMode(true);
      }
    })();
  }, [location.pathname]);

  const navItems = [
    { label: "Overview", to: "/admin", icon: LayoutDashboard },
    { label: "Customers", to: "/admin/customers", icon: Users },
    { label: "Transactions", to: "/admin/transactions", icon: Receipt },
    { label: "Events", to: "/admin/events", icon: Activity },
    { label: "Sessions", to: "/admin/sessions", icon: Laptop },
    { label: "Blocklist", to: "/admin/ip-blocklist", icon: Ban },
    { label: "Responses", to: "/admin/responses", icon: RotateCcw },
    { label: "Audit", to: "/admin/audit", icon: FileText },
    { label: "Integration", to: "/admin/integration", icon: PlugZap },
    { label: "Self-Test", to: "/admin/selftest", icon: ShieldCheck },
    { label: "Docs", to: "/admin/docs", icon: BookOpen },
  ];

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin" || location.pathname === "/admin/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex-1 flex flex-col bg-background min-h-screen">
      {/* Top Admin Control Room Header */}
      <header className="border-b border-border/60 bg-zinc-950 text-zinc-100 sticky top-7 z-40">
        <div className="max-w-7xl mx-auto px-4 py-2 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="flex items-center gap-2 group shrink-0">
              <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30 group-hover:bg-amber-500/30 transition-colors">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white flex items-center gap-1.5">
                  HonorPay Ops
                  {labMode === false ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-amber-400" /> HARDENED posture
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" /> ACTIVE posture
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-zinc-400 block leading-none">Security Control Room</span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/employee"
              className="text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors hidden sm:inline-flex items-center gap-1"
            >
              Teller Cash-In Portal
            </Link>

            <span className="hidden lg:inline-flex px-2 py-0.5 rounded text-xs font-mono font-medium bg-zinc-900 text-zinc-400 border border-zinc-800">
              Admin: {user?.publicId ?? "U..."}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                void navigate({ to: "/login" });
              }}
              className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900 h-8"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>

        {/* Horizontal Navigation Bar (Desktop-First, Compact) */}
        <div className="border-t border-zinc-900 bg-zinc-950/80 px-4 sm:px-6 overflow-x-auto scrollbar-none">
          <div className="max-w-7xl mx-auto flex items-center gap-1 py-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? "bg-zinc-800 text-amber-400 font-semibold"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
