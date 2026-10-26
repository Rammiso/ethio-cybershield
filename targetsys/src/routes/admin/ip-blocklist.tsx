import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import {
  getAdminIpBlocklistFn,
  adminAddBlockedIpFn,
  adminRemoveBlockedIpFn,
} from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Ban,
  Plus,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Clock,
  X,
  Server,
  UserCheck,
} from "lucide-react";

export const Route = createFileRoute("/admin/ip-blocklist")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminIpBlocklistPage,
});

function AdminIpBlocklistPage() {
  const [blockedIps, setBlockedIps] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newDurationHours, setNewDurationHours] = useState(24);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadBlocklist = async () => {
    setIsLoading(true);
    try {
      const res = await getAdminIpBlocklistFn();
      setBlockedIps(res ?? []);
    } catch (err: any) {
      console.error("Failed to load IP blocklist:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBlocklist();
  }, []);

  const handleAddIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIp.trim()) return;
    setIsSubmitting(true);
    setActionMessage(null);
    try {
      const res = await adminAddBlockedIpFn({
        data: {
          ip: newIp.trim(),
          reason: newReason.trim() || "Manual administrator block",
          durationMinutes: newDurationHours * 60,
        },
      });
      if (res.ok) {
        setActionMessage({ type: "success", text: `IP ${newIp} blocked successfully.` });
        setShowAddModal(false);
        setNewIp("");
        setNewReason("");
        await loadBlocklist();
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to add IP block" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveIp = async (ip: string) => {
    try {
      const res = await adminRemoveBlockedIpFn({ data: { ip } });
      if (res.ok) {
        setActionMessage({ type: "success", text: `IP ${ip} unblocked successfully.` });
        await loadBlocklist();
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to unblock IP" });
    }
  };

  return (
    <AdminShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              IP Access Control & Blocklist
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage proactive administrative IP bans and automated containment blocks executed by ECS.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="text-xs bg-red-700 hover:bg-red-800 text-white h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Block IP Address
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadBlocklist}
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

        {/* Blocked IPs Table */}
        <div className="rounded-lg border border-border/60 bg-zinc-950/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-border/60 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 font-sans">IP Address</th>
                  <th className="py-2.5 px-3 font-sans">Source</th>
                  <th className="py-2.5 px-3 font-sans">Reason / Notes</th>
                  <th className="py-2.5 px-3 font-sans">Blocked At</th>
                  <th className="py-2.5 px-3 font-sans">Expires At</th>
                  <th className="py-2.5 px-3 text-right font-sans">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground font-sans">
                      <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                      Loading blocked IP addresses...
                    </td>
                  </tr>
                ) : blockedIps.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground font-sans">
                      No blocked IP addresses currently enforced.
                    </td>
                  </tr>
                ) : (
                  blockedIps.map((entry) => {
                    const isEcs = entry.source === "ECS";
                    return (
                      <tr key={entry.id || entry.ip} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3 px-3 font-bold text-red-400">{entry.ip}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1 ${
                              isEcs
                                ? "bg-purple-500/10 text-purple-400 ring-purple-500/30"
                                : "bg-blue-500/10 text-blue-400 ring-blue-500/30"
                            }`}
                          >
                            {isEcs ? (
                              <>
                                <Server className="w-3 h-3" /> ECS
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3 h-3" /> ADMIN
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-zinc-300 font-sans">{entry.reason}</td>
                        <td className="py-3 px-3 text-zinc-400 text-[11px]">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-zinc-400 text-[11px]">
                          {entry.expires_at ? new Date(entry.expires_at).toLocaleString() : "Permanent"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemoveIp(entry.ip)}
                            className="h-7 px-2 text-[11px] border-zinc-800 text-zinc-300 hover:text-red-400 font-sans"
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Unblock
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={handleAddIp}
              className="w-full max-w-md bg-zinc-950 border border-border/80 rounded-xl p-5 space-y-4 shadow-2xl font-sans"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="font-bold text-base text-zinc-100 flex items-center gap-2">
                  <Ban className="w-5 h-5 text-red-500" />
                  Add IP Block
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-medium text-zinc-300">Target IP Address</label>
                  <Input
                    type="text"
                    placeholder="e.g. 196.188.12.44"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    required
                    className="font-mono bg-zinc-900 border-zinc-800 text-zinc-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-zinc-300">Reason / Justification</label>
                  <Input
                    type="text"
                    placeholder="e.g. Brute force credential stuffing source"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-zinc-300">Duration (Hours)</label>
                  <Input
                    type="number"
                    min="1"
                    max="8760"
                    value={newDurationHours}
                    onChange={(e) => setNewDurationHours(parseInt(e.target.value) || 24)}
                    className="font-mono bg-zinc-900 border-zinc-800 text-zinc-100"
                  />
                  <p className="text-[10px] text-muted-foreground">Default: 24 hours (1440 minutes)</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs border-zinc-800 text-zinc-400"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="text-xs bg-red-700 hover:bg-red-800 text-white font-semibold"
                >
                  {isSubmitting ? "Enforcing..." : "Enforce Block"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
