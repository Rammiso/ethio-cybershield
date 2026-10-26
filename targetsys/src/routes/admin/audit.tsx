import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import { getAdminAuditLogsFn } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import {
  FileText,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  UserCheck,
  Server,
} from "lucide-react";

export const Route = createFileRoute("/admin/audit")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminAuditLogsPage,
});

function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadAuditLogs = async () => {
    setIsLoading(true);
    try {
      const res = await getAdminAuditLogsFn({ data: { limit: 100 } });
      setLogs((res as any)?.logs ?? res ?? []);
    } catch (err: any) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAuditLogs();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <AdminShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-500" />
              Administrative Audit Log (Append-Only)
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Immutable ledger of all operator mutations, posture shifts, session revocations, and IP mitigations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAuditLogs}
              disabled={isLoading}
              className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="rounded-lg border border-border/60 bg-zinc-950/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-border/60 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 font-sans">Timestamp</th>
                  <th className="py-2.5 px-3 font-sans">Actor</th>
                  <th className="py-2.5 px-3 font-sans">Action</th>
                  <th className="py-2.5 px-3 font-sans">Target Entity</th>
                  <th className="py-2.5 px-3 font-sans">IP Address</th>
                  <th className="py-2.5 px-3 text-right font-sans">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground font-sans">
                      <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                      Loading audit records...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground font-sans">
                      No administrative audit records logged yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    const isSystem = log.actor_type === "SYSTEM";

                    return (
                      <tbody key={log.id} className="divide-y divide-border/20">
                        <tr
                          className="hover:bg-zinc-900/40 transition-colors cursor-pointer"
                          onClick={() => toggleExpand(log.id)}
                        >
                          <td className="py-3 px-3 text-zinc-400 text-[11px]">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                isSystem
                                  ? "bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/30"
                                  : "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30"
                              }`}
                            >
                              {isSystem ? (
                                <>
                                  <Server className="w-3 h-3" /> SYSTEM
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3 h-3" /> ADMIN
                                </>
                              )}
                            </span>
                            <div className="text-[10px] text-zinc-500 mt-0.5">{log.actor_id}</div>
                          </td>
                          <td className="py-3 px-3 font-semibold text-zinc-200">
                            {log.action}
                          </td>
                          <td className="py-3 px-3 text-zinc-300">
                            {log.entity_type}: <span className="text-zinc-500">{log.entity_id}</span>
                          </td>
                          <td className="py-3 px-3 text-emerald-400">
                            {log.ip || "127.0.0.1"}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-zinc-950/80">
                            <td colSpan={6} className="p-3">
                              <div className="rounded border border-border/50 bg-black p-3 space-y-2">
                                <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                  Audit Details (JSON)
                                </div>
                                <pre className="text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed max-h-60">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
