import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CustomerShell } from "@/components/customer-shell";
import { getSimulatedSmsInboxFn } from "@/lib/banking.functions";
import { getSecurityPostureFn } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MessageSquare,
  Copy,
  Check,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Clock,
  Sparkles,
  Info,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/app/sms")({
  component: SimulatedSmsPage,
});

interface SmsItem {
  id: string;
  userId: string;
  phone: string;
  code: string;
  purpose: string;
  message: string;
  sentAt: string;
  expiresAt: string;
}

function SimulatedSmsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<SmsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showOtpInUi, setShowOtpInUi] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      void navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  const loadSms = useCallback(async () => {
    try {
      const [inboxRes, postureRes] = await Promise.all([
        getSimulatedSmsInboxFn(),
        getSecurityPostureFn().catch(() => null),
      ]);
      setMessages((inboxRes as SmsItem[]).reverse());
      if (postureRes) {
        setShowOtpInUi(postureRes.show_otp_in_ui ?? true);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadSms();
      const interval = setInterval(() => {
        void loadSms();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [user, loadSms]);

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <CustomerShell>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-emerald-600" />
                Simulated SMS Inbox
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                TESTBED ONLY
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Local simulation of telecom SMS delivery for two-factor and step-up verification.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadSms()}
            disabled={loading}
            className="text-xs gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Informational Callout */}
        <Alert className="bg-emerald-50 text-emerald-950 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800/40">
          <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <AlertDescription className="text-xs leading-relaxed">
            In production deployments, these 6-digit codes are delivered via Ethio Telecom or
            Safaricom SMS gateways. In this cyber range sandbox, codes are captured here so you can
            verify step-up authentication challenges without needing a physical handset.
          </AlertDescription>
        </Alert>

        {!showOtpInUi && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">
              Simulated SMS display has been disabled in the security posture settings
              (security_posture.show_otp_in_ui = false).
            </AlertDescription>
          </Alert>
        )}

        {/* SMS List */}
        {loading && messages.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            Listening for simulated SMS messages...
          </div>
        ) : messages.length === 0 ? (
          <Card className="text-center py-12 border-dashed">
            <CardContent className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-foreground">No SMS Messages Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Trigger an OTP by adding a beneficiary, updating your profile while step-up is active,
                or initiating an outbound transfer.
              </p>
              <div className="pt-2 flex justify-center gap-2">
                <Link to="/app/transfer">
                  <Button variant="outline" size="sm" className="text-xs gap-1">
                    Send Transfer <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
                <Link to="/app/beneficiaries">
                  <Button variant="outline" size="sm" className="text-xs gap-1">
                    Add Beneficiary <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {messages.map((sms) => {
              const isExpired = new Date(sms.expiresAt).getTime() < Date.now();
              const isCopied = copiedCode === sms.code;

              return (
                <Card
                  key={sms.id}
                  className={`border transition-all ${
                    isExpired
                      ? "opacity-60 bg-muted/20 border-border/40"
                      : "bg-card/70 border-emerald-500/30 shadow-sm"
                  }`}
                >
                  <CardHeader className="pb-2.5 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-xs text-foreground">
                        Ethio Telecom SMS Gateway
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        To: {sms.phone || "+251911234567"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded font-semibold bg-muted text-muted-foreground">
                        {sms.purpose}
                      </span>
                      {isExpired ? (
                        <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                          Expired
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                          <Clock className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="p-3 bg-muted/50 rounded-lg text-xs leading-relaxed text-foreground">
                      {sms.message}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-medium">
                          Verification Code:
                        </span>
                        <span className="text-2xl font-black font-mono tracking-widest text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-md border border-emerald-200 dark:border-emerald-800/50">
                          {sms.code}
                        </span>
                      </div>

                      <Button
                        variant={isCopied ? "default" : "outline"}
                        size="sm"
                        onClick={() => void handleCopy(sms.code)}
                        className={`text-xs gap-1.5 h-8 px-3 ${
                          isCopied ? "bg-emerald-700 text-white" : ""
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy Code
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-2 border-t border-border/40 font-mono">
                      <span>Sent: {new Date(sms.sentAt).toLocaleTimeString()}</span>
                      <span>Expires: {new Date(sms.expiresAt).toLocaleTimeString()}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
