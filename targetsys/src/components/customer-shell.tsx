import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { forceChangePasswordFn } from "@/lib/banking.functions";
import {
  markStoredEntityPasswordChanged,
  isPasswordChangeCompleted,
  setAuthToken,
  setTargetSession,
} from "@/lib/client-headers";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  Home,
  Send,
  History,
  Users,
  Smartphone,
  KeyRound,
  MessageSquare,
  LogOut,
  AlertTriangle,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";

interface CustomerShellProps {
  children: ReactNode;
}

interface FirstLoginPasswordChangeModalProps {
  user: any;
  account: any;
  refreshUser: () => Promise<void>;
  onSuccess?: () => void;
}

function FirstLoginPasswordChangeModal({
  user,
  account,
  refreshUser,
  onSuccess,
}: FirstLoginPasswordChangeModalProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("New password must be different from current temporary password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await forceChangePasswordFn({
        data: {
          currentPassword,
          newPassword,
        },
      });

      // 1. Save new active session tokens if returned to ensure immediate uninterrupted dashboard access
      if (res?.access_token) {
        setAuthToken(res.access_token);
        try {
          await supabase.auth.setSession({
            access_token: res.access_token,
            refresh_token: res.refresh_token,
          });
        } catch {
          // ignore
        }
      }
      if (res?.sessionPublicId) {
        setTargetSession(res.sessionPublicId);
      }

      // 2. Mark in client storage that password change is completed across all identifiers so modal never re-appears
      const targetUserId = res?.userId || user?.id || "";
      const targetEmail = res?.email || user?.email || "";
      const targetPublicId = res?.userPublicId || user?.publicId || "";
      const targetPhone = user?.phone || "";
      const targetAcc = account?.account_number || "";

      if (targetUserId) markStoredEntityPasswordChanged(targetUserId, newPassword);
      if (targetEmail) markStoredEntityPasswordChanged(targetEmail, newPassword);
      if (targetPublicId) markStoredEntityPasswordChanged(targetPublicId, newPassword);
      if (targetPhone) markStoredEntityPasswordChanged(targetPhone, newPassword);
      if (targetAcc) markStoredEntityPasswordChanged(targetAcc, newPassword);

      setSuccess(true);
      if (onSuccess) {
        onSuccess();
      }

      await refreshUser();

      // 3. Immediately redirect to customer dashboard
      void navigate({ to: "/app" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-emerald-950/10 to-background flex items-center justify-center p-4">
      <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl border border-emerald-500/30 bg-card shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center mx-auto ring-1 ring-emerald-500/30">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            First-Time Login Password Change
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Welcome to HonorPay Mobile Banking, <strong className="text-foreground">{user?.fullName}</strong>!
            Your account was registered at a branch teller. Because you are logging in with a temporary password,
            you must set a new private password before accessing your account.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="py-2.5">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="py-2.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-xs">
              Password updated successfully! Unlocking your HonorPay mobile wallet and redirecting...
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword" className="text-xs font-semibold">
              Current Temporary Password
            </Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrent ? "text" : "password"}
                placeholder="Enter teller-issued password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                aria-label={showCurrent ? "Hide password" : "Show password"}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword" className="text-xs font-semibold">
              New Personal Password
            </Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNew ? "text" : "password"}
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                aria-label={showNew ? "Hide password" : "Show password"}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Must be at least 8 characters long and different from temporary password.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-xs font-semibold">
              Confirm New Password
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || success}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-2.5 mt-2"
          >
            {isSubmitting ? (
              "Updating Password..."
            ) : success ? (
              "Unlocking Dashboard..."
            ) : (
              <>
                Confirm & Access Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout();
              void navigate({ to: "/login" });
            }}
            className="w-full text-xs text-muted-foreground hover:text-foreground"
          >
            Sign Out
          </Button>
        </form>
      </div>
    </div>
  );
}

export function CustomerShell({ children }: CustomerShellProps) {
  const { user, account, logout, securityNotice, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);

  if (securityNotice?.type === "SESSION_REVOKED") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4 p-6 sm:p-8 rounded-2xl border border-amber-500/30 bg-card shadow-lg">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">Session Revoked</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your banking session was ended for security reasons (either revoked from another device or expired).
              Please sign in again to continue.
            </p>
          </div>
          <Button
            onClick={async () => {
              await logout();
              void navigate({ to: "/login" });
            }}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white mt-4"
          >
            Return to Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (securityNotice?.type === "IP_BLOCKED") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4 p-6 sm:p-8 rounded-2xl border border-red-500/30 bg-card shadow-lg">
          <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">Access Restricted</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Access from your network is temporarily blocked by HonorPay security policies. If you believe this is in error, please contact your security administrator.
            </p>
          </div>
          <Button
            onClick={() => {
              void refreshUser();
            }}
            variant="outline"
            className="w-full mt-4"
          >
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  // Mandatory First-Time Login Password Change Check
  const isLocallyUnlocked =
    unlocked ||
    (user?.id ? isPasswordChangeCompleted(user.id) : false) ||
    (user?.email ? isPasswordChangeCompleted(user.email) : false) ||
    (user?.publicId ? isPasswordChangeCompleted(user.publicId) : false) ||
    (user?.phone ? isPasswordChangeCompleted(user.phone) : false) ||
    (account?.account_number ? isPasswordChangeCompleted(account.account_number) : false);

  if (user?.mustChangePassword && !isLocallyUnlocked) {
    return (
      <FirstLoginPasswordChangeModal
        user={user}
        account={account}
        refreshUser={refreshUser}
        onSuccess={() => setUnlocked(true)}
      />
    );
  }

  const navItems = [
    { label: "Home", to: "/app", icon: Home },
    { label: "Transfer", to: "/app/transfer", icon: Send },
    { label: "History", to: "/app/transactions", icon: History },
    { label: "Beneficiaries", to: "/app/beneficiaries", icon: Users },
    { label: "SMS Inbox", to: "/app/sms", icon: MessageSquare },
  ];

  const moreItems = [
    { label: "Devices", to: "/app/devices", icon: Smartphone },
    { label: "Sessions", to: "/app/sessions", icon: Lock },
    { label: "Security & Profile", to: "/app/security", icon: KeyRound },
  ];

  const isActive = (path: string) => {
    if (path === "/app") return location.pathname === "/app" || location.pathname === "/app/";
    return location.pathname.startsWith(path);
  };

  const isAccountLocked = account?.status === "LOCKED";

  return (
    <div className="flex-1 flex flex-col bg-background min-h-[calc(100vh-2rem)] pb-16 sm:pb-0">
      {/* Top Navigation Bar */}
      <header className="border-b border-border/60 bg-card sticky top-7 z-40">
        <div className="max-w-6xl mx-auto px-4 py-2.5 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/app" className="flex items-center gap-2 group">
              <div className="p-1.5 rounded-xl bg-emerald-700 text-white group-hover:bg-emerald-800 transition-colors">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-1.5">
                  HonorPay
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ETB
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground block leading-none">Mobile Banking</span>
              </div>
            </Link>

            {/* Desktop Nav Items */}
            <nav className="hidden md:flex items-center gap-1 ml-6">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? "bg-emerald-700 text-white"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Link to Teller Portal */}
            <Link
              to="/employee"
              className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium hover:bg-emerald-500/20 transition-colors hidden sm:inline-flex items-center gap-1"
              title="Employee & Teller Cash-In Portal"
            >
              Teller Deposit
            </Link>

            {/* Quick dropdown / links for More */}
            <div className="hidden sm:flex items-center gap-1 border-r border-border/40 pr-3 mr-1">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`p-1.5 rounded-lg text-xs transition-colors ${
                      active ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={item.label}
                  >
                    <Icon className="w-4 h-4" />
                  </Link>
                );
              })}
            </div>

            <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-xs font-mono font-medium bg-muted text-muted-foreground">
              {user?.publicId}
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                void navigate({ to: "/login" });
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Critical Account Locked Banner */}
      {isAccountLocked && (
        <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-2 text-xs text-red-900 dark:text-red-200 text-center font-semibold flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span>SECURITY ALERT: Your checking account is LOCKED. Outbound transfers and beneficiary updates are restricted.</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6">{children}</main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border/70 shadow-lg flex items-center justify-around px-2 py-1.5 backdrop-blur-md bg-card/95">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-medium transition-colors ${
                active ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Link
          to="/app/security"
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-medium transition-colors ${
            isActive("/app/security") || isActive("/app/devices") || isActive("/app/sessions")
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <KeyRound className="w-5 h-5 mb-0.5" />
          <span>More</span>
        </Link>
      </nav>
    </div>
  );
}
