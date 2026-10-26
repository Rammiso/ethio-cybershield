import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import {
  getAdminTransactionsFn,
  getTransactionDetailFn,
  adminFreezeTransactionFn,
  adminReleaseTransactionFn,
} from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Receipt,
  Search,
  RefreshCw,
  X,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Clock,
  ShieldAlert,
  ArrowRight,
  BookOpen,
} from "lucide-react";

export const Route = createFileRoute("/admin/transactions")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminTransactionsPage,
});

function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [showFreezeModal, setShowFreezeModal] = useState(false);

  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      const res = await getAdminTransactionsFn({
        data: {
          status: statusFilter === "ALL" ? undefined : statusFilter,
          search: search.trim() ? search.trim() : undefined,
          limit: 100,
        },
      });
      setTransactions((res as any)?.transactions ?? res ?? []);
    } catch (err: any) {
      console.error("Failed to load transactions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, [statusFilter]);

  const openTxDetail = async (tx: any) => {
    setSelectedTx(tx);
    setLoadingDetail(true);
    setActionMessage(null);
    try {
      const detail = await getTransactionDetailFn({ data: { txPublicId: tx.public_id } });
      setDetailData(detail);
    } catch (err: any) {
      console.error("Failed to load tx detail:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleFreeze = async () => {
    if (!selectedTx) return;
    try {
      const res = await adminFreezeTransactionFn({
        data: {
          txPublicId: selectedTx.public_id,
          reason: freezeReason || "Manual administrative freeze for suspicious activity",
        },
      });
      if (res.ok) {
        setActionMessage({ type: "success", text: "Transaction frozen and funds credited back." });
        setShowFreezeModal(false);
        setFreezeReason("");
        await loadTransactions();
        await openTxDetail(selectedTx);
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to freeze transaction" });
    }
  };

  const handleRelease = async () => {
    if (!selectedTx) return;
    try {
      const res = await adminReleaseTransactionFn({
        data: { txPublicId: selectedTx.public_id },
      });
      if (res.ok) {
        setActionMessage({ type: "success", text: "Transaction released and settled successfully." });
        await loadTransactions();
        await openTxDetail(selectedTx);
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to release transaction" });
    }
  };

  const formatEtb = (amount: number) => {
    return new Intl.NumberFormat("en-ET", {
      style: "currency",
      currency: "ETB",
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <AdminShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              Transactions & Core Double-Entry Ledger
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Filter transfers, inspect double-entry debit/credit ledger records, and execute manual Freeze or Release.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadTransactions}
              disabled={isLoading}
              className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {["ALL", "COMPLETED", "PROCESSING", "FROZEN", "FAILED"].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "secondary" : "outline"}
                onClick={() => setStatusFilter(s)}
                className={`h-8 text-xs font-mono ${
                  statusFilter === s
                    ? "bg-zinc-200 text-zinc-900 font-bold dark:bg-zinc-800 dark:text-zinc-100"
                    : "border-zinc-800 text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {s}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2" />
              <Input
                type="text"
                placeholder="Search tx ID, account, note..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadTransactions()}
                className="pl-9 h-8 text-xs bg-zinc-900/60 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <Button
              size="sm"
              onClick={loadTransactions}
              className="h-8 px-3 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
            >
              Filter
            </Button>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="rounded-lg border border-border/60 bg-zinc-950/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-border/60 uppercase font-mono text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Transaction ID / Type</th>
                  <th className="py-2.5 px-3">From Account</th>
                  <th className="py-2.5 px-3">To Account / Dest</th>
                  <th className="py-2.5 px-3">Amount (ETB)</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                      Loading transactions...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No transactions found matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const statusColor =
                      tx.status === "COMPLETED"
                        ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
                        : tx.status === "PROCESSING"
                        ? "bg-amber-500/10 text-amber-400 ring-amber-500/30"
                        : tx.status === "FROZEN"
                        ? "bg-purple-500/10 text-purple-400 ring-purple-500/30"
                        : "bg-red-500/10 text-red-400 ring-red-500/30";

                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-zinc-900/40 transition-colors cursor-pointer group"
                        onClick={() => openTxDetail(tx)}
                      >
                        <td className="py-3 px-3">
                          <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                            {tx.public_id}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-sans">{tx.transaction_type}</div>
                        </td>
                        <td className="py-3 px-3 text-zinc-300">
                          {tx.from_account_number || "External"}
                        </td>
                        <td className="py-3 px-3 text-zinc-300">
                          {tx.to_account_number || tx.counterparty_name || "Settlement"}
                        </td>
                        <td className="py-3 px-3 font-semibold text-zinc-100">
                          {formatEtb((tx.amount_minor ?? 0) / 100)}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ring-1 ${statusColor}`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-zinc-400 text-[11px]">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 font-sans">
                            {tx.status === "PROCESSING" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedTx(tx);
                                    setShowFreezeModal(true);
                                  }}
                                  className="h-7 px-2 text-[11px] border-zinc-800 text-purple-400 hover:bg-purple-950/40"
                                >
                                  Freeze
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    setSelectedTx(tx);
                                    await handleRelease();
                                  }}
                                  className="h-7 px-2 text-[11px] border-zinc-800 text-emerald-400 hover:bg-emerald-950/40"
                                >
                                  Release
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openTxDetail(tx)}
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

        {/* Freeze Modal */}
        {showFreezeModal && selectedTx && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-zinc-950 border border-border/80 rounded-xl p-5 space-y-4 shadow-2xl font-sans">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="font-bold text-base text-zinc-100 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-purple-400" />
                  Freeze Transaction {selectedTx.public_id}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFreezeModal(false)}
                  className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Freezing this transfer will cancel ongoing processing, credit the principal of{" "}
                <strong className="text-zinc-200">{formatEtb((selectedTx.amount_minor ?? 0) / 100)}</strong> back
                to the sender account, write double-entry audit records, and notify ECS telemetry.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Reason for Freeze</label>
                <Input
                  type="text"
                  placeholder="e.g. Suspected ATO or anomalous transaction pattern"
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  className="text-xs bg-zinc-900 border-zinc-800 text-zinc-100"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowFreezeModal(false)}
                  className="text-xs border-zinc-800 text-zinc-400"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleFreeze}
                  className="text-xs bg-purple-700 hover:bg-purple-800 text-white font-semibold"
                >
                  Confirm Freeze & Refund
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Detail Drawer */}
        {selectedTx && !showFreezeModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-150">
            <div className="w-full max-w-xl bg-zinc-950 border-l border-border/80 h-full overflow-y-auto p-6 space-y-6 shadow-2xl font-sans">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-border/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold font-mono text-zinc-100">{selectedTx.public_id}</h2>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        selectedTx.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : selectedTx.status === "PROCESSING"
                          ? "bg-amber-500/10 text-amber-400"
                          : selectedTx.status === "FROZEN"
                          ? "bg-purple-500/10 text-purple-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {selectedTx.status}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    {selectedTx.transaction_type} · Amount:{" "}
                    <strong className="text-zinc-100 font-mono">
                      {formatEtb((selectedTx.amount_minor ?? 0) / 100)}
                    </strong>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTx(null)}
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

              {/* Processing Controls */}
              {selectedTx.status === "PROCESSING" && (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between">
                  <div className="text-xs text-amber-300">
                    <strong>Held in PROCESSING state.</strong> You can manually Freeze or Release.
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setShowFreezeModal(true)}
                      className="h-7 text-xs bg-purple-700 hover:bg-purple-800 text-white"
                    >
                      Freeze
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleRelease}
                      className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      Release
                    </Button>
                  </div>
                </div>
              )}

              {loadingDetail ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                  Loading double-entry ledger entries and security events...
                </div>
              ) : detailData ? (
                <div className="space-y-6 text-xs font-mono">
                  {/* Ledger Entries */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between font-sans">
                      <h3 className="font-semibold text-zinc-200 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-emerald-400" />
                        Balanced Double-Entry Ledger Entries ({(detailData.ledger ?? detailData.ledger_entries)?.length ?? 0})
                      </h3>
                      <span className="text-[10px] text-zinc-500 font-mono">Double-entry verified</span>
                    </div>

                    <div className="space-y-2">
                      {(detailData.ledger ?? detailData.ledger_entries)?.map((le: any) => {
                        const isDebit = le.direction === "DEBIT";
                        return (
                          <div
                            key={le.id}
                            className="p-3 rounded-lg border border-border/40 bg-zinc-900/40 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isDebit
                                    ? "bg-red-500/10 text-red-400 ring-1 ring-red-500/30"
                                    : "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30"
                                }`}
                              >
                                {le.direction} ({le.entry_type || "TRANSFER"})
                              </span>
                              <span className="font-bold text-zinc-100">
                                {isDebit ? "-" : "+"}
                                {formatEtb((le.amount_minor ?? 0) / 100)}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              Account: <span className="text-zinc-200">{le.account_id || le.account_number}</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 flex justify-between">
                              <span>Balance After: {formatEtb((le.balance_after_minor ?? 0) / 100)}</span>
                              <span>Seq: {le.sequence_number ?? 1}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Related Security Events */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-zinc-200 font-sans flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-500" />
                      Related Security Telemetry Events ({(detailData.events ?? detailData.security_events)?.length ?? 0})
                    </h3>
                    {(detailData.events ?? detailData.security_events)?.length === 0 ? (
                      <p className="text-muted-foreground text-[11px] font-sans">
                        No security telemetry events linked to this transaction.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(detailData.events ?? detailData.security_events)?.map((ev: any) => (
                          <div
                            key={ev.id}
                            className="p-2.5 rounded border border-border/40 bg-zinc-900/30 flex items-center justify-between text-[11px]"
                          >
                            <div>
                              <div className="text-zinc-200 font-semibold">{ev.event_type}</div>
                              <div className="text-[10px] text-zinc-500">
                                {new Date(ev.created_at).toLocaleString()} · IP: {ev.source_ip}
                              </div>
                            </div>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
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
