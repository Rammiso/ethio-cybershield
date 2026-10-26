import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CustomerShell } from "@/components/customer-shell";
import {
  getBeneficiariesFn,
  createTransferFn,
  pollTransferStatusFn,
  requestOtpChallengeFn,
  verifyOtpChallengeFn,
  lookupRegisteredRecipientFn,
} from "@/lib/banking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Send,
  Users,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Search,
  UserCheck,
  Building2,
  Sparkles,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/app/transfer")({
  component: TransferPage,
});

interface Beneficiary {
  id: string;
  public_id: string;
  name: string;
  account_number: string;
  bank_name: string;
  is_internal: boolean;
  status: string;
  disabled_reason?: string | null;
}

interface RecipientLookupResult {
  found: boolean;
  isSelf?: boolean;
  error?: string;
  accountId?: string;
  accountNumber?: string;
  accountPublicId?: string;
  fullName?: string;
  maskedPhone?: string;
  status?: string;
}

function TransferPage() {
  const { user, account, isLoading: authLoading, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loadingBens, setLoadingBens] = useState(true);

  // Recipient Mode: "BENEFICIARY" or "DIRECT_REGISTERED"
  const [recipientMode, setRecipientMode] = useState<"BENEFICIARY" | "DIRECT_REGISTERED">("DIRECT_REGISTERED");
  const [beneficiaryId, setBeneficiaryId] = useState<string>("");
  const [recipientQuery, setRecipientQuery] = useState<string>("");
  const [lookupResult, setLookupResult] = useState<RecipientLookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Form State
  const [amountStr, setAmountStr] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Step-up / OTP State
  const [stepUpRequired, setStepUpRequired] = useState(false);
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [requestingOtp, setRequestingOtp] = useState(false);

  // Submission & Processing State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTransfer, setActiveTransfer] = useState<{
    id: string;
    public_id: string;
    status: string;
    amount_minor: number;
    hold_until?: string | null;
    beneficiary?: { name: string; account_number: string; bank_name: string };
  } | null>(null);

  const [holdCountdown, setHoldCountdown] = useState<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load Beneficiaries
  useEffect(() => {
    void (async () => {
      try {
        const bens = await getBeneficiariesFn();
        const benList = bens as Beneficiary[];
        setBeneficiaries(benList);
        if (benList && benList.length > 0) {
          const firstActive = benList.find((b) => b.status === "ACTIVE");
          if (firstActive) {
            setBeneficiaryId(firstActive.id);
            setRecipientMode("BENEFICIARY");
          }
        }
      } catch {
        // ignore
      } finally {
        setLoadingBens(false);
      }
    })();
  }, []);

  // Recipient Lookup debounce
  useEffect(() => {
    if (recipientMode !== "DIRECT_REGISTERED") return;
    const clean = recipientQuery.trim();
    if (clean.length < 3) {
      setLookupResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLookingUp(true);
      try {
        const res = await lookupRegisteredRecipientFn({ data: { query: clean } });
        setLookupResult(res as RecipientLookupResult);
      } catch (err: unknown) {
        setLookupResult({
          found: false,
          error: err instanceof Error ? err.message : "Lookup failed",
        });
      } finally {
        setIsLookingUp(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [recipientQuery, recipientMode]);

  // Countdown timer for PROCESSING transfers
  useEffect(() => {
    if (!activeTransfer || activeTransfer.status !== "PROCESSING" || !activeTransfer.hold_until) {
      return;
    }

    const targetTime = new Date(activeTransfer.hold_until).getTime();

    const updateCountdown = () => {
      const remainingMs = targetTime - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setHoldCountdown(remainingSec);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeTransfer]);

  // Polling for PROCESSING transfers every 3s
  useEffect(() => {
    if (!activeTransfer || activeTransfer.status !== "PROCESSING") {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await pollTransferStatusFn({
          data: { transactionPublicId: activeTransfer.public_id },
        });
        if (res?.transaction) {
          setActiveTransfer((prev) => (prev ? { ...prev, ...res.transaction } : res.transaction));
          if (res.transaction.status !== "PROCESSING") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            await refreshUser();
          }
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeTransfer, refreshUser]);

  const handleRequestOtp = async () => {
    setRequestingOtp(true);
    setOtpError(null);
    try {
      const challenge = await requestOtpChallengeFn({ data: { purpose: "TRANSFER" } });
      setOtpChallengeId(challenge.challengeId);
    } catch (err: unknown) {
      setOtpError(err instanceof Error ? err.message : "Failed to issue security challenge");
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpChallengeId || otpCode.length !== 6) return;
    setOtpError(null);
    try {
      const res = await verifyOtpChallengeFn({
        data: { challengeId: otpChallengeId, code: otpCode },
      });
      if (res.ok) {
        setOtpVerified(true);
      } else {
        setOtpError(res.error || "Incorrect security code.");
      }
    } catch (err: unknown) {
      setOtpError(err instanceof Error ? err.message : "Verification failed.");
    }
  };

  const currentBalanceMinor = Number(account?.balance_minor ?? 0);
  const currentBalanceEtb = currentBalanceMinor / 100;
  const amountEtb = parseFloat(amountStr) || 0;
  const isOverdraft = amountEtb > currentBalanceEtb;
  const hasZeroDeposit = currentBalanceMinor <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (hasZeroDeposit) {
      setError("You have 0.00 ETB deposit balance. Please deposit funds at a branch teller before transferring.");
      return;
    }

    if (isNaN(amountEtb) || amountEtb <= 0) {
      setError("Please enter a valid transfer amount.");
      return;
    }

    if (amountEtb > currentBalanceEtb) {
      setError(`Amount exceeds your available deposit balance of ${currentBalanceEtb.toLocaleString()} ETB.`);
      return;
    }

    let payloadBeneficiaryId: string | undefined = undefined;
    let payloadRecipientAccountNumber: string | undefined = undefined;

    if (recipientMode === "BENEFICIARY") {
      if (!beneficiaryId) {
        setError("Please select a beneficiary.");
        return;
      }
      payloadBeneficiaryId = beneficiaryId;
    } else {
      if (!lookupResult?.found || !lookupResult.accountNumber) {
        setError("Please enter a valid registered HonorPay user account or phone number.");
        return;
      }
      payloadRecipientAccountNumber = lookupResult.accountNumber;
    }

    setIsSubmitting(true);

    try {
      const res = await createTransferFn({
        data: {
          beneficiaryId: payloadBeneficiaryId,
          recipientAccountNumber: payloadRecipientAccountNumber,
          amountEtb,
          note: note.trim() || null,
          otpChallengeId: otpVerified ? otpChallengeId : null,
        },
      });

      setActiveTransfer(res.transaction);
      await refreshUser();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transfer failed";
      if (message.includes("STEP_UP_REQUIRED") || message.includes("Step-up")) {
        setStepUpRequired(true);
        void handleRequestOtp();
      }
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setActiveTransfer(null);
    setAmountStr("");
    setNote("");
    setError(null);
    setStepUpRequired(false);
    setOtpChallengeId(null);
    setOtpCode("");
    setOtpVerified(false);
    setLookupResult(null);
    setRecipientQuery("");
  };

  if (authLoading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const selectedBen = beneficiaries.find((b) => b.id === beneficiaryId);
  const isHighValue = amountEtb >= 50000;
  const isLocked = account?.status === "LOCKED";

  return (
    <CustomerShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Send className="w-6 h-6 text-emerald-600" /> Transfer Money
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            HonorPay peer-to-peer transfers are strictly restricted to registered users and funded solely from your deposit balance.
          </p>
        </div>

        {/* Deposit Balance Banner */}
        <div className="p-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-card to-card flex items-center justify-between shadow-xs">
          <div className="space-y-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-emerald-600" /> Available Deposit Balance
            </span>
            <div className="text-2xl font-black font-mono text-foreground">
              {currentBalanceEtb.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
              <span className="text-xs font-normal text-muted-foreground">ETB</span>
            </div>
          </div>

          <Button asChild size="sm" variant="outline" className="text-xs">
            <Link to="/employee">
              <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Deposit More
            </Link>
          </Button>
        </div>

        {/* Zero Deposit Block Notice */}
        {hasZeroDeposit && (
          <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
            <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <AlertTitle className="text-sm font-bold">Transfer Blocked: Zero Deposit Balance</AlertTitle>
              <AlertDescription className="text-xs space-y-2">
                <p>
                  You cannot make transfers without a deposited balance. Please deposit funds through a branch teller or use the Teller Portal.
                </p>
                <Button asChild size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs">
                  <Link to="/employee">Open Teller Cash-In Portal</Link>
                </Button>
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Active Transfer State Modal / Card */}
        {activeTransfer ? (
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-2">
                {activeTransfer.status === "COMPLETED" && (
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                )}
                {activeTransfer.status === "PROCESSING" && (
                  <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400 flex items-center justify-center animate-pulse">
                    <Clock className="w-6 h-6" />
                  </div>
                )}
                {activeTransfer.status === "FROZEN" && (
                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                )}
                {activeTransfer.status === "FAILED" && (
                  <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 flex items-center justify-center">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                )}
              </div>

              <CardTitle className="text-xl">
                {activeTransfer.status === "COMPLETED" && "Transfer Completed Successfully"}
                {activeTransfer.status === "PROCESSING" && "Processing (High-Value Hold)"}
                {activeTransfer.status === "FROZEN" && "Held for Security Review"}
                {activeTransfer.status === "FAILED" && "Transfer Failed"}
              </CardTitle>
              <CardDescription className="text-xs">
                Transaction ID: <span className="font-mono font-semibold text-foreground">{activeTransfer.public_id}</span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-muted/60 border border-border/40 text-center space-y-1">
                <div className="text-xs text-muted-foreground uppercase font-semibold">Amount Transferred</div>
                <div className="text-3xl font-extrabold text-foreground font-mono">
                  {(activeTransfer.amount_minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ETB
                </div>
                <div className="text-xs text-muted-foreground">
                  Recipient: <strong>{activeTransfer.beneficiary?.name ?? lookupResult?.fullName ?? selectedBen?.name ?? "HonorPay User"}</strong>
                </div>
              </div>

              {/* Status Specific Banners */}
              {activeTransfer.status === "PROCESSING" && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-950 dark:text-amber-200 space-y-2">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 animate-spin text-amber-600" /> High-Value Hold Countdown:
                    </span>
                    <span className="font-mono text-base font-extrabold text-amber-600 dark:text-amber-400">
                      {holdCountdown}s
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Transfers &ge; 50,000 ETB enter a 20-second holding period for security inspection.
                    Funds settle automatically when countdown reaches zero. Live polling...
                  </p>
                  <div className="w-full bg-amber-200 dark:bg-amber-950 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full transition-all duration-1000 ease-linear"
                      style={{ width: `${Math.min(100, Math.max(0, (20 - holdCountdown) * 5))}%` }}
                    />
                  </div>
                </div>
              )}

              {activeTransfer.status === "COMPLETED" && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-950 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Transfer settled instantly. Recipient's deposit balance has been credited.</span>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button asChild variant="outline" className="w-full sm:w-1/2 text-xs">
                <Link to="/app/transactions">View in Statement</Link>
              </Button>
              <Button onClick={resetForm} className="w-full sm:w-1/2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs">
                Make Another Transfer
              </Button>
            </CardFooter>
          </Card>
        ) : (
          /* Transfer Form */
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base font-semibold">Transfer Details</CardTitle>
              <CardDescription className="text-xs">
                Send funds to any registered HonorPay customer account.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 pt-4">
                {error && (
                  <Alert variant="destructive" className="py-2.5">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                )}

                {/* Recipient Selection Mode Tabs */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Choose Recipient Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRecipientMode("DIRECT_REGISTERED")}
                      className={`p-2.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        recipientMode === "DIRECT_REGISTERED"
                          ? "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold"
                          : "border-border/70 hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <UserCheck className="w-4 h-4" /> Registered User Lookup
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientMode("BENEFICIARY")}
                      className={`p-2.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        recipientMode === "BENEFICIARY"
                          ? "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold"
                          : "border-border/70 hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <Users className="w-4 h-4" /> Saved Beneficiaries ({beneficiaries.length})
                    </button>
                  </div>
                </div>

                {/* Mode A: Direct Registered User Lookup */}
                {recipientMode === "DIRECT_REGISTERED" && (
                  <div className="space-y-2">
                    <Label htmlFor="recipientQuery" className="text-xs font-semibold">
                      Recipient Account Number or Phone
                    </Label>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                      <Input
                        id="recipientQuery"
                        placeholder="Enter 10-digit account (1000...) or phone (+251...)"
                        value={recipientQuery}
                        onChange={(e) => setRecipientQuery(e.target.value)}
                        className="pl-9 text-xs font-mono"
                        autoComplete="off"
                      />
                      {isLookingUp && (
                        <div className="absolute right-3 top-2.5">
                          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Lookup Result Feedback */}
                    {lookupResult?.found && (
                      <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-bold text-foreground">
                              {lookupResult.fullName}
                            </span>
                            <span className="text-[11px] text-muted-foreground block font-mono">
                              HonorPay Acc: {lookupResult.accountNumber} {lookupResult.maskedPhone ? `• ${lookupResult.maskedPhone}` : ""}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                          VERIFIED
                        </span>
                      </div>
                    )}

                    {lookupResult && !lookupResult.found && (
                      <div className="p-3 rounded-xl border border-red-500/30 bg-red-50/50 dark:bg-red-950/20 text-xs text-red-900 dark:text-red-200 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>{lookupResult.error || "Recipient is not a registered HonorPay account."}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Mode B: Saved Beneficiaries Dropdown */}
                {recipientMode === "BENEFICIARY" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="beneficiary" className="text-xs font-semibold">
                        Select Saved Beneficiary
                      </Label>
                      <Link to="/app/beneficiaries" className="text-[11px] text-emerald-600 hover:underline">
                        + Manage List
                      </Link>
                    </div>

                    {loadingBens ? (
                      <div className="text-xs text-muted-foreground py-2">Loading beneficiaries...</div>
                    ) : beneficiaries.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                        No saved beneficiaries.{" "}
                        <button
                          type="button"
                          onClick={() => setRecipientMode("DIRECT_REGISTERED")}
                          className="text-emerald-600 font-semibold underline"
                        >
                          Use direct account lookup instead
                        </button>
                      </div>
                    ) : (
                      <select
                        id="beneficiary"
                        value={beneficiaryId}
                        onChange={(e) => setBeneficiaryId(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-xs sm:text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        required
                      >
                        {beneficiaries.map((b) => (
                          <option key={b.id} value={b.id} disabled={b.status === "DISABLED"}>
                            {b.name} — ({b.account_number}) {b.status === "DISABLED" ? "• [DISABLED]" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Transfer Amount in ETB */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="amount" className="text-xs font-semibold">
                      Amount (ETB)
                    </Label>
                    <span className="text-[11px] text-muted-foreground">
                      Max:{" "}
                      <button
                        type="button"
                        onClick={() => setAmountStr(currentBalanceEtb.toString())}
                        className="font-mono text-emerald-600 hover:underline font-semibold"
                      >
                        {currentBalanceEtb.toLocaleString()} ETB
                      </button>
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      id="amount"
                      type="number"
                      step="any"
                      min="1"
                      max={currentBalanceEtb > 0 ? currentBalanceEtb : undefined}
                      placeholder="e.g. 500 or 2500"
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                      required
                      className={`text-lg font-mono font-bold pr-14 ${
                        isOverdraft ? "border-red-500 text-red-600 focus:ring-red-500" : ""
                      }`}
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-muted-foreground">
                      ETB
                    </span>
                  </div>

                  {isOverdraft && (
                    <p className="text-[11px] text-red-500 font-medium">
                      ⚠️ Transfer amount exceeds your available deposit balance of {currentBalanceEtb.toLocaleString()} ETB.
                    </p>
                  )}

                  {isHighValue && !isOverdraft && (
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>Amount &ge; 50,000 ETB: subject to a 20-second security hold countdown before completion.</span>
                    </div>
                  )}

                  {/* Preset Amount Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[100, 500, 1000, 2500, 5000].map((chip) => (
                      <button
                        type="button"
                        key={chip}
                        disabled={chip > currentBalanceEtb}
                        onClick={() => setAmountStr(chip.toString())}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border/70 hover:border-emerald-500/50 hover:bg-emerald-500/5 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        {chip.toLocaleString()} ETB
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transfer Note */}
                <div className="space-y-1.5">
                  <Label htmlFor="note" className="text-xs font-semibold">
                    Payment Note (Optional)
                  </Label>
                  <Input
                    id="note"
                    type="text"
                    placeholder="e.g. For dinner, rent, family support"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={200}
                    className="text-xs"
                  />
                </div>

                {/* Step-Up OTP Box if Triggered */}
                {stepUpRequired && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                        Security Verification Required
                      </div>
                      <Link to="/app/sms" target="_blank" className="text-[11px] text-emerald-600 font-semibold hover:underline">
                        View Code in SMS Inbox ↗
                      </Link>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      Please enter the 6-digit security code issued to your mobile number.
                    </p>

                    <div className="flex gap-2">
                      <Input
                        type="text"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        className="font-mono text-center tracking-widest text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleVerifyOtp}
                        disabled={otpCode.length !== 6 || otpVerified}
                        className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                      >
                        {otpVerified ? "Verified ✓" : "Verify Code"}
                      </Button>
                    </div>

                    {otpError && <p className="text-[11px] text-red-500 font-medium">{otpError}</p>}
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    hasZeroDeposit ||
                    isOverdraft ||
                    isLocked ||
                    (recipientMode === "DIRECT_REGISTERED" && !lookupResult?.found) ||
                    (recipientMode === "BENEFICIARY" && beneficiaries.length === 0) ||
                    (stepUpRequired && !otpVerified)
                  }
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-2.5 shadow-sm"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Processing Transfer...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      Confirm & Send Transfer <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </CustomerShell>
  );
}
