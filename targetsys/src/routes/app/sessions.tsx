import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CustomerShell } from "@/components/customer-shell";
import { getSessionsFn, revokeSessionFn } from "@/lib/banking.functions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Lock,
  ShieldCheck,
  ShieldAlert,
  Globe,
  Clock,
  Laptop,
  CheckCircle2,
  LogOut,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/app/sessions")({
  component: SessionsPage,
});

interface TargetSessionItem {
  id: string;
  public_id: string;
  user_id: string;
  ip: string;
  user_agent?: string | null;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  revoked_by?: string | null;
  revoked_reason?: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  device?: {
    label: string;
    fingerprint_hash: string;
    trusted: boolean;
  } | null;
}

function SessionsPage() {
  const { user, session: currentAuthSession, isLoading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<TargetSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      void navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const res = await getSessionsFn();
      setSessions(res as TargetSessionItem[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadSessions();
    }
  }, [user]);

  const handleRevoke = async (sessionPublicId: string) => {
    if (!confirm("Are you sure you want to terminate this session? The device will be signed out immediately.")) {
      return;
    }

    setRevokingId(sessionPublicId);
    setError(null);
    try {
      await revokeSessionFn({ data: { sessionPublicId } });
      setSuccessMsg("Session revoked successfully. The client will be rejected on its next request.");
      await loadSessions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke session.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllOthers = async () => {
    const others = sessions.filter(
      (s) => s.status === "ACTIVE" && s.public_id !== currentAuthSession?.publicId,
    );
    if (others.length === 0) return;

    if (!confirm(`Are you sure you want to terminate all ${others.length} other active session(s)?`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      for (const s of others) {
        await revokeSessionFn({ data: { sessionPublicId: s.public_id } });
      }
      setSuccessMsg(`Successfully revoked ${others.length} other session(s).`);
      await loadSessions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke all sessions.");
    } finally {
      setLoading(false);
    }
  };

  const otherActiveCount = sessions.filter(
    (s) => s.status === "ACTIVE" && s.public_id !== currentAuthSession?.publicId,
  ).length;

  return (
    <CustomerShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Lock className="w-6 h-6 text-emerald-600" />
              Active Login Sessions
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Review and terminate active web and mobile sessions logged into your HonorPay account.
            </p>
          </div>

          {otherActiveCount > 0 && (
            <Button
              variant="outline"
              onClick={() => void handleRevokeAllOthers()}
              disabled={loading}
              className="text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1.5 self-start sm:self-auto"
            >
              <LogOut className="w-3.5 h-3.5" />
              Revoke All Other Sessions ({otherActiveCount})
            </Button>
          )}
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <ShieldAlert className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMsg && (
          <Alert className="bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/40">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <AlertDescription>{successMsg}</AlertDescription>
          </Alert>
        )}

        {/* Sessions List */}
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            Loading active sessions...
          </div>
        ) : sessions.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-sm text-muted-foreground">No sessions found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((sess) => {
              const isCurrent = sess.public_id === currentAuthSession?.publicId;
              const isActive = sess.status === "ACTIVE";

              return (
                <Card
                  key={sess.id}
                  className={`transition-colors border ${
                    isCurrent
                      ? "border-emerald-500/50 bg-emerald-500/5 shadow-sm"
                      : "border-border/60 bg-card/60"
                  }`}
                >
                  <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Laptop className="w-4 h-4 text-muted-foreground" />
                          <span>{sess.device?.label ?? "Browser Session"}</span>
                        </CardTitle>

                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Current Session
                          </span>
                        )}

                        {!isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                            <AlertTriangle className="w-3 h-3" />
                            {sess.status}
                          </span>
                        )}
                      </div>

                      <CardDescription className="text-xs font-mono">
                        Session ID: {sess.public_id}
                      </CardDescription>
                    </div>

                    {/* Revoke Action */}
                    {!isCurrent && isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revokingId === sess.public_id}
                        onClick={() => void handleRevoke(sess.public_id)}
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 h-8 px-2.5"
                      >
                        <LogOut className="w-3.5 h-3.5 mr-1" />
                        {revokingId === sess.public_id ? "Revoking..." : "Revoke"}
                      </Button>
                    )}

                    {isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await logout();
                          void navigate({ to: "/login" });
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5"
                      >
                        Sign Out
                      </Button>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-muted/40 p-3 rounded-lg font-mono text-[11px]">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <span>IP Address:</span>
                        <span className="text-foreground font-semibold">{sess.ip}</span>
                      </div>

                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <span>Last Seen:</span>
                        <span className="text-foreground">
                          {new Date(sess.last_seen_at).toLocaleString()}
                        </span>
                      </div>

                      {sess.user_agent && (
                        <div className="sm:col-span-2 text-muted-foreground truncate" title={sess.user_agent}>
                          <span className="text-foreground/70">Client: </span>
                          {sess.user_agent}
                        </div>
                      )}

                      {!isActive && sess.revoked_reason && (
                        <div className="sm:col-span-2 text-red-600 dark:text-red-400">
                          <span>Revoked Reason: </span>
                          <span className="font-sans font-medium">{sess.revoked_reason}</span>
                          {sess.revoked_by && (
                            <span className="ml-1 text-muted-foreground font-sans">
                              (by {sess.revoked_by})
                            </span>
                          )}
                        </div>
                      )}
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
