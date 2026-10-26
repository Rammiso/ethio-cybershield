import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CustomerShell } from "@/components/customer-shell";
import { getCustomerTransactionsFn } from "@/lib/banking.functions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Send,
  Users,
  MessageSquare,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  Building2,
  History,
  Shield,
  CreditCard,
  Wifi,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/app/")({
  component: CustomerHomePage,
});

interface TransactionItem {
  id: string;
  public_id: string;
  amount_minor: number;
  to_account_id?: string | null;
  from_account_id?: string | null;
  status: string;
  note: string | null;
  created_at: string;
  hold_until: string | null;
  beneficiary?: { public_id: string; name: string; account_number: string; bank_name: string } | null;
}

function CustomerHomePage() {
  const { user, account, isLoading } = useAuth();
  const navigate = useNavigate();

  const [recentTxs, setRecentTxs] = useState<TransactionItem[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [showBalance, setShowBalance] = useState(true);
  const [copiedAcc, setCopiedAcc] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      void navigate({ to: "/login" });
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (user) {
      void (async () => {
        try {
          const res = await getCustomerTransactionsFn({ data: { limit: 10 } });
          setRecentTxs(res.transactions as TransactionItem[]);
        } catch {
          // ignore
        } finally {
          setLoadingTxs(false);
        }
      })();
    }
  }, [user]);

  const copyAccountNumber = () => {
    if (account?.account_number) {
      void navigator.clipboard.writeText(account.account_number);
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 2000);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const rawBalanceMinor = account?.balance_minor ?? 0;
  const balanceEtb = (rawBalanceMinor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isLocked = account?.status === "LOCKED";
  const hasZeroBalance = rawBalanceMinor <= 0;

  return (
    <CustomerShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Account Locked Alert */}
        {isLocked && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-950 dark:text-red-200 shadow-xs">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-bold text-sm">Account Status: LOCKED</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your checking account has been restricted by security controls. Please contact your HonorPay administrator or branch teller.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Zero Deposit Guidance Alert */}
        {hasZeroBalance && !isLocked && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <Building2 className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Zero Deposit Balance
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  In HonorPay Mobile Banking, you can only transfer funds from your available deposit balance. Visit a branch teller or use the Teller Portal to credit a deposit.
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs shrink-0"
            >
              <Link to="/employee">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Deposit at Teller
              </Link>
            </Button>
          </div>
        )}

        {/* Mobile Banking Digital Card */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950 via-teal-950 to-zinc-950 p-6 sm:p-8 text-white shadow-xl">
          {/* Background Glow Accents */}
          <div className="absolute -right-16 -top-16 w-56 h-56 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-56 h-56 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col justify-between min-h-[200px]">
            {/* Card Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/30 ring-1 ring-emerald-400/40 flex items-center justify-center text-emerald-300">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                    HonorPay
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40">
                      ETB
                    </span>
                  </span>
                  <span className="text-[11px] text-emerald-200/70 block leading-none">
                    Digital Mobile Wallet
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Wifi className="w-5 h-5 text-emerald-400/80 rotate-90" />
                <CreditCard className="w-5 h-5 text-emerald-400/80" />
              </div>
            </div>

            {/* Balance Display */}
            <div className="py-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200/80 uppercase tracking-wider">
                <span>Available Deposit Balance</span>
                <button
                  type="button"
                  onClick={() => setShowBalance(!showBalance)}
                  className="p-1 rounded hover:bg-white/10 transition-colors text-emerald-300"
                  title={showBalance ? "Hide balance" : "Show balance"}
                >
                  {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="text-4xl sm:text-5xl font-black tracking-tight text-white font-mono flex items-baseline gap-2">
                {showBalance ? (
                  <>
                    <span>{balanceEtb}</span>
                    <span className="text-lg sm:text-xl font-normal text-emerald-300/80">ETB</span>
                  </>
                ) : (
                  <span>••••••••••</span>
                )}
              </div>
            </div>

            {/* Card Footer: Account Number & Status */}
            <div className="pt-2 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-emerald-200/70">Account:</span>
                <span className="font-mono font-bold text-white tracking-wider">
                  {account?.account_number ? (
                    <>
                      {account.account_number.slice(0, 4)} •••• {account.account_number.slice(-4)}
                    </>
                  ) : (
                    "1000 •••• 0001"
                  )}
                </span>
                <button
                  type="button"
                  onClick={copyAccountNumber}
                  className="p-1 rounded hover:bg-white/10 text-emerald-300 transition-colors"
                  title="Copy full account number"
                >
                  {copiedAcc ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {copiedAcc && (
                  <span className="text-[10px] text-emerald-300 font-medium">Copied!</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-emerald-200/70">
                  Customer ID: <strong className="text-white font-mono">{user.publicId}</strong>
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    isLocked
                      ? "bg-red-500/30 text-red-300 ring-1 ring-red-500/40"
                      : "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                  }`}
                >
                  {account?.status ?? "ACTIVE"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Mobile Action Icons Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            to="/app/transfer"
            className="p-4 rounded-2xl border border-border/70 bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex flex-col items-center text-center gap-2 group shadow-xs"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <Send className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-foreground">Send Money</span>
            <span className="text-[10px] text-muted-foreground">To registered user</span>
          </Link>

          <Link
            to="/employee"
            className="p-4 rounded-2xl border border-border/70 bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex flex-col items-center text-center gap-2 group shadow-xs"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-foreground">Teller Cash-In</span>
            <span className="text-[10px] text-muted-foreground">Deposit funds at branch</span>
          </Link>

          <Link
            to="/app/beneficiaries"
            className="p-4 rounded-2xl border border-border/70 bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex flex-col items-center text-center gap-2 group shadow-xs"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-foreground">Beneficiaries</span>
            <span className="text-[10px] text-muted-foreground">Registered contacts</span>
          </Link>

          <Link
            to="/app/transactions"
            className="p-4 rounded-2xl border border-border/70 bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex flex-col items-center text-center gap-2 group shadow-xs"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-foreground">Statement</span>
            <span className="text-[10px] text-muted-foreground">Receipts & ledger</span>
          </Link>
        </div>

        {/* Recent Transactions & Feed */}
        <Card className="border-border/60 shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              <CardDescription className="text-xs">
                Live ledger movements (Deposits, Outbound Transfers, and Security Holds)
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs text-emerald-600 hover:text-emerald-700">
              <Link to="/app/transactions">
                View Full Statement <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loadingTxs ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Loading recent transactions...
              </div>
            ) : recentTxs.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground space-y-3">
                <p>No transactions yet. Have a teller credit a cash deposit or send your first transfer.</p>
                <Button asChild size="sm" variant="outline" className="text-xs">
                  <Link to="/employee">Deposit at Teller Portal</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {recentTxs.map((tx) => {
                  const isIncomingDeposit =
                    (tx.note && tx.note.toLowerCase().includes("deposit")) ||
                    tx.to_account_id === account?.id;

                  const formattedAmount = (tx.amount_minor / 100).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  });

                  return (
                    <div
                      key={tx.id}
                      className="py-3.5 flex items-center justify-between gap-3 hover:bg-muted/30 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isIncomingDeposit
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          }`}
                        >
                          {isIncomingDeposit ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 truncate">
                            <span>
                              {isIncomingDeposit
                                ? "Teller Cash Deposit"
                                : tx.beneficiary?.name ?? "HonorPay Transfer"}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground font-normal">
                              ({tx.public_id})
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {new Date(tx.created_at).toLocaleString("en-US", {
                              timeZone: "Africa/Addis_Ababa",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            EAT • {tx.note || "Transfer"}
                          </div>
                        </div>
                      </div>

                      <div className="text-right space-y-1 shrink-0">
                        <div
                          className={`font-mono font-bold text-xs ${
                            isIncomingDeposit
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-foreground"
                          }`}
                        >
                          {isIncomingDeposit ? `+${formattedAmount}` : `-${formattedAmount}`} ETB
                        </div>
                        <StatusBadge status={tx.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerShell>
  );
}

function StatusBadge({ status }: { status: string }) {
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
        <AlertCircle className="w-2.5 h-2.5" /> Held for Review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
      <HelpCircle className="w-2.5 h-2.5" /> {status}
    </span>
  );
}
