import { createFileRoute, redirect } from "@tanstack/react-router";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import { AdminShell } from "@/components/admin-shell";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  BookOpen,
  Key,
  Shield,
  Layers,
  Code2,
  FileText,
  Activity,
  Play,
  CheckCircle2,
  Terminal,
} from "lucide-react";

export const Route = createFileRoute("/admin/docs")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminDocsPage,
});

function AdminDocsPage() {
  return (
    <AdminShell>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-500" />
            Integration Specifications & Demo Documentation
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Architectural reference, v1.0 telemetry contract, cryptographic signing recipe, and the complete evaluation script.
          </p>
        </div>

        {/* 1. Architecture & Connection Overview */}
        <Card className="border-border/60 bg-zinc-950/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-100">
              <Layers className="w-4 h-4 text-emerald-400" />
              1. Bidirectional Integration Architecture (§10)
            </CardTitle>
            <CardDescription className="text-xs">
              How HonorPay Target System connects to Ethio-Cyber Shield (ECS).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-zinc-300 leading-relaxed">
            <p>
              The system communicates with <strong>Ethio-Cyber Shield (ECS)</strong> across two symmetric directions:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg border border-border/50 bg-zinc-900/40 space-y-1">
                <div className="font-semibold text-emerald-400 flex items-center gap-1.5 font-mono">
                  Direction A: Target → ECS (Outbound Push)
                </div>
                <p className="text-[11px] text-zinc-400">
                  Target system pushes standard v1.0 JSON security events from the durable outbox to ECS at{" "}
                  <code className="text-emerald-300">POST /api/events</code>, signed with the configured Outbound HMAC secret.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border/50 bg-zinc-900/40 space-y-1">
                <div className="font-semibold text-blue-400 flex items-center gap-1.5 font-mono">
                  Direction B: ECS → Target (Inbound Control & Read)
                </div>
                <p className="text-[11px] text-zinc-400">
                  ECS investigates via <code className="text-blue-300">GET /api/public/security/*</code> and mitigates via{" "}
                  <code className="text-blue-300">POST /api/public/security/controls/*</code> using scoped HMAC API keys.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Telemetry Contract v1.0 */}
        <Card className="border-border/60 bg-zinc-950/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-100">
              <Activity className="w-4 h-4 text-emerald-400" />
              2. Security Telemetry Contract v1.0 Envelope (§8)
            </CardTitle>
            <CardDescription className="text-xs">
              Strictly typed telemetry payload emitted to security_events and pushed to ECS.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <pre className="p-3.5 rounded-lg border border-border/50 bg-black text-emerald-400 text-[11px] font-mono overflow-x-auto leading-relaxed">
{`{
  "schema_version": "1.0",
  "event_id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "event_type": "LOGIN_FAILED",                // UPPER_SNAKE (§8 table)
  "occurred_at": "2026-10-15T02:30:00+03:00",    // ISO-8601 with timezone offset
  "source_system": "shieldbank-testbed",
  "user_id": "USR_CHALTU",                     // Public identifier or null
  "account_id": "ACC_CHALTU_1",
  "session_id": "SESS_8821",
  "device_id": "DEV_77",
  "source_ip": "198.51.100.22",
  "endpoint": "/api/auth/login",
  "result": "FAILURE",                         // SUCCESS | FAILURE | DENIED | BLOCKED | PENDING
  "amount": 180000,                            // Whole ETB at top level
  "currency": "ETB",
  "beneficiary_id": "BEN_91",
  "transaction_id": "TX_10492",
  "attributes": {
    "consecutive_failures_for_identifier": 6,
    "lab_scenario_id": "account_takeover",
    "reason": "WRONG_PASSWORD"
  }
}`}
            </pre>
          </CardContent>
        </Card>

        {/* 3. Inbound Scopes & Endpoints */}
        <Card className="border-border/60 bg-zinc-950/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-100">
              <Key className="w-4 h-4 text-amber-400" />
              3. Inbound API Endpoints & Role Scopes (§9, §10)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono">
                <thead className="bg-zinc-900/60 text-zinc-400 uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Method & Path</th>
                    <th className="py-2 px-3">Required Scope</th>
                    <th className="py-2 px-3">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30 text-zinc-300 text-[11px]">
                  <tr>
                    <td className="py-2 px-3 text-emerald-400">GET /api/public/security/health</td>
                    <td className="py-2 px-3 text-zinc-500">None (Public)</td>
                    <td>Health status, lab_mode flag, and server time</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-emerald-400">GET /api/public/security/events</td>
                    <td className="py-2 px-3 text-amber-400">read:investigation</td>
                    <td>Pull stream with sequential paging (?since_seq=N)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-emerald-400">GET /api/public/security/accounts/:id</td>
                    <td className="py-2 px-3 text-amber-400">read:investigation</td>
                    <td>Inspect balance, transactions, and status</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-purple-400">POST /api/public/security/controls/freeze-transaction</td>
                    <td className="py-2 px-3 text-purple-400">control:freeze-transaction</td>
                    <td>Halt PROCESSING transfer & refund sender funds</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-purple-400">POST /api/public/security/controls/revoke-session</td>
                    <td className="py-2 px-3 text-purple-400">control:revoke-session</td>
                    <td>Terminate malicious session or all user sessions</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-purple-400">POST /api/public/security/controls/block-ip</td>
                    <td className="py-2 px-3 text-purple-400">control:block-ip</td>
                    <td>Enforce network IP ban with duration</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-purple-400">POST /api/public/security/controls/lock-account</td>
                    <td className="py-2 px-3 text-purple-400">control:lock-account</td>
                    <td>Enforce administrative account lockout</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-purple-400">POST /api/public/security/controls/revert</td>
                    <td className="py-2 px-3 text-purple-400">control:revert</td>
                    <td>Roll back executed mitigation with audit trail</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-blue-400">POST /api/public/lab/run-scenario</td>
                    <td className="py-2 px-3 text-blue-400">lab:run</td>
                    <td>Trigger synthetic attack simulation in LAB mode</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 4. Python Signing Recipe (ECS-side) */}
        <Card className="border-border/60 bg-zinc-950/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-100">
              <Terminal className="w-4 h-4 text-emerald-400" />
              4. Python HMAC Signing Recipe (ECS Reference)
            </CardTitle>
            <CardDescription className="text-xs">
              Drop this helper into Ethio-Cyber-Shield (Python/Flask) to sign control calls and verify incoming telemetry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <pre className="p-3.5 rounded-lg border border-border/50 bg-black text-emerald-400 text-[11px] font-mono overflow-x-auto leading-relaxed">
{`import hmac, hashlib, time, uuid, json, requests

def sign_headers(key_id: str, secret: str, method: str, path: str, raw_body: bytes) -> dict:
    ts = str(int(time.time()))
    nonce = str(uuid.uuid4())
    body_hash = hashlib.sha256(raw_body).hexdigest()
    canonical = f"{ts}\\n{nonce}\\n{method.upper()}\\n{path}\\n{body_hash}"
    sig = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    return {
        "X-ECS-Key-Id": key_id,
        "X-ECS-Timestamp": ts,
        "X-ECS-Nonce": nonce,
        "X-ECS-Signature": sig,
        "Content-Type": "application/json",
    }

def call_target(base_url: str, key_id: str, secret: str, method: str, path: str, payload=None):
    raw = json.dumps(payload, separators=(",", ":")).encode() if payload is not None else b""
    headers = sign_headers(key_id, secret, method, path, raw)
    return requests.request(method, base_url + path, data=raw, headers=headers, timeout=10)

# Example: Freeze a suspicious transfer from ECS
# resp = call_target("http://localhost:3000", KEY_ID, SECRET, "POST",
#                    "/api/public/security/controls/freeze-transaction",
#                    {"transaction_id": "TX_ATO_1234", "reason": "ATO-001 critical anomaly", "alert_id": "ALT-101"})
# print(resp.json())`}
            </pre>
          </CardContent>
        </Card>

        {/* 5. Complete Competition Demo Script */}
        <Card className="border-border/60 bg-zinc-950/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-100">
              <Play className="w-4 h-4 text-emerald-400" />
              5. End-to-End Evaluation Demo Script
            </CardTitle>
            <CardDescription className="text-xs">
              Complete workflow demonstrating telemetry capture, anomaly detection, and automated mitigation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-zinc-300">
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-border/40 bg-zinc-900/40 space-y-1">
                <div className="font-bold text-zinc-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-mono text-[10px]">1</span>
                  Step 1: Baseline Normal Activity
                </div>
                <p className="text-[11px] text-zinc-400">
                  Open customer app at <code className="text-zinc-200">/app</code> or execute <em>Normal Activity</em> in Lab Console. A routine transfer of 1,500 ETB completes successfully, emitting low-risk telemetry.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border/40 bg-zinc-900/40 space-y-1">
                <div className="font-bold text-zinc-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center font-mono text-[10px]">2</span>
                  Step 2: Trigger Account Takeover Scenario
                </div>
                <p className="text-[11px] text-zinc-400">
                  In <strong>Admin → Lab Console</strong>, click <strong>"Run Account Takeover Scenario"</strong>. The system generates 6 failed logins, 1 login from a new hardware hash, adds an external beneficiary, and submits a 180,000 ETB transfer held in <code className="text-amber-300">PROCESSING</code>.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border/40 bg-zinc-900/40 space-y-1">
                <div className="font-bold text-zinc-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-mono text-[10px]">3</span>
                  Step 3: ECS Correlation & Threat Detection
                </div>
                <p className="text-[11px] text-zinc-400">
                  ECS receives the signed event stream, flags the ATO correlation pattern (ATO-001) and off-hours high-value transfer (TX-001/TX-003), raising a CRITICAL alert.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border/40 bg-zinc-900/40 space-y-1">
                <div className="font-bold text-zinc-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-mono text-[10px]">4</span>
                  Step 4: Active Containment via Inbound Controls
                </div>
                <p className="text-[11px] text-zinc-400">
                  ECS automatically issues <code className="text-purple-300">POST /api/public/security/controls/freeze-transaction</code> and <code className="text-purple-300">/revoke-session</code>. The target system immediately cancels the transfer, refunds the 180,000 ETB balance, terminates the rogue session, and writes balanced double-entry audit records.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border/40 bg-zinc-900/40 space-y-1">
                <div className="font-bold text-zinc-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-mono text-[10px]">5</span>
                  Step 5: Verification in Control Room
                </div>
                <p className="text-[11px] text-zinc-400">
                  In <strong>Admin → Transactions</strong>, verify the transaction status is <code className="text-purple-400">FROZEN</code> with balanced double-entry ledger refund. In <strong>Admin → Response Log</strong>, inspect the confirmed control action with ECS alert reference.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
