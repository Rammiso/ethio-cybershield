import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CustomerShell } from "@/components/customer-shell";
import {
  getProfileDetailsFn,
  updateCustomerProfileFn,
  changeCustomerPasswordFn,
  requestOtpChallengeFn,
  verifyOtpChallengeFn,
} from "@/lib/banking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  KeyRound,
  User,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Phone,
  MessageSquare,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/app/security")({
  component: SecurityPage,
});

interface ProfileData {
  full_name: string;
  phone: string | null;
  step_up_until: string | null;
  last_login_at: string | null;
  updated_at: string;
}

interface AccountData {
  id: string;
  public_id: string;
  account_number: string;
  status: string;
}

function SecurityPage() {
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);

  // Profile Form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileUpdating, setProfileUpdating] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // Password Form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Step-Up OTP State
  const [profileOtpChallengeId, setProfileOtpChallengeId] = useState<string | null>(null);
  const [profileOtpCode, setProfileOtpCode] = useState("");
  const [profileOtpVerified, setProfileOtpVerified] = useState(false);
  const [profileOtpError, setProfileOtpError] = useState<string | null>(null);

  const [passwordOtpChallengeId, setPasswordOtpChallengeId] = useState<string | null>(null);
  const [passwordOtpCode, setPasswordOtpCode] = useState("");
  const [passwordOtpVerified, setPasswordOtpVerified] = useState(false);
  const [passwordOtpError, setPasswordOtpError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      void navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getProfileDetailsFn();
      if (res?.profile) {
        setProfile(res.profile as ProfileData);
        setFullName(res.profile.full_name || "");
        setPhone(res.profile.phone || "");
      }
      if (res?.account) {
        setAccount(res.account as AccountData);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadData();
    }
  }, [user]);

  const isStepUpActive =
    profile?.step_up_until && new Date(profile.step_up_until).getTime() > Date.now();

  // Profile OTP helpers
  const handleRequestProfileOtp = async () => {
    setProfileOtpError(null);
    try {
      const res = await requestOtpChallengeFn({ data: { purpose: "STEP_UP" } });
      setProfileOtpChallengeId(res.challengeId);
    } catch (err: unknown) {
      setProfileOtpError(err instanceof Error ? err.message : "Failed to generate security code.");
    }
  };

  const handleVerifyProfileOtp = async () => {
    if (!profileOtpChallengeId || profileOtpCode.length !== 6) return;
    setProfileOtpError(null);
    try {
      const res = await verifyOtpChallengeFn({
        data: { challengeId: profileOtpChallengeId, code: profileOtpCode },
      });
      if (res.ok) {
        setProfileOtpVerified(true);
      } else {
        setProfileOtpError(res.error || "Incorrect verification code.");
      }
    } catch (err: unknown) {
      setProfileOtpError(err instanceof Error ? err.message : "Failed to verify security code.");
    }
  };

  // Password OTP helpers
  const handleRequestPasswordOtp = async () => {
    setPasswordOtpError(null);
    try {
      const res = await requestOtpChallengeFn({ data: { purpose: "STEP_UP" } });
      setPasswordOtpChallengeId(res.challengeId);
    } catch (err: unknown) {
      setPasswordOtpError(err instanceof Error ? err.message : "Failed to generate security code.");
    }
  };

  const handleVerifyPasswordOtp = async () => {
    if (!passwordOtpChallengeId || passwordOtpCode.length !== 6) return;
    setPasswordOtpError(null);
    try {
      const res = await verifyOtpChallengeFn({
        data: { challengeId: passwordOtpChallengeId, code: passwordOtpCode },
      });
      if (res.ok) {
        setPasswordOtpVerified(true);
      } else {
        setPasswordOtpError(res.error || "Incorrect verification code.");
      }
    } catch (err: unknown) {
      setPasswordOtpError(err instanceof Error ? err.message : "Failed to verify security code.");
    }
  };

  // Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (isStepUpActive && !profileOtpVerified) {
      setProfileError("Step-up authentication is active. Please complete SMS verification.");
      return;
    }

    setProfileUpdating(true);
    try {
      await updateCustomerProfileFn({
        data: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          otpChallengeId: isStepUpActive ? profileOtpChallengeId : null,
        },
      });
      setProfileSuccess("Profile details updated successfully.");
      await refreshUser();
      await loadData();
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setProfileUpdating(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (isStepUpActive && !passwordOtpVerified) {
      setPasswordError("Step-up authentication is active. Please complete SMS verification.");
      return;
    }

    setPasswordUpdating(true);
    try {
      await changeCustomerPasswordFn({
        data: {
          currentPassword,
          newPassword,
          otpChallengeId: isStepUpActive ? passwordOtpChallengeId : null,
        },
      });
      setPasswordSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordOtpChallengeId(null);
      setPasswordOtpCode("");
      setPasswordOtpVerified(false);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setPasswordUpdating(false);
    }
  };

  return (
    <CustomerShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-emerald-600" />
            Security & Profile
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Manage your personal profile, credentials, and verification challenges.
          </p>
        </div>

        {/* Step-Up Status Banner */}
        {isStepUpActive ? (
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Step-Up Authentication is Active</h4>
              <p className="text-xs opacity-90 leading-relaxed">
                Your account is currently flagged for heightened security. Modifying profile details,
                changing passwords, or adding beneficiaries requires SMS OTP verification.
              </p>
              <div className="pt-1">
                <Link
                  to="/app/sms"
                  className="inline-flex items-center gap-1 text-xs font-semibold underline text-amber-800 dark:text-amber-300 hover:opacity-80"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Open Simulated SMS Inbox to read verification codes
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-border/60 bg-card/60 text-muted-foreground flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Step-Up Authentication: <strong className="text-foreground">Inactive</strong> (Standard posture)</span>
            </div>
            <Link to="/app/sms" className="text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium">
              <MessageSquare className="w-3.5 h-3.5" />
              SMS Inbox
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Profile Card */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
            <form onSubmit={(e) => void handleSaveProfile(e)}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-600" />
                  Personal Information
                </CardTitle>
                <CardDescription className="text-xs">
                  Update your display name and contact phone number.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                {profileError && (
                  <Alert variant="destructive">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <AlertDescription className="text-xs">{profileError}</AlertDescription>
                  </Alert>
                )}

                {profileSuccess && (
                  <Alert className="bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/40">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <AlertDescription className="text-xs">{profileSuccess}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="full-name" className="text-xs">Full Name</Label>
                  <Input
                    id="full-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Doe"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone-num" className="text-xs">Phone Number</Label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      id="phone-num"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+251 91 123 4567"
                      className="pl-9 font-mono"
                    />
                  </div>
                </div>

                {/* Step-Up OTP inline challenge */}
                {isStepUpActive && (
                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20 space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        Step-Up Verification Code
                      </span>
                      {!profileOtpChallengeId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRequestProfileOtp()}
                          className="h-6 text-[11px] px-2 text-amber-800 border-amber-300 hover:bg-amber-100"
                        >
                          Send Code
                        </Button>
                      ) : null}
                    </div>

                    {profileOtpChallengeId && !profileOtpVerified && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            placeholder="6-digit code"
                            maxLength={6}
                            value={profileOtpCode}
                            onChange={(e) => setProfileOtpCode(e.target.value)}
                            className="font-mono text-center tracking-widest text-sm h-8"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleVerifyProfileOtp()}
                            className="h-8 bg-amber-700 hover:bg-amber-800 text-white text-xs px-3"
                          >
                            Verify
                          </Button>
                        </div>
                        {profileOtpError && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">{profileOtpError}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Code sent to your phone. View in <Link to="/app/sms" className="underline font-medium text-amber-700">SMS Inbox</Link>.
                        </p>
                      </div>
                    )}

                    {profileOtpVerified && (
                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Code verified for this change.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-2 border-t border-border/40 flex justify-end">
                <Button
                  type="submit"
                  disabled={profileUpdating || (isStepUpActive && !profileOtpVerified)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                >
                  {profileUpdating ? "Saving..." : "Save Profile"}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {/* Password Card */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
            <form onSubmit={(e) => void handleChangePassword(e)}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  Change Password
                </CardTitle>
                <CardDescription className="text-xs">
                  Update your authentication password (minimum 8 characters).
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                {passwordError && (
                  <Alert variant="destructive">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <AlertDescription className="text-xs">{passwordError}</AlertDescription>
                  </Alert>
                )}

                {passwordSuccess && (
                  <Alert className="bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/40">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <AlertDescription className="text-xs">{passwordSuccess}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="curr-pass" className="text-xs">Current Password</Label>
                  <Input
                    id="curr-pass"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-pass" className="text-xs">New Password</Label>
                  <Input
                    id="new-pass"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-pass" className="text-xs">Confirm New Password</Label>
                  <Input
                    id="confirm-pass"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                {/* Step-Up OTP inline challenge */}
                {isStepUpActive && (
                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20 space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        Step-Up Verification Code
                      </span>
                      {!passwordOtpChallengeId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRequestPasswordOtp()}
                          className="h-6 text-[11px] px-2 text-amber-800 border-amber-300 hover:bg-amber-100"
                        >
                          Send Code
                        </Button>
                      ) : null}
                    </div>

                    {passwordOtpChallengeId && !passwordOtpVerified && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            placeholder="6-digit code"
                            maxLength={6}
                            value={passwordOtpCode}
                            onChange={(e) => setPasswordOtpCode(e.target.value)}
                            className="font-mono text-center tracking-widest text-sm h-8"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleVerifyPasswordOtp()}
                            className="h-8 bg-amber-700 hover:bg-amber-800 text-white text-xs px-3"
                          >
                            Verify
                          </Button>
                        </div>
                        {passwordOtpError && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">{passwordOtpError}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Code sent to your phone. View in <Link to="/app/sms" className="underline font-medium text-amber-700">SMS Inbox</Link>.
                        </p>
                      </div>
                    )}

                    {passwordOtpVerified && (
                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Code verified for this change.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-2 border-t border-border/40 flex justify-end">
                <Button
                  type="submit"
                  disabled={passwordUpdating || (isStepUpActive && !passwordOtpVerified)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                >
                  {passwordUpdating ? "Updating..." : "Update Password"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        {/* Security Audit Card */}
        <Card className="border-border/60 bg-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Account & Security Identifiers
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="bg-card p-2.5 rounded-lg border border-border/40">
              <span className="text-muted-foreground block text-[11px]">User Public ID:</span>
              <span className="font-semibold text-foreground">{user?.publicId}</span>
            </div>
            <div className="bg-card p-2.5 rounded-lg border border-border/40">
              <span className="text-muted-foreground block text-[11px]">Checking Account ID:</span>
              <span className="font-semibold text-foreground">{account?.public_id ?? "N/A"}</span>
            </div>
            <div className="bg-card p-2.5 rounded-lg border border-border/40">
              <span className="text-muted-foreground block text-[11px]">Last Login:</span>
              <span className="text-foreground">
                {profile?.last_login_at
                  ? new Date(profile.last_login_at).toLocaleString()
                  : "Current session"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </CustomerShell>
  );
}
