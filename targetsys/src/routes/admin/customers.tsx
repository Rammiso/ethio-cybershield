import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import {
  getAdminCustomersFn,
  getCustomerDetailFn,
  adminLockUnlockAccountFn,
  adminRevokeUserSessionsFn,
} from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  Search,
  Lock,
  Unlock,
  ShieldAlert,
  Laptop,
  CreditCard,
  Clock,
  RefreshCw,
  X,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/admin/customers")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminCustomersPage,
});

function AdminCustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadCustomers = async (searchTerm = search) => {
    setIsLoading(true);
    try {
      const res = await getAdminCustomersFn({ data: { search: searchTerm } });
      setCustomers(res ?? []);
    } catch (err: any) {
      console.error("Failed to load customers:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const openCustomerDetail = async (cust: any) => {
    setSelectedUser(cust);
    setLoadingDetail(true);
    setActionMessage(null);
    try {
      const detail = await getCustomerDetailFn({ data: { userPublicId: cust.public_id } });
      setDetailData(detail);
    } catch (err: any) {
      console.error("Failed to load customer detail:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleToggleLock = async (userPublicId: string, currentLocked: boolean) => {
    try {
      const res = await adminLockUnlockAccountFn({
        data: {
          accountOrUserPublicId: userPublicId,
          lock: !currentLocked,
          reason: !currentLocked ? "Administrative lockout" : "Administrative unlock",
        },
      });
      if (res.ok) {
        setActionMessage({
          type: "success",
          text: !currentLocked ? "Account locked successfully" : "Account unlocked successfully",
        });
        await loadCustomers();
        if (selectedUser?.public_id === userPublicId) {
          await openCustomerDetail({ ...selectedUser, is_locked: !currentLocked });
        }
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to toggle account lock state" });
    }
  };

  const handleRevokeSessions = async (userPublicId: string) => {
    try {
      const res = await adminRevokeUserSessionsFn({
        data: { userPublicId },
      });
      if (res.ok) {
        setActionMessage({
          type: "success",
          text: `Revoked ${res.revokedCount} session(s)`,
        });
        await loadCustomers();
        if (selectedUser?.public_id === userPublicId) {
          await openCustomerDetail(selectedUser);
        }
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to revoke sessions" });
    }
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
      <div className="space-y-4">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              Customer Accounts & Profiles
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inspect user ledger accounts, devices, active sessions, and enforce administrative locks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadCustomers()}
              disabled={isLoading}
              className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search Controls */}
        <div className="flex items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
            <Input
              type="text"
              placeholder="Search by name, email, phone, or public ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadCustomers(search)}
              className="pl-9 h-9 text-xs bg-zinc-900/60 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <Button
            size="sm"
            onClick={() => loadCustomers(search)}
            className="h-9 px-3 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
          >
            Search
          </Button>
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                void loadCustomers("");
              }}
              className="h-9 px-2 text-xs text-zinc-400 hover:text-zinc-100"
            >
              Reset
            </Button>
          )}
        </div>

        {/* Customers Table */}
        <div className="rounded-lg border border-border/60 bg-zinc-950/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-border/60 uppercase font-mono text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Customer ID / Name</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3">Total Balance</th>
                  <th className="py-2.5 px-3">Accounts</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Active Sessions</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                      Loading customer records...
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No customers found matching search criteria.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => {
                    const isLocked = Boolean(c.is_locked);
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-zinc-900/40 transition-colors cursor-pointer group"
                        onClick={() => openCustomerDetail(c)}
                      >
                        <td className="py-3 px-3">
                          <div className="font-semibold text-zinc-100 flex items-center gap-1.5 font-sans">
                            {c.full_name || "Unknown Customer"}
                            {c.role === "admin" && (
                              <span className="text-[10px] px-1 py-0.2 bg-blue-500/20 text-blue-400 rounded ring-1 ring-blue-500/30">
                                ADMIN
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400">{c.public_id}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-zinc-200">{c.email}</div>
                          <div className="text-[11px] text-zinc-500">{c.phone || "No phone"}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-emerald-400">
                          {formatEtb(c.total_balance_etb ?? 0)}
                        </td>
                        <td className="py-3 px-3 text-zinc-300">
                          {c.accounts_count ?? 1} account(s)
                        </td>
                        <td className="py-3 px-3">
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 ring-1 ring-red-500/30">
                              <Lock className="w-3 h-3" /> Locked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" /> Active
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-zinc-300">
                          <span className="inline-flex items-center gap-1">
                            <Laptop className="w-3.5 h-3.5 text-zinc-500" />
                            {c.active_sessions_count ?? 0}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 font-sans">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleLock(c.public_id, isLocked)}
                              className={`h-7 px-2 text-[11px] border-zinc-800 ${
                                isLocked
                                  ? "text-emerald-400 hover:bg-emerald-950/40"
                                  : "text-red-400 hover:bg-red-950/40"
                              }`}
                            >
                              {isLocked ? (
                                <>
                                  <Unlock className="w-3 h-3 mr-1" /> Unlock
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3 mr-1" /> Lock
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openCustomerDetail(c)}
                              className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Modal / Side Drawer */}
        {selectedUser && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-150">
            <div className="w-full max-w-xl bg-zinc-950 border-l border-border/80 h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-border/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-zinc-100">{selectedUser.full_name}</h2>
                    {selectedUser.is_locked ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-500/10 text-red-400 ring-1 ring-red-500/30">
                        LOCKED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-zinc-400 mt-0.5">{selectedUser.email}</div>
                  <div className="text-xs font-mono text-zinc-500">Public ID: {selectedUser.public_id}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUser(null)}
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Status Message */}
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

              {/* Actions Bar */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleLock(selectedUser.public_id, Boolean(selectedUser.is_locked))}
                  className={`text-xs border-zinc-800 ${
                    selectedUser.is_locked
                      ? "bg-emerald-950/20 text-emerald-300 hover:bg-emerald-900/40"
                      : "bg-red-950/20 text-red-300 hover:bg-red-900/40"
                  }`}
                >
                  {selectedUser.is_locked ? (
                    <>
                      <Unlock className="w-3.5 h-3.5 mr-1.5" /> Unlock Account
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 mr-1.5" /> Lock Account
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRevokeSessions(selectedUser.public_id)}
                  className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-red-400"
                >
                  <Laptop className="w-3.5 h-3.5 mr-1.5" /> Revoke All Active Sessions
                </Button>
              </div>

              {loadingDetail ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                  Loading accounts, devices & security log...
                </div>
              ) : detailData ? (
                <div className="space-y-6 text-xs">
                  {/* Accounts List */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-amber-500" />
                      Deposit & Ledger Accounts ({detailData.accounts?.length ?? 0})
                    </h3>
                    <div className="space-y-2">
                      {detailData.accounts?.map((acc: any) => (
                        <div
                          key={acc.id}
                          className="p-3 rounded-lg border border-border/50 bg-zinc-900/40 flex items-center justify-between font-mono"
                        >
                          <div>
                            <div className="font-semibold text-zinc-100">{acc.account_number}</div>
                            <div className="text-[11px] text-zinc-500 uppercase">{acc.account_type || "SAVINGS"} · ID: {acc.public_id}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-emerald-400 text-sm">
                              {formatEtb((acc.balance_minor ?? 0) / 100)}
                            </div>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                              {acc.status || "ACTIVE"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active Sessions */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Laptop className="w-4 h-4 text-blue-500" />
                      Active Sessions ({detailData.sessions?.length ?? 0})
                    </h3>
                    {detailData.sessions?.length === 0 ? (
                      <p className="text-muted-foreground text-[11px]">No active sessions.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detailData.sessions?.map((s: any) => (
                          <div
                            key={s.id}
                            className="p-2.5 rounded border border-border/40 bg-zinc-900/30 flex items-center justify-between font-mono text-[11px]"
                          >
                            <div>
                              <div className="text-zinc-200">IP: {s.ip || "Unknown"}</div>
                              <div className="text-zinc-500 text-[10px] truncate max-w-xs">{s.user_agent}</div>
                            </div>
                            <div className="text-right text-[10px] text-zinc-400">
                              Expires: {new Date(s.expires_at).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Registered Devices */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-purple-500" />
                      Registered / Trusted Devices ({detailData.devices?.length ?? 0})
                    </h3>
                    {detailData.devices?.length === 0 ? (
                      <p className="text-muted-foreground text-[11px]">No device records recorded.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detailData.devices?.map((d: any) => (
                          <div
                            key={d.id}
                            className="p-2.5 rounded border border-border/40 bg-zinc-900/30 flex items-center justify-between font-mono text-[11px]"
                          >
                            <div>
                              <div className="text-zinc-200 font-semibold">{d.device_name || "Browser Client"}</div>
                              <div className="text-zinc-500 text-[10px]">Hash: {d.device_hash?.slice(0, 16)}...</div>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400">
                              TRUSTED
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent Security Events */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-emerald-500" />
                      Recent Security Events ({detailData.recent_events?.length ?? 0})
                    </h3>
                    {detailData.recent_events?.length === 0 ? (
                      <p className="text-muted-foreground text-[11px]">No recent security events.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detailData.recent_events?.map((ev: any) => (
                          <div
                            key={ev.id}
                            className="p-2 rounded border border-border/40 bg-zinc-900/30 font-mono text-[11px] flex items-center justify-between"
                          >
                            <div>
                              <span className="font-semibold text-zinc-200">{ev.event_type}</span>
                              <div className="text-[10px] text-zinc-500">
                                {new Date(ev.created_at).toLocaleTimeString()} · IP: {ev.source_ip}
                              </div>
                            </div>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                ev.result === "SUCCESS"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : ev.result === "BLOCKED" || ev.result === "FAILED"
                                  ? "bg-red-500/10 text-red-400"
                                  : "bg-amber-500/10 text-amber-400"
                              }`}
                            >
                              {ev.result}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
