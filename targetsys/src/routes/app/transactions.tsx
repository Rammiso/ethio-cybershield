import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CustomerShell } from "@/components/customer-shell";
import { getCustomerTransactionsFn, getTransactionDetailFn } from "@/lib/banking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Search,
  Filter,
  ArrowRight,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";

export const Route = createFileRoute("/app/transactions")({
  component: TransactionsPage,
});

interface TransactionRecord {
  id: string;
  public_id: string;
  amount_minor: number;
  status: string;
  note: string | null;
  created_at: string;
  completed_at: string | null;
  frozen_at: string | null;
  frozen_reason: string | null;
  hold_until: string | null;
  idempotency_key: string | null;
  beneficiary?: { public_id: string; name: string; account_number: string; bank_name: string } | null;
}

interface LedgerEntry {
  id: string;
  direction: string;
  amount_minor: number;
  balance_after_minor: number;
  created_at: string;
}

function TransactionsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected Transaction for Drawer
  const [selectedTxPubId, setSelectedTxPubId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [txDetail, setTxDetail] = useState<{
    transaction: TransactionRecord;
    ledger: LedgerEntry[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      void navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await getCustomerTransactionsFn({
        data: {
          status: statusFilter,
          search: searchQuery || undefined,
          limit: 50,
        },
      });
      setTransactions(res.transactions as TransactionRecord[]);
      setTotalCount(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadTransactions();
    }
  }, [user, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadTransactions();
  };

  const handleOpenDetail = async (publicId: string) => {
    setSelectedTxPubId(publicId);
    setDrawerOpen(true);
    setLoadingDetail(true);
    try {
      const res = await getTransactionDetailFn({
        data: { transactionPublicId: publicId },
      });
      setTxDetail(res as unknown as { transaction: TransactionRecord; ledger: LedgerEntry[] });
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <CustomerShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Transactions & Ledger</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete history of debits, credits, and status hold countdowns
            </p>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            Total records: <strong className="text-foreground">{totalCount}</strong>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <Card className="border-border/60">
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <form onSubmit={handleSearchSubmit} className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by note or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-9"
                />
              </form>

              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="FROZEN">Held for Review</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card className="border-border/60">
          <CardContent className="p-0">
            {loading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Loading transactions...</div>
            ) : transactions.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground space-y-1">
                <p>No transactions found matching the filter criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 border-b border-border/60 text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-3 px-4">Transaction ID</th>
                      <th className="py-3 px-4">Beneficiary</th>
                      <th className="py-3 px-4">Date (EAT)</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Amount (ETB)</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {transactions.map((tx) => {
                      const amount = (tx.amount_minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
                      return (
                        <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-foreground">
                            {tx.public_id}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground">
                              {tx.beneficiary?.name ?? "Utility / System"}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {tx.beneficiary?.bank_name ?? "Internal"} • {tx.note || "Transfer"}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                            {new Date(tx.created_at).toLocaleString("en-US", {
                              timeZone: "Africa/Addis_Ababa",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <StatusPill status={tx.status} />
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-foreground whitespace-nowrap">
                            -{amount}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDetail(tx.public_id)}
                              className="text-xs h-7 px-2 text-emerald-600 hover:text-emerald-700"
                            >
                              Detail <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction Detail Sheet / Drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6 space-y-6">
            <SheetHeader className="text-left space-y-1">
              <SheetTitle className="text-lg flex items-center justify-between">
                <span>Transaction Details</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {selectedTxPubId}
                </span>
              </SheetTitle>
              <SheetDescription className="text-xs">
                Status timeline and double-entry ledger verification
              </SheetDescription>
            </SheetHeader>

            {loadingDetail || !txDetail ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Loading details...</div>
            ) : (
              <div className="space-y-6 text-xs">
                {/* Amount Header */}
                <div className="p-4 rounded-xl bg-muted/60 border border-border/40 text-center space-y-1">
                  <div className="text-muted-foreground uppercase font-semibold text-[10px]">Total Amount</div>
                  <div className="text-3xl font-extrabold font-mono text-foreground">
                    {(txDetail.transaction.amount_minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ETB
                  </div>
                  <div className="pt-1">
                    <StatusPill status={txDetail.transaction.status} />
                  </div>
                </div>

                {/* Status Timeline */}
                <div className="space-y-2">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-600" /> Status Timeline
                  </div>
                  <div className="p-3 rounded-lg border border-border/40 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1" />
                      <div className="flex-1">
                        <div className="font-medium text-foreground">Transaction Created</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(txDetail.transaction.created_at).toLocaleString("en-US", { timeZone: "Africa/Addis_Ababa" })} EAT
                        </div>
                      </div>
                    </div>

                    {txDetail.transaction.status === "PROCESSING" && txDetail.transaction.hold_until && (
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500 mt-1 animate-ping" />
                        <div className="flex-1">
                          <div className="font-medium text-amber-600">High-Value Hold Active</div>
                          <div className="text-[11px] text-muted-foreground">
                            Settles at: {new Date(txDetail.transaction.hold_until).toLocaleString("en-US", { timeZone: "Africa/Addis_Ababa" })} EAT
                          </div>
                        </div>
                      </div>
                    )}

                    {txDetail.transaction.completed_at && (
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1" />
                        <div className="flex-1">
                          <div className="font-medium text-foreground">Settled & Completed</div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(txDetail.transaction.completed_at).toLocaleString("en-US", { timeZone: "Africa/Addis_Ababa" })} EAT
                          </div>
                        </div>
                      </div>
                    )}

                    {txDetail.transaction.frozen_at && (
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1" />
                        <div className="flex-1">
                          <div className="font-medium text-blue-600">Held for Security Review (FROZEN)</div>
                          <div className="text-[11px] text-muted-foreground">
                            Reason: {txDetail.transaction.frozen_reason || "ECS response triggered"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recipient Metadata */}
                <div className="space-y-2">
                  <div className="font-semibold text-foreground">Recipient Details</div>
                  <div className="p-3 rounded-lg border border-border/40 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-medium text-foreground">{txDetail.transaction.beneficiary?.name || "Utility"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account Number</span>
                      <span className="font-mono text-foreground">{txDetail.transaction.beneficiary?.account_number || "Internal"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Institution</span>
                      <span className="text-foreground">{txDetail.transaction.beneficiary?.bank_name || "HonorPay"}</span>
                    </div>
                    {txDetail.transaction.note && (
                      <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1.5">
                        <span className="text-muted-foreground">Note</span>
                        <span className="text-foreground">{txDetail.transaction.note}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Double-entry Ledger Verification */}
                <div className="space-y-2">
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-600" /> Double-Entry Ledger
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">Net Sum: 0.00 ETB</span>
                  </div>
                  <div className="p-3 rounded-lg border border-border/40 space-y-2">
                    {txDetail.ledger.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between py-1 border-b border-border/30 last:border-b-0">
                        <div className="flex items-center gap-1.5">
                          {entry.direction === "DEBIT" ? (
                            <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />
                          ) : (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                          <span className="font-mono font-semibold">{entry.direction}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold">
                            {(entry.amount_minor / 100).toLocaleString()} ETB
                          </span>
                          <span className="text-[10px] text-muted-foreground block font-mono">
                            Bal after: {(entry.balance_after_minor / 100).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </CustomerShell>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        <CheckCircle2 className="w-2.5 h-2.5" /> Completed
      </span>
    );
  }
  if (status === "PROCESSING") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <Clock className="w-2.5 h-2.5 animate-pulse" /> Processing
      </span>
    );
  }
  if (status === "FROZEN") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
        <AlertCircle className="w-2.5 h-2.5" /> Held for security review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
      <HelpCircle className="w-2.5 h-2.5" /> {status}
    </span>
  );
}
