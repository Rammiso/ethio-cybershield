import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import { getControlActionsFn, revertActionAdminFn } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  RotateCcw,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCode,
  Ban,
  UserX,
  Lock,
  Layers,
  Search,
  Filter,
} from "lucide-react";

interface ControlActionItem {
  id: string;
  action: string;
  target_public_id: string | null;
  reason: string | null;
  alert_ref: string | null;
  incident_ref: string | null;
  idempotency_key: string | null;
  requested_by_key_id: string | null;
  status: string;
  target_state: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const Route = createFileRoute("/admin/responses")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminResponsesPage,
});

function AdminResponsesPage() {
  const [actions, setActions] = useState<ControlActionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");

  // Revert Dialog state
  const [revertingAction, setRevertingAction] = useState<ControlActionItem | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [isSubmittingRevert, setIsSubmittingRevert] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [revertSuccess, setRevertSuccess] = useState<string | null>(null);

  // Payload Detail Dialog state
  const [inspectAction, setInspectAction] = useState<ControlActionItem | null>(null);

  const loadActions = async () => {
    setIsLoading(true);
    try {
      const res = await getControlActionsFn({ data: { limit: 100, offset: 0 } });
      setActions(res.actions as ControlActionItem[]);
      setTotal(res.total);
    } catch (err: unknown) {
      console.error("Failed to load control actions", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadActions();
  }, []);

  const handleOpenRevert = (action: ControlActionItem) => {
    setRevertingAction(action);
    setRevertReason(`Administrator manual revert of ${action.action}`);
    setRevertError(null);
    setRevertSuccess(null);
  };

  const handleExecuteRevert = async () => {
    if (!revertingAction) return;
    setIsSubmittingRevert(true);
    setRevertError(null);
    try {
      const res = await revertActionAdminFn({
        data: {
          controlActionId: revertingAction.id,
          reason: revertReason.trim() || undefined,
        },
      });

      if (res.status === "CONFIRMED") {
        setRevertSuccess(res.message || "Control action successfully reverted.");
        setRevertingAction(null);
        await loadActions();
      } else {
        setRevertError(res.message || "Failed to revert action.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Revert failed.";
      setRevertError(msg);
    } finally {
      setIsSubmittingRevert(false);
    }
  };

  // Filter actions
  const filteredActions = actions.filter((act) => {
    if (statusFilter !== "ALL" && act.status !== statusFilter) return false;
    if (actionFilter !== "ALL" && act.action !== actionFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTarget = act.target_public_id?.toLowerCase().includes(q);
      const matchReason = act.reason?.toLowerCase().includes(q);
      const matchAlert = act.alert_ref?.toLowerCase().includes(q);
      const matchIncident = act.incident_ref?.toLowerCase().includes(q);
      const matchKey = act.requested_by_key_id?.toLowerCase().includes(q);
      const matchAction = act.action.toLowerCase().includes(q);
      return matchTarget || matchReason || matchAlert || matchIncident || matchKey || matchAction;
    }
    return true;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case "FREEZE_TRANSACTION":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <ShieldAlert className="w-3 h-3" /> FREEZE_TX
          </span>
        );
      case "REVOKE_SESSION":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <UserX className="w-3 h-3" /> REVOKE_SESSION
          </span>
        );
      case "REQUIRE_STEP_UP":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Lock className="w-3 h-3" /> REQUIRE_STEP_UP
          </span>
        );
      case "DISABLE_BENEFICIARY":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Ban className="w-3 h-3" /> DISABLE_BEN
          </span>
        );
      case "BLOCK_IP":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Ban className="w-3 h-3" /> BLOCK_IP
          </span>
        );
      case "LOCK_ACCOUNT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            <Lock className="w-3 h-3" /> LOCK_ACCOUNT
          </span>
        );
      case "REVERT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-zinc-500/10 text-zinc-300 border border-zinc-500/20">
            <RotateCcw className="w-3 h-3" /> REVERT
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-zinc-800 text-zinc-300">
            {action}
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CONFIRMED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> CONFIRMED
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <XCircle className="w-3 h-3" /> REJECTED
          </span>
        );
      case "REVERTED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
            <RotateCcw className="w-3 h-3" /> REVERTED
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-3 h-3" /> FAILED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
            {status}
          </span>
        );
    }
  };

  const isReversible = (action: ControlActionItem) => {
    return (
      action.status === "CONFIRMED" &&
      ["FREEZE_TRANSACTION", "BLOCK_IP", "LOCK_ACCOUNT", "DISABLE_BENEFICIARY", "REQUIRE_STEP_UP"].includes(
        action.action,
      )
    );
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-500" /> Response Log & Control Telemetry
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live audit of all Ethio-Cyber Shield (ECS) mitigation actions, automated containment decisions, and manual operator overrides (§10 & §11).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadActions}
              disabled={isLoading}
              className="text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {revertSuccess && (
          <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <AlertTitle className="text-xs font-semibold">Revert Successful</AlertTitle>
            <AlertDescription className="text-xs mt-1">{revertSuccess}</AlertDescription>
          </Alert>
        )}

        {/* Stats Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-border/60 bg-card space-y-1">
            <div className="text-muted-foreground font-medium">Total Actions</div>
            <div className="text-xl font-bold font-mono text-foreground">{total}</div>
          </div>
          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1">
            <div className="text-emerald-500 font-medium">Confirmed / Enforced</div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {actions.filter((a) => a.status === "CONFIRMED").length}
            </div>
          </div>
          <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1">
            <div className="text-amber-500 font-medium">Rejected / Invalid</div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {actions.filter((a) => a.status === "REJECTED").length}
            </div>
          </div>
          <div className="p-3 rounded-xl border border-zinc-700 bg-card space-y-1">
            <div className="text-muted-foreground font-medium">Reverted Actions</div>
            <div className="text-xl font-bold font-mono text-zinc-300">
              {actions.filter((a) => a.status === "REVERTED").length}
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search target, reason, alert ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border/60 bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Filter className="w-3 h-3" />
              <span>Status:</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-border/60 bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="REVERTED">REVERTED</option>
              <option value="FAILED">FAILED</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-border/60 bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">All Actions</option>
              <option value="FREEZE_TRANSACTION">FREEZE_TRANSACTION</option>
              <option value="REVOKE_SESSION">REVOKE_SESSION</option>
              <option value="REQUIRE_STEP_UP">REQUIRE_STEP_UP</option>
              <option value="DISABLE_BENEFICIARY">DISABLE_BENEFICIARY</option>
              <option value="BLOCK_IP">BLOCK_IP</option>
              <option value="LOCK_ACCOUNT">LOCK_ACCOUNT</option>
              <option value="REVERT">REVERT</option>
            </select>
          </div>
        </div>

        {/* Responses Table Card */}
        <Card className="border-border/60">
          <CardHeader className="py-3 px-4 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" /> Control Actions History
              </CardTitle>
              <span className="text-xs text-muted-foreground font-mono">
                Showing {filteredActions.length} of {total} records
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/40 hover:bg-transparent">
                  <TableHead className="w-[150px] text-xs">Timestamp</TableHead>
                  <TableHead className="w-[140px] text-xs">Action</TableHead>
                  <TableHead className="w-[120px] text-xs">Status</TableHead>
                  <TableHead className="text-xs">Target Ref</TableHead>
                  <TableHead className="text-xs">Alert / Incident</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs">Caller Key</TableHead>
                  <TableHead className="text-right text-xs">Operations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                      {isLoading ? (
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                          <span>Loading control actions...</span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">No control actions recorded</p>
                          <p className="text-[11px]">
                            Mitigation actions invoked by Ethio-Cyber Shield (ECS) or test runs will be listed here.
                          </p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredActions.map((act) => (
                    <TableRow key={act.id} className="border-b border-border/30 hover:bg-muted/30">
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {new Date(act.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                      </TableCell>
                      <TableCell>{getActionBadge(act.action)}</TableCell>
                      <TableCell>{getStatusBadge(act.status)}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {act.target_public_id ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 font-mono text-[11px]">
                          {act.alert_ref && (
                            <div className="text-amber-500/90 font-medium">
                              Alert: {act.alert_ref}
                            </div>
                          )}
                          {act.incident_ref && (
                            <div className="text-blue-400 font-medium">
                              Inc: {act.incident_ref}
                            </div>
                          )}
                          {!act.alert_ref && !act.incident_ref && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div
                          className="text-xs text-muted-foreground max-w-[200px] truncate"
                          title={act.reason ?? undefined}
                        >
                          {act.reason ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[11px] text-zinc-400">
                          {act.requested_by_key_id ? act.requested_by_key_id.slice(0, 16) + "..." : "internal"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Inspect State */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInspectAction(act)}
                            className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            title="Inspect Target State"
                          >
                            <FileCode className="w-3.5 h-3.5" />
                          </Button>

                          {/* Revert Action */}
                          {isReversible(act) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenRevert(act)}
                              className="h-7 px-2.5 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" /> Revert
                            </Button>
                          )}

                          {act.status === "REVERTED" && (
                            <span className="text-[11px] font-mono text-zinc-500 px-2 py-0.5">
                              Reverted
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Modal: Revert Confirmation */}
        <Dialog open={!!revertingAction} onOpenChange={(open) => !open && setRevertingAction(null)}>
          <DialogContent className="max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-400">
                <RotateCcw className="w-4 h-4" /> Revert Control Action
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                Are you sure you want to revert action <strong>{revertingAction?.action}</strong> on target{" "}
                <code className="font-mono text-zinc-200">{revertingAction?.target_public_id}</code>?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Policy Reversal Note
                </p>
                <p className="text-[11px] leading-relaxed">
                  Reverting this action will restore customer state (e.g. unblock IP, unlock account, re-enable beneficiary, cancel frozen hold) and record a corresponding <code>RESPONSE_EXECUTED</code> event.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">Reversal Reason</label>
                <input
                  type="text"
                  value={revertReason}
                  onChange={(e) => setRevertReason(e.target.value)}
                  placeholder="e.g. False positive confirmed by SOC tier 2"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {revertError && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-xs font-semibold">Error</AlertTitle>
                  <AlertDescription className="text-xs mt-0.5">{revertError}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevertingAction(null)}
                disabled={isSubmittingRevert}
                className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteRevert}
                disabled={isSubmittingRevert}
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                {isSubmittingRevert ? "Reverting..." : "Confirm Revert"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Target State JSON Inspection */}
        <Dialog open={!!inspectAction} onOpenChange={(open) => !open && setInspectAction(null)}>
          <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800 text-zinc-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-zinc-100">
                <FileCode className="w-4 h-4 text-amber-500" /> Action Payload & Target State
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400 font-mono">
                Action ID: {inspectAction?.id}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div>
                <span className="text-zinc-400 block mb-1 font-semibold">target_state (jsonb)</span>
                <pre className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[11px] overflow-auto max-h-48 text-emerald-400">
                  {JSON.stringify(inspectAction?.target_state ?? {}, null, 2)}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400 block">Idempotency Key:</span>
                  <span className="font-mono text-zinc-200 truncate block">
                    {inspectAction?.idempotency_key ?? "none"}
                  </span>
                </div>
                <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400 block">Key ID:</span>
                  <span className="font-mono text-zinc-200 truncate block">
                    {inspectAction?.requested_by_key_id ?? "internal"}
                  </span>
                </div>
              </div>

              {inspectAction?.error && (
                <div>
                  <span className="text-rose-400 block mb-1 font-semibold">error</span>
                  <pre className="p-2 rounded bg-rose-950/40 border border-rose-900 font-mono text-[11px] text-rose-300">
                    {inspectAction.error}
                  </pre>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectAction(null)}
                className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminShell>
  );
}
