import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import { AdminShell } from "@/components/admin-shell";
import {
  getOutboundConfigFn,
  saveOutboundConfigFn,
  sendTestEventFn,
  checkEcsHealthFn,
  retryOutboxEventsFn,
  getInboundKeysFn,
  createInboundKeyFn,
  revokeInboundKeyFn,
  rotateInboundKeyFn,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  PlugZap,
  KeyRound,
  Send,
  Activity,
  RotateCw,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Code2,
  Plus,
  RefreshCw,
  Clock,
  Terminal,
} from "lucide-react";

export const Route = createFileRoute("/admin/integration")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminIntegrationPage,
});

interface InboundKeyItem {
  id: string;
  key_id: string;
  label: string | null;
  scopes: string[];
  ip_allowlist: string[] | null;
  status: string;
  created_at: string;
  last_used_at: string | null;
  rotated_at: string | null;
}

const ALL_SCOPES = [
  { id: "read:investigation", label: "read:investigation", desc: "Read investigation baseline, accounts, and events" },
  { id: "control:freeze-transaction", label: "control:freeze-transaction", desc: "Freeze processing transfers" },
  { id: "control:revoke-session", label: "control:revoke-session", desc: "Revoke active web & mobile sessions" },
  { id: "control:require-step-up", label: "control:require-step-up", desc: "Force OTP verification on account" },
  { id: "control:disable-beneficiary", label: "control:disable-beneficiary", desc: "Disable suspicious beneficiaries" },
  { id: "control:block-ip", label: "control:block-ip", desc: "Temporarily block malicious IP addresses" },
  { id: "control:lock-account", label: "control:lock-account", desc: "Lock customer checking accounts" },
  { id: "control:revert", label: "control:revert", desc: "Revert active control actions" },
  { id: "lab:run", label: "lab:run", desc: "Execute synthetic attack simulation scenarios" },
];

function AdminIntegrationPage() {
  const { user } = useAuth();

  // Outbound Config State
  const [ecsBaseUrl, setEcsBaseUrl] = useState("");
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [outboundKeyId, setOutboundKeyId] = useState("");
  const [outboundSecret, setOutboundSecret] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [deliveryStats, setDeliveryStats] = useState({ pending: 0, delivered: 0, failed: 0, total: 0 });
  const [savingOutbound, setSavingOutbound] = useState(false);
  const [testingEvent, setTestingEvent] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [healthResult, setHealthResult] = useState<string | null>(null);

  // Inbound Keys State
  const [keys, setKeys] = useState<InboundKeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    "read:investigation",
    "control:freeze-transaction",
    "control:revoke-session",
    "control:require-step-up",
    "control:disable-beneficiary",
    "control:block-ip",
    "control:lock-account",
    "control:revert",
    "lab:run",
  ]);
  const [newKeyIpAllowlist, setNewKeyIpAllowlist] = useState("");
  const [createdSecretModal, setCreatedSecretModal] = useState<{ key_id: string; secret: string } | null>(null);

  // Feedback State
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = async () => {
    try {
      const [outbound, inboundKeys] = await Promise.all([
        getOutboundConfigFn(),
        getInboundKeysFn(),
      ]);

      if (outbound) {
        setEcsBaseUrl(outbound.settings?.ecs_base_url || "");
        setDeliveryEnabled(outbound.settings?.delivery_enabled ?? false);
        setIsConfigured(outbound.outboundCred?.configured ?? false);
        if (outbound.outboundCred?.key_id) {
          setOutboundKeyId(outbound.outboundCred.key_id);
        }
        if (outbound.deliveryStats) {
          setDeliveryStats(outbound.deliveryStats);
        }
      }

      setKeys(inboundKeys as InboundKeyItem[]);
    } catch {
      // ignore
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2500);
    } catch {
      // ignore
    }
  };

  const handleSaveOutbound = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOutbound(true);
    setAlertMsg(null);
    try {
      await saveOutboundConfigFn({
        data: {
          ecs_base_url: ecsBaseUrl.trim() || null,
          delivery_enabled: deliveryEnabled,
          key_id: outboundKeyId.trim() || null,
          secret: outboundSecret.trim() || null,
        },
      });
      setAlertMsg({ type: "success", text: "Outbound ECS integration configuration saved." });
      setOutboundSecret("");
      await loadData();
    } catch (err: unknown) {
      setAlertMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to save settings." });
    } finally {
      setSavingOutbound(false);
    }
  };

  const handleSendTestEvent = async () => {
    setTestingEvent(true);
    setAlertMsg(null);
    try {
      const res = await sendTestEventFn();
      if (res.ok) {
        setAlertMsg({ type: "success", text: `Test event sent! Delivery status: ${res.status} (Event ID: ${res.eventId})` });
      } else {
        setAlertMsg({ type: "error", text: `Test event not delivered: ${res.error || res.status}` });
      }
      await loadData();
    } catch (err: unknown) {
      setAlertMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to send test event." });
    } finally {
      setTestingEvent(false);
    }
  };

  const handleCheckHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await checkEcsHealthFn();
      setHealthResult(res.message);
      await loadData();
    } catch (err: unknown) {
      setHealthResult(err instanceof Error ? err.message : "Failed to reach ECS endpoint.");
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleRetryFailed = async () => {
    setRetryingFailed(true);
    setAlertMsg(null);
    try {
      const res = await retryOutboxEventsFn();
      setAlertMsg({ type: "success", text: `Retried ${res.retried} events: ${res.succeeded} succeeded, ${res.failed} failed.` });
      await loadData();
    } catch (err: unknown) {
      setAlertMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to retry events." });
    } finally {
      setRetryingFailed(false);
    }
  };

  const handleCreateInboundKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyLabel.trim()) return;

    try {
      const ipList = newKeyIpAllowlist
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await createInboundKeyFn({
        data: {
          label: newKeyLabel.trim(),
          scopes: newKeyScopes,
          ip_allowlist: ipList.length > 0 ? ipList : null,
        },
      });

      setCreatedSecretModal({ key_id: res.key_id, secret: res.secret });
      setCreateModalOpen(false);
      setNewKeyLabel("");
      setNewKeyIpAllowlist("");
      await loadData();
    } catch (err: unknown) {
      setAlertMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to create ECS key." });
    }
  };

  const handleRevokeKey = async (keyId: string, label: string) => {
    if (!confirm(`Are you sure you want to revoke key "${label}" (${keyId})? It will be disabled immediately.`)) {
      return;
    }
    try {
      await revokeInboundKeyFn({ data: { keyId } });
      setAlertMsg({ type: "success", text: `Key ${keyId} has been revoked.` });
      await loadData();
    } catch (err: unknown) {
      setAlertMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to revoke key." });
    }
  };

  const handleRotateKey = async (keyId: string) => {
    if (!confirm(`Rotate secret for key ${keyId}? The current secret will stop working immediately.`)) {
      return;
    }
    try {
      const res = await rotateInboundKeyFn({ data: { keyId } });
      setCreatedSecretModal({ key_id: keyId, secret: res.new_secret });
      await loadData();
    } catch (err: unknown) {
      setAlertMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to rotate key." });
    }
  };

  const exampleCurl = `# 1. Compute Unix timestamp and UUID nonce
TIMESTAMP=$(date +%s)
NONCE=$(uuidgen | tr '[:upper:]' '[:lower:]')
METHOD="GET"
PATH="/api/public/security/events?since_seq=0"
BODY=""

# 2. Compute canonical string and HMAC signature
BODY_HASH=$(echo -n "$BODY" | sha256sum | awk '{print $1}')
CANONICAL="\${TIMESTAMP}\n\${NONCE}\n\${METHOD}\n\${PATH}\n\${BODY_HASH}"
SIGNATURE=$(echo -en "$CANONICAL" | openssl dgst -sha256 -hmac "YOUR_ECS_SECRET" | awk '{print $2}')

# 3. Dispatch authenticated request
curl -i -X GET "http://localhost:3000\${PATH}" \\
  -H "X-ECS-Key-Id: ecs_live_your_key_id" \\
  -H "X-ECS-Timestamp: \${TIMESTAMP}" \\
  -H "X-ECS-Nonce: \${NONCE}" \\
  -H "X-ECS-Signature: \${SIGNATURE}"`;

  return (
    <AdminShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <PlugZap className="w-6 h-6 text-amber-500" />
            ECS Integration & API Keys
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Configure telemetry delivery to the Emergency Containment System (Direction A) and manage inbound response keys (Direction B).
          </p>
        </div>

        {/* Global Alert */}
        {alertMsg && (
          <Alert variant={alertMsg.type === "error" ? "destructive" : "default"} className={alertMsg.type === "success" ? "bg-emerald-50 text-emerald-950 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200" : ""}>
            {alertMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4" />}
            <AlertDescription className="text-xs">{alertMsg.text}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* DIRECTION A: Outbound to ECS */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
            <form onSubmit={(e) => void handleSaveOutbound(e)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="w-4 h-4 text-emerald-600" />
                    Direction A: Outbound to ECS
                  </CardTitle>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                    deliveryEnabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"
                  }`}>
                    {deliveryEnabled ? "DELIVERY ACTIVE" : "DELIVERY PAUSED"}
                  </span>
                </div>
                <CardDescription className="text-xs">
                  Pushes signed telemetry events to <code>{`{ecs_base_url}/api/events`}</code> via the outbox pattern.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                {/* Stats Bar */}
                <div className="grid grid-cols-3 gap-2 bg-muted/40 p-2.5 rounded-lg text-center font-mono text-[11px]">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">PENDING</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">{deliveryStats.pending}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">DELIVERED</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{deliveryStats.delivered}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">FAILED</span>
                    <span className="font-bold text-red-600 dark:text-red-400">{deliveryStats.failed}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-card">
                  <div className="space-y-0.5">
                    <Label htmlFor="delivery-toggle" className="text-xs font-semibold cursor-pointer">
                      Enable Asynchronous Event Push
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      When paused, events stay in the outbox with status PENDING.
                    </p>
                  </div>
                  <Switch
                    id="delivery-toggle"
                    checked={deliveryEnabled}
                    onCheckedChange={setDeliveryEnabled}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ecs-url" className="text-xs">ECS Base URL</Label>
                  <Input
                    id="ecs-url"
                    placeholder="e.g. http://127.0.0.1:4000 or https://ecs.shieldbank.test"
                    value={ecsBaseUrl}
                    onChange={(e) => setEcsBaseUrl(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ecs-key-id" className="text-xs">ECS Key ID</Label>
                    <Input
                      id="ecs-key-id"
                      placeholder="e.g. ecs_outbound_key_id"
                      value={outboundKeyId}
                      onChange={(e) => setOutboundKeyId(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ecs-secret" className="text-xs">
                      ECS Secret {isConfigured && <span className="text-muted-foreground">(encrypted)</span>}
                    </Label>
                    <Input
                      id="ecs-secret"
                      type="password"
                      placeholder={isConfigured ? "••••••••••••••••" : "Paste secret"}
                      value={outboundSecret}
                      onChange={(e) => setOutboundSecret(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                {healthResult && (
                  <div className="p-2 rounded bg-muted text-[11px] font-mono flex items-center justify-between">
                    <span>Health check: {healthResult}</span>
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCheckHealth()}
                    disabled={checkingHealth || !ecsBaseUrl}
                    className="h-8 text-xs gap-1"
                  >
                    <Activity className={`w-3.5 h-3.5 ${checkingHealth ? "animate-spin" : ""}`} />
                    Check Health
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSendTestEvent()}
                    disabled={testingEvent}
                    className="h-8 text-xs gap-1"
                  >
                    <Send className={`w-3.5 h-3.5 ${testingEvent ? "animate-spin" : ""}`} />
                    Send Test Event
                  </Button>
                  {deliveryStats.failed > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRetryFailed()}
                      disabled={retryingFailed}
                      className="h-8 text-xs gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${retryingFailed ? "animate-spin" : ""}`} />
                      Retry Failed ({deliveryStats.failed})
                    </Button>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={savingOutbound}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8"
                >
                  {savingOutbound ? "Saving..." : "Save Outbound Config"}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {/* DIRECTION B: Inbound Keys from ECS */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm flex flex-col justify-between">
            <div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-500" />
                    Direction B: Inbound Keys
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Credentials issued to ECS to query read endpoints and execute security controls.
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  onClick={() => setCreateModalOpen(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1 h-8 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create ECS Key
                </Button>
              </CardHeader>

              <CardContent className="space-y-3 text-xs">
                {loadingKeys ? (
                  <div className="p-8 text-center text-muted-foreground">Loading credentials...</div>
                ) : keys.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                    <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold text-foreground">No Inbound Keys Configured</p>
                    <p className="text-[11px] max-w-xs mx-auto mt-1">
                      Create an inbound key so ECS can pull telemetry events and enforce containment controls.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {keys.map((k) => (
                      <div
                        key={k.id}
                        className={`p-3 rounded-lg border text-xs font-mono transition-colors ${
                          k.status === "ACTIVE"
                            ? "bg-card border-border/60"
                            : "bg-muted/30 border-dashed border-border/40 opacity-70"
                        }`}
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-border/40 font-sans">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{k.label || "ECS Key"}</span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                              k.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                            }`}>
                              {k.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {k.status === "ACTIVE" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void handleRotateKey(k.key_id)}
                                  className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                                >
                                  Rotate
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void handleRevokeKey(k.key_id, k.label || k.key_id)}
                                  className="h-6 text-[10px] px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  Revoke
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 space-y-1 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground font-sans">Key ID:</span>
                            <span className="text-foreground select-all font-semibold">{k.key_id}</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground font-sans">Scopes:</span>
                            <span className="text-amber-700 dark:text-amber-400 font-sans text-[10px]">
                              {k.scopes.length} scope(s) granted
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-muted-foreground text-[10px] pt-1">
                            <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                            <span>Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </div>

            <CardFooter className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground flex justify-between">
              <span>Secrets are encrypted at rest with AES-GCM (APP_ENCRYPTION_KEY).</span>
              <Button variant="ghost" size="sm" onClick={() => void loadData()} className="h-6 text-xs px-2">
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* ECS Integration Contract Panel */}
        <Card className="border-border/60 bg-zinc-950 text-zinc-100">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                ECS Integration Contract (HMAC-SHA256 Reference Recipe)
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopy(exampleCurl, "curl")}
                className="h-7 text-[11px] gap-1 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              >
                {copiedText === "curl" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedText === "curl" ? "Copied" : "Copy Example curl"}
              </Button>
            </div>
            <CardDescription className="text-zinc-400 text-xs">
              Every request between HonorPay and ECS must be signed per §10 Direction A and Direction B.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 text-xs font-mono">
            <div className="p-3 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 overflow-x-auto space-y-1">
              <div className="text-emerald-400 font-bold">Canonical String Formula:</div>
              <div>canonical = `&#36;&#123;timestamp&#125;\n&#36;&#123;nonce&#125;\n&#36;&#123;METHOD&#125;\n&#36;&#123;path&#125;\n&#36;&#123;sha256hex(rawBody)&#125;`</div>
              <div className="pt-1 text-emerald-400 font-bold">Signature:</div>
              <div>X-ECS-Signature = hex(HMAC_SHA256(secret, canonical))</div>
            </div>

            <div className="p-3 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 overflow-x-auto whitespace-pre">
              {exampleCurl}
            </div>
          </CardContent>
        </Card>

        {/* Create Key Modal */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={(e) => void handleCreateInboundKey(e)}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-500" />
                  Create ECS Inbound Key
                </DialogTitle>
                <DialogDescription>
                  Issue a cryptographically signed API key for ECS investigation and control containment.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-3 text-xs">
                <div className="space-y-1.5">
                  <Label htmlFor="key-label">Key Label / Integration Name</Label>
                  <Input
                    id="key-label"
                    placeholder="e.g. ECS Production Primary, Incident Controller"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Granted Scopes</Label>
                  <div className="space-y-2 border border-border/60 p-2.5 rounded-lg max-h-48 overflow-y-auto">
                    {ALL_SCOPES.map((scope) => {
                      const checked = newKeyScopes.includes(scope.id);
                      return (
                        <label key={scope.id} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewKeyScopes([...newKeyScopes, scope.id]);
                              } else {
                                setNewKeyScopes(newKeyScopes.filter((s) => s !== scope.id));
                              }
                            }}
                            className="mt-0.5 rounded border-border"
                          />
                          <div>
                            <span className="font-mono font-semibold text-foreground block text-[11px]">{scope.label}</span>
                            <span className="text-muted-foreground text-[10px] block">{scope.desc}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ip-allow">Optional IP Allowlist</Label>
                  <Input
                    id="ip-allow"
                    placeholder="e.g. 198.51.100.5, 203.0.113.10"
                    value={newKeyIpAllowlist}
                    onChange={(e) => setNewKeyIpAllowlist(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">Leave blank to allow any IP address with valid signature.</p>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white">
                  Generate Key & Secret
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Display Secret ONCE Modal */}
        <Dialog open={!!createdSecretModal} onOpenChange={() => setCreatedSecretModal(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
                ECS Inbound Key Generated
              </DialogTitle>
              <DialogDescription>
                Copy these credentials now. For security, this secret will <strong>never be shown again</strong>.
              </DialogDescription>
            </DialogHeader>

            {createdSecretModal && (
              <div className="space-y-4 py-2 text-xs">
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                  <p className="font-semibold text-xs flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    Save this secret key immediately!
                  </p>
                  <p className="text-[11px] mt-0.5">
                    It is encrypted at rest using AES-GCM and cannot be retrieved once this window is closed.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Key ID (Public)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={createdSecretModal.key_id} className="font-mono text-xs select-all bg-muted" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopy(createdSecretModal.key_id, "key_id")}
                    >
                      {copiedText === "key_id" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">HMAC Secret (Private)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={createdSecretModal.secret} className="font-mono text-xs select-all bg-muted" />
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => void handleCopy(createdSecretModal.secret, "secret")}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      {copiedText === "secret" ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copiedText === "secret" ? "Copied" : "Copy Secret"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setCreatedSecretModal(null)} className="bg-zinc-800 hover:bg-zinc-700 text-white">
                Done & Acknowledged
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminShell>
  );
}
