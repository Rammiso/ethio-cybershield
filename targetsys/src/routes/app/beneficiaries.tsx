import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CustomerShell } from "@/components/customer-shell";
import {
  getBeneficiariesFn,
  addBeneficiaryFn,
  removeBeneficiaryFn,
  requestOtpChallengeFn,
  verifyOtpChallengeFn,
} from "@/lib/banking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Users,
  Plus,
  Trash2,
  Building,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

export const Route = createFileRoute("/app/beneficiaries")({
  component: BeneficiariesPage,
});

interface BeneficiaryItem {
  id: string;
  public_id: string;
  name: string;
  account_number: string;
  bank_name: string;
  is_internal: boolean;
  status: string;
  disabled_reason?: string | null;
  created_at: string;
}

function BeneficiariesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("HonorPay");
  const [isInternal, setIsInternal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step-up / OTP State
  const [stepUpRequired, setStepUpRequired] = useState(false);
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      void navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  const loadBeneficiaries = async () => {
    setLoading(true);
    try {
      const res = await getBeneficiariesFn();
      setBeneficiaries(res as BeneficiaryItem[]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadBeneficiaries();
    }
  }, [user]);

  const handleOpenAdd = () => {
    setName("");
    setAccountNumber("");
    setBankName("HonorPay");
    setIsInternal(true);
    setError(null);
    setStepUpRequired(false);
    setOtpChallengeId(null);
    setOtpCode("");
    setOtpVerified(false);
    setAddModalOpen(true);
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
      setOtpError(err instanceof Error ? err.message : "Verification failed");
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await addBeneficiaryFn({
        data: {
          name,
          accountNumber,
          bankName,
          isInternal,
          otpChallengeId: otpVerified ? otpChallengeId : null,
        },
      });
      setAddModalOpen(false);
      await loadBeneficiaries();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add beneficiary";
      if (message.includes("STEP_UP_REQUIRED") || message.includes("Step-up")) {
        setStepUpRequired(true);
        try {
          const ch = await requestOtpChallengeFn({ data: { purpose: "STEP_UP" } });
          setOtpChallengeId(ch.challengeId);
        } catch {
          // ignore
        }
      }
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (publicId: string) => {
    if (!confirm("Are you sure you want to remove this beneficiary?")) return;
    try {
      await removeBeneficiaryFn({ data: { beneficiaryPublicId: publicId } });
      await loadBeneficiaries();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to remove beneficiary");
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Beneficiaries</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage trusted internal accounts, Ethiopian commercial banks, and Telebirr recipients
            </p>
          </div>
          <Button onClick={handleOpenAdd} className="bg-emerald-700 hover:bg-emerald-800 text-white shrink-0">
            <Plus className="w-4 h-4 mr-1.5" /> Add Beneficiary
          </Button>
        </div>

        {/* Beneficiaries Grid */}
        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground">Loading beneficiaries...</div>
        ) : beneficiaries.length === 0 ? (
          <Card className="border-dashed p-8 text-center text-xs text-muted-foreground space-y-3">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/60" />
            <div>No beneficiaries registered yet.</div>
            <Button onClick={handleOpenAdd} size="sm" variant="outline">
              Add First Beneficiary
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {beneficiaries.map((b) => {
              const isDisabled = b.status === "DISABLED";
              return (
                <Card
                  key={b.id}
                  className={`border-border/60 transition-shadow hover:shadow-sm ${
                    isDisabled ? "bg-red-500/5 border-red-500/30" : ""
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          {b.name}
                        </CardTitle>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {b.public_id}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isDisabled ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                            DISABLED
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            ACTIVE
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="space-y-1 p-2 rounded bg-muted/60 border border-border/40 font-mono">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Account</span>
                        <span className="font-bold text-foreground">{b.account_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Institution</span>
                        <span className="text-foreground">{b.bank_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <span className="text-foreground">{b.is_internal ? "Internal (Instant)" : "External Clearing"}</span>
                      </div>
                    </div>

                    {isDisabled && b.disabled_reason && (
                      <div className="p-2 rounded bg-red-100/50 dark:bg-red-950/40 text-[11px] text-red-700 dark:text-red-300 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>Reason: {b.disabled_reason}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      <span className="text-[11px] text-muted-foreground">
                        Added {new Date(b.created_at).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(b.public_id)}
                        className="text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add Beneficiary Dialog */}
        <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Building className="w-4 h-4 text-emerald-600" /> Add Recipient Beneficiary
              </DialogTitle>
              <DialogDescription className="text-xs">
                Register an internal HonorPay account or external Ethiopian bank/wallet
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddSubmit} className="space-y-4 pt-1">
              {error && (
                <Alert variant="destructive" className="py-2.5">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="benName" className="text-xs">Beneficiary Full Name</Label>
                <Input
                  id="benName"
                  placeholder="e.g. Chaltu Desta"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="benAcc" className="text-xs">Account or Wallet Number</Label>
                <Input
                  id="benAcc"
                  placeholder="e.g. 1000203 or CBE 100098765432"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="benBank" className="text-xs">Bank / Network</Label>
                <select
                  id="benBank"
                  value={bankName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBankName(val);
                    setIsInternal(val === "HonorPay");
                  }}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="HonorPay">HonorPay (Internal Registered User)</option>
                  <option value="Commercial Bank of Ethiopia">Commercial Bank of Ethiopia (CBE)</option>
                  <option value="Awash Bank">Awash Bank</option>
                  <option value="Bank of Abyssinia">Bank of Abyssinia (BoA)</option>
                  <option value="Dashen Bank">Dashen Bank</option>
                  <option value="Telebirr">Telebirr (Mobile Money)</option>
                </select>
              </div>

              {/* Step-Up OTP Verification if required */}
              {stepUpRequired && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2 text-xs">
                  <div className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" /> Step-Up Security Verification Required
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Check your simulated SMS inbox for the 6-digit code.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      maxLength={6}
                      placeholder="6-digit code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="font-mono text-center tracking-widest text-xs h-8"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleVerifyOtp}
                      disabled={otpCode.length !== 6 || otpVerified}
                      className="h-8 bg-amber-600 text-white shrink-0"
                    >
                      {otpVerified ? "Verified ✓" : "Verify"}
                    </Button>
                  </div>
                  {otpError && <p className="text-[11px] text-red-500">{otpError}</p>}
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || (stepUpRequired && !otpVerified)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                >
                  {isSubmitting ? "Adding..." : "Add Beneficiary"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </CustomerShell>
  );
}
