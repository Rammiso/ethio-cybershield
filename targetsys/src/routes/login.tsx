import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Lock, ArrowRight, AlertCircle, Sparkles, Eye, EyeOff, UserCheck } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, securityNotice } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login({ email, password });
      if (!res.ok) {
        setError(res.error);
      } else {
        if (res.roles.includes("admin")) {
          void navigate({ to: "/admin" });
        } else if (res.roles.includes("employee")) {
          void navigate({ to: "/employee" });
        } else {
          void navigate({ to: "/app" });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication request failed.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillCredentials = (fillEmail: string, fillPass: string) => {
    setEmail(fillEmail);
    setPassword(fillPass);
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-background via-emerald-950/5 to-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-emerald-700/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20 mb-1">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign In to HonorPay</h1>
          <p className="text-sm text-muted-foreground">
            Digital mobile banking & financial defense platform
          </p>
        </div>

        <Card className="border-border/60 shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">Account Login</CardTitle>
            <CardDescription>
              Enter your mobile phone number, account number, or email address
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {securityNotice && !error && (
                <Alert className="py-2.5 border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-xs">{securityNotice.message}</AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive" className="py-2.5">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Mobile Phone, Account Number, or Email</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="e.g. 0911223344 or 1000112233 or teller@honorpay.et"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium"
              >
                {isSubmitting ? "Signing in..." : "Sign In to HonorPay"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Quick Credentials Panel for Testing */}
        <div className="p-3.5 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs space-y-2.5">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
            <Sparkles className="w-3.5 h-3.5" /> Quick Fill Demo Accounts:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => fillCredentials("0911223344", "Testbed#2026")}
              className="p-2 text-left rounded-lg bg-background border border-border/80 hover:border-emerald-500 transition-colors"
            >
              <div className="font-bold text-xs text-foreground flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-emerald-600" /> Customer
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">0911223344</div>
            </button>
            <button
              type="button"
              onClick={() => fillCredentials("teller@honorpay.et", "Testbed#2026")}
              className="p-2 text-left rounded-lg bg-background border border-border/80 hover:border-emerald-500 transition-colors"
            >
              <div className="font-bold text-xs text-foreground">Branch Teller</div>
              <div className="font-mono text-[10px] text-muted-foreground">teller@honorpay.et</div>
            </button>
            <button
              type="button"
              onClick={() => fillCredentials("admin@shieldbank.test", "Testbed#2026")}
              className="p-2 text-left rounded-lg bg-background border border-border/80 hover:border-emerald-500 transition-colors"
            >
              <div className="font-bold text-xs text-foreground">Admin</div>
              <div className="font-mono text-[10px] text-muted-foreground">admin@shieldbank.test</div>
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Lock className="w-3 h-3" /> Password for demo accounts: <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">Testbed#2026</code>
          </div>
        </div>
      </div>
    </div>
  );
}
