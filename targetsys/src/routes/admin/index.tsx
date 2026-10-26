import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import { getAdminOverviewFn, getLiveSecurityEventsFn } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  CreditCard,
  Coins,
  Receipt,
  Clock,
  ShieldAlert,
  XCircle,
  CheckCircle2,
  Laptop,
  Ban,
  Activity,
  PlugZap,
  RefreshCw,
  ArrowRight,
  Radio,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial overview aggregates
  const loadOverview = async () => {
    try {
      const res = await getAdminOverviewFn();
      setData(res);
      setLiveEvents(res.live_events ?? []);
    } catch (err) {
      console.error("Failed to load admin overview", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  // Live polling of security event feed every 3 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const events = await getLiveSecurityEventsFn({ data: { limit: 10 } });
        setLiveEvents(events);
      } catch {
        // quiet error during background polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const kpis = data?.kpis ?? {
    customers: 0,
    accounts: 0,
    total_balance_etb: 0,
    transactions_today: 0,
    completed_today: 0,
    processing_today: 0,
    frozen_today: 0,
    failed_today: 0,
    active_sessions: 0,
    blocked_ips: 0,
    undelivered_events: 0,
    integration_health: "CONFIGURED",
  };

  const formatEtb = (amount: number) => {
    return new Intl.NumberFormat("en-ET", {
      style: "currency",
      currency: "ETB",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        {/* Top Control Room Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Security Operations & Telemetry Overview
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real DB aggregates across all target system ledgers, active client sessions, and mitigation telemetry.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" /> Live Telemetry (3s poll)
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={loadOverview}
              disabled={isLoading}
              className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900 h-7"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Sync
            </Button>
          </div>
        </div>

        {/* Teller Cash-in Banner */}
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white">HonorPay Branch Teller Cash-In Portal</span>
              <p className="text-[11px] text-emerald-200/80">
                Deposit cash directly into registered customer accounts so they can make mobile transfers.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs shrink-0">
            <Link to="/employee">Open Teller Portal ↗</Link>
          </Button>
        </div>

        {/* Real DB KPI Tiles (Row 1: Core Financials & Customers) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border/60 bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Customers</span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">{kpis.customers}</div>
            <div className="text-[11px] text-muted-foreground">Active profiles</div>
          </Card>

          <Card className="border-border/60 bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Bank Accounts</span>
              <CreditCard className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">{kpis.accounts}</div>
            <div className="text-[11px] text-muted-foreground">Non-system checking</div>
          </Card>

          <Card className="border-border/60 bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Total Balance</span>
              <Coins className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">{formatEtb(kpis.total_balance_etb)}</div>
            <div className="text-[11px] text-muted-foreground">Combined customer ledger</div>
          </Card>

          <Card className="border-border/60 bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Transactions Today</span>
              <Receipt className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">{kpis.transactions_today}</div>
            <div className="text-[11px] text-muted-foreground">Settled or held today</div>
          </Card>
        </div>

        {/* Real DB KPI Tiles (Row 2: Transaction Status Breakdown & Security Posture) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
            <div className="flex items-center justify-between text-emerald-500 text-xs font-medium">
              <span>Completed</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400">{kpis.completed_today}</div>
            <div className="text-[10px] text-muted-foreground">Double-entry settled</div>
          </Card>

          <Card className="border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
            <div className="flex items-center justify-between text-amber-500 text-xs font-medium">
              <span>Processing (Hold)</span>
              <Clock className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">{kpis.processing_today}</div>
            <div className="text-[10px] text-muted-foreground">In high-value hold window</div>
          </Card>

          <Card className="border-blue-500/20 bg-blue-500/5 p-3 space-y-1">
            <div className="flex items-center justify-between text-blue-500 text-xs font-medium">
              <span>Frozen (Held)</span>
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold font-mono text-blue-400">{kpis.frozen_today}</div>
            <div className="text-[10px] text-muted-foreground">Mitigated / Held for review</div>
          </Card>

          <Card className="border-red-500/20 bg-red-500/5 p-3 space-y-1">
            <div className="flex items-center justify-between text-red-500 text-xs font-medium">
              <span>Failed</span>
              <XCircle className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold font-mono text-red-400">{kpis.failed_today}</div>
            <div className="text-[10px] text-muted-foreground">Limit or insufficient funds</div>
          </Card>

          <Card className="border-border/60 bg-card p-3 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Active Sessions</span>
              <Laptop className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">{kpis.active_sessions}</div>
            <div className="text-[10px] text-muted-foreground">Non-expired sessions</div>
          </Card>
        </div>

        {/* Row 3: Live Security Event Feed (3s Poll) & Threat Telemetry Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Live Event Feed (2 Columns) */}
          <div className="lg:col-span-2 space-y-3">
            <Card className="border-border/60">
              <CardHeader className="py-3 px-4 border-b border-border/40 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-amber-500" /> Live Security Event Feed
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Continuous stream polled every 3s from <code>security_events</code>
                  </CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground h-7">
                  <Link to="/admin/events">
                    All Events <ArrowRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-border/30">
                {liveEvents.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    No security events recorded yet. Perform actions in the banking app or lab console to trigger telemetry.
                  </div>
                ) : (
                  liveEvents.map((ev) => (
                    <div key={ev.event_id} className="p-3 text-xs flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 font-mono">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              ev.result === "SUCCESS"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : ev.result === "DENIED" || ev.result === "BLOCKED"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {ev.result}
                          </span>
                          <span className="font-semibold text-foreground">{ev.event_type}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-3">
                          <span>User: <strong className="text-zinc-300">{ev.user_id_pub ?? "anonymous"}</strong></span>
                          <span>IP: <code className="text-zinc-300">{ev.source_ip ?? "—"}</code></span>
                        </div>
                      </div>
                      <div className="text-right font-mono text-[11px] text-muted-foreground">
                        <div>
                          {new Date(ev.occurred_at).toLocaleTimeString("en-US", {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </div>
                        <span className="text-[10px] text-zinc-500">{ev.delivery_status ?? "PENDING"}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Threats & System Status */}
          <div className="space-y-4">
            {/* Top Source IPs by Failed Logins */}
            <Card className="border-border/60">
              <CardHeader className="py-3 px-4 border-b border-border/40">
                <CardTitle className="text-xs font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Top Source IPs by Failed Logins (24h)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 text-xs">
                {(data?.top_failed_ips ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Zero failed logins detected in the last 24h.
                  </p>
                ) : (
                  (data.top_failed_ips as { ip: string; count: number }[]).map((entry, idx) => (
                    <div key={entry.ip} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-zinc-500 text-[11px]">#{idx + 1}</span>
                        <code className="font-mono text-foreground font-semibold">{entry.ip}</code>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono font-bold text-[10px]">
                        {entry.count} failures
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Outbox & Integration Status Tile */}
            <Card className="border-border/60">
              <CardHeader className="py-3 px-4 border-b border-border/40">
                <CardTitle className="text-xs font-semibold flex items-center gap-2">
                  <PlugZap className="w-3.5 h-3.5 text-amber-500" /> Outbox Delivery & Health
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">ECS Pipeline</span>
                  <span className="font-mono font-bold text-foreground">
                    {kpis.integration_health}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Undelivered Outbox</span>
                  <span className={`font-mono font-bold ${kpis.undelivered_events > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    {kpis.undelivered_events} pending
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/40">
                  <span className="text-muted-foreground">Blocked IP Addresses</span>
                  <span className="font-mono font-bold text-foreground">{kpis.blocked_ips}</span>
                </div>
                <Button asChild size="sm" variant="outline" className="w-full text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-800 h-7 mt-1">
                  <Link to="/admin/integration">Configure ECS Integration</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
