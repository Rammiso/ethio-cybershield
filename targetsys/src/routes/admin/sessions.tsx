import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import {
  getAdminSessionsDevicesFn,
  adminRevokeSingleSessionFn,
} from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import {
  Laptop,
  Users,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Smartphone,
  Globe,
} from "lucide-react";

export const Route = createFileRoute("/admin/sessions")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminSessionsDevicesPage,
});

function AdminSessionsDevicesPage() {
  const [data, setData] = useState<{ sessions: any[]; shared_devices: any[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sessions" | "devices">("sessions");
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await getAdminSessionsDevicesFn();
      setData(res);
    } catch (err: any) {
      console.error("Failed to load sessions & devices:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const res = await adminRevokeSingleSessionFn({ data: { sessionId } });
      if (res.ok) {
        setActionMessage({ type: "success", text: "Session revoked immediately." });
        await loadData();
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to revoke session" });
    }
  };

  const sessions = data?.sessions ?? [];
  const sharedDevices = data?.shared_devices ?? [];

  return (
    <AdminShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Laptop className="w-5 h-5 text-amber-500" />
              Active Sessions & Shared Devices
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inspect live customer sessions and detect cross-account hardware reuse / syndicate indicators.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Action Message */}
        {actionMessage && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              actionMessage.type === "success"
                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                : "bg-red-500/10 text-red-300 border border-red-500/30"
            }`}
          >
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          <Button
            size="sm"
            variant={activeTab === "sessions" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("sessions")}
            className="text-xs font-semibold"
          >
            <Globe className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            Active Sessions ({sessions.length})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "devices" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("devices")}
            className="text-xs font-semibold"
          >
            <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            Shared Devices ({sharedDevices.length})
          </Button>
        </div>

        {/* Tab 1: Active Sessions */}
        {activeTab === "sessions" && (
          <div className="rounded-lg border border-border/60 bg-zinc-950/60 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900/80 text-zinc-400 border-b border-border/60 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 font-sans">Session ID</th>
                    <th className="py-2.5 px-3 font-sans">User</th>
                    <th className="py-2.5 px-3 font-sans">IP Address</th>
                    <th className="py-2.5 px-3 font-sans">User Agent</th>
                    <th className="py-2.5 px-3 font-sans">Expires</th>
                    <th className="py-2.5 px-3 text-right font-sans">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground font-sans">
                        <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                        Loading active sessions...
                      </td>
                    </tr>
                  ) : sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground font-sans">
                        No active sessions recorded in the database.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3 px-3 text-zinc-300">
                          {s.id.slice(0, 16)}...
                        </td>
                        <td className="py-3 px-3 text-zinc-100 font-sans">
                          <div className="font-semibold">{s.user_email || s.user_id}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">{s.user_id_pub}</div>
                        </td>
                        <td className="py-3 px-3 text-emerald-400">{s.ip || "127.0.0.1"}</td>
                        <td className="py-3 px-3 text-zinc-400 text-[11px] truncate max-w-xs font-sans">
                          {s.user_agent}
                        </td>
                        <td className="py-3 px-3 text-zinc-400 text-[11px]">
                          {new Date(s.expires_at).toLocaleDateString()}{" "}
                          {new Date(s.expires_at).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRevokeSession(s.id)}
                            className="h-7 px-2 text-[11px] border-zinc-800 text-red-400 hover:bg-red-950/40 font-sans"
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Revoke
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Shared Devices */}
        {activeTab === "devices" && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                Analyzing cross-account device records...
              </div>
            ) : sharedDevices.length === 0 ? (
              <div className="rounded-lg border border-border/60 bg-zinc-950/60 p-8 text-center text-xs text-muted-foreground">
                No shared devices detected. All registered devices belong to unique single accounts.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sharedDevices.map((dev: any) => (
                  <div
                    key={dev.device_hash}
                    className="rounded-lg border border-amber-500/30 bg-zinc-950/80 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-sm text-zinc-100">{dev.device_name || "Client Browser"}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
                        {dev.accounts?.length} Accounts Linked
                      </span>
                    </div>

                    <div className="text-xs font-mono text-zinc-400">
                      Hash: <span className="text-zinc-200">{dev.device_hash}</span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-semibold text-zinc-400 uppercase font-mono">
                        Associated Accounts:
                      </div>
                      <div className="space-y-1">
                        {dev.accounts?.map((acc: any) => (
                          <div
                            key={acc.user_public_id}
                            className="p-2 rounded bg-zinc-900/60 border border-border/40 flex items-center justify-between text-xs font-mono"
                          >
                            <span className="text-zinc-200 font-sans">{acc.email || acc.user_public_id}</span>
                            <span className="text-[10px] text-zinc-500">{acc.user_public_id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
