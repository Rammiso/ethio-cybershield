import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, ArrowRight, Building2, UserCheck, KeyRound } from "lucide-react";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-background via-emerald-950/5 to-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-emerald-700/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20 mb-1">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">HonorPay Registration</h1>
          <p className="text-sm text-muted-foreground">
            Digital mobile banking & financial defense platform
          </p>
        </div>

        <Card className="border-border/60 shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <Building2 className="w-6 h-6" />
            </div>
            <CardTitle className="text-lg">Branch-Only Customer Registration</CardTitle>
            <CardDescription className="text-xs">
              For financial regulatory security and identity verification, public online self-registration is closed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 p-3.5">
              <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1 ml-2">
                <AlertTitle className="text-xs font-bold">In-Branch Registration Required</AlertTitle>
                <AlertDescription className="text-[11px] leading-relaxed text-muted-foreground">
                  New HonorPay 10-digit checking accounts are issued in person by branch tellers. Customers receive a temporary password and must set a personal password on first login.
                </AlertDescription>
              </div>
            </Alert>

            <div className="p-3 rounded-xl border border-border/70 bg-muted/20 text-xs space-y-2">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-emerald-600" /> Already Registered at a Branch?
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                If you already received your account number or mobile login credentials from an HonorPay teller, you can sign in directly.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button asChild className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium">
              <Link to="/login">
                Proceed to Account Sign In
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
