import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import { runAdminSelfTestFn } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/admin/selftest")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminSelfTestPage,
});

function AdminSelfTestPage() {
  const [report, setReport] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);

  const executeSelfTest = async () => {
    setIsRunning(true);
    try {
      const res = await runAdminSelfTestFn();
      setReport(res);
    } catch (err: any) {
      console.error("Self-test failed to execute:", err);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    void executeSelfTest();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedCheckId(expandedCheckId === id ? null : id);
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              Target System Self-Test & Diagnostic Suite
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated probes testing event contract adherence, balanced accounting, delivery SLAs, customer isolation, and HMAC authentication.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={executeSelfTest}
              disabled={isRunning}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs h-8"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Running Probes...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5" /> Run All Diagnostic Probes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Overview Banner */}
        {report && (
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              report.all_passed
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            <div className="flex items-center gap-3">
              {report.all_passed ? (
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
                  <XCircle className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="font-bold text-sm">
                  {report.all_passed
                    ? "ALL DIAGNOSTIC CHECKS PASSED"
                    : `${report.total_count - report.passed_count} CHECK(S) FAILED`}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5 font-mono">
                  Passed {report.passed_count} of {report.total_count} assertions · Completed at{" "}
                  {new Date(report.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                Score: {Math.round((report.passed_count / report.total_count) * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Checks Table */}
        <div className="rounded-lg border border-border/60 bg-zinc-950/60 overflow-hidden shadow-sm">
          <div className="divide-y divide-border/40 text-xs">
            {isRunning && !report ? (
              <div className="py-12 text-center text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                Executing diagnostic probes...
              </div>
            ) : report?.checks ? (
              report.checks.map((c: any) => {
                const isPass = c.status === "PASS";
                const isExpanded = expandedCheckId === c.id;

                return (
                  <div key={c.id} className="transition-colors hover:bg-zinc-900/30">
                    <div
                      className="p-4 flex items-start justify-between gap-4 cursor-pointer"
                      onClick={() => toggleExpand(c.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5">
                          {isPass ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <div className="font-semibold text-zinc-100 flex items-center gap-2">
                            {c.name}
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                                isPass
                                  ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30"
                                  : "bg-red-500/10 text-red-400 ring-1 ring-red-500/30"
                              }`}
                            >
                              {c.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400">{c.description}</p>
                          <div className="text-[11px] text-zinc-300 font-mono pt-1">
                            {c.message}
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-zinc-400 hover:text-white shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="px-11 pb-4 pt-1">
                        <div className="rounded border border-border/50 bg-black p-3 space-y-1.5">
                          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            Assertion Metrics & Diagnostics
                          </div>
                          <pre className="text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed">
                            {JSON.stringify(c.details, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : null}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
