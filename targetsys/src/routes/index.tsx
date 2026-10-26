import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Activity, ArrowRight, UserCheck, KeyRound } from "lucide-react";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { user, isAdmin, isCustomer, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      if (isAdmin) {
        void navigate({ to: "/admin" });
      } else if (isCustomer) {
        void navigate({ to: "/app" });
      }
    }
  }, [user, isAdmin, isCustomer, isLoading, navigate]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background via-emerald-950/5 to-background">
      <div className="max-w-2xl w-full text-center space-y-8 py-12">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-emerald-700/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20 mb-2">
          <Shield className="w-10 h-10" />
        </div>

        <div className="space-y-3">
          <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            Protected Target for Ethio-Cyber Shield (ECS)
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            HonorPay Digital Banking
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
            Full standard mobile banking platform in Ethiopia (ETB) with registered customer transfers, teller cash deposits, and real-time defense telemetry.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button asChild size="lg" className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white font-medium">
            <Link to="/login">
              Sign In <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link to="/register">
              Create Customer Account
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
            <Link to="/employee">
              <UserCheck className="w-4 h-4 mr-2" /> Teller Portal
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto text-muted-foreground hover:text-foreground">
            <Link to="/admin">
              <KeyRound className="w-4 h-4 mr-2" /> Admin Ops
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8 border-t border-border/60 text-left">
          <div className="p-4 rounded-xl border border-border/40 bg-card/50">
            <div className="flex items-center gap-2 font-semibold text-sm mb-1 text-foreground">
              <Activity className="w-4 h-4 text-emerald-600" /> Real Telemetry
            </div>
            <p className="text-xs text-muted-foreground">
              Every authentication attempt, session change, and transfer emits structured events to the security outbox.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-border/40 bg-card/50">
            <div className="flex items-center gap-2 font-semibold text-sm mb-1 text-foreground">
              <Lock className="w-4 h-4 text-amber-500" /> Zero Vulnerabilities
            </div>
            <p className="text-xs text-muted-foreground">
              Attack attempts (SQLi, brute-force, IDOR) are safely detected and logged, never allowed to succeed.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-border/40 bg-card/50">
            <div className="flex items-center gap-2 font-semibold text-sm mb-1 text-foreground">
              <UserCheck className="w-4 h-4 text-blue-500" /> Multi-Role Shell
            </div>
            <p className="text-xs text-muted-foreground">
              Dedicated Customer banking app with ledger movements and Desktop-first Admin dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
