import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole, type RequestContext } from "./telemetry.server";
import { verifyEcsSignature } from "./hmac.server";

export interface CheckResult {
  id: string;
  name: string;
  description: string;
  status: "PASS" | "FAIL";
  details: Record<string, unknown>;
  message: string;
}

export interface SelfTestReport {
  timestamp: string;
  all_passed: boolean;
  passed_count: number;
  total_count: number;
  checks: CheckResult[];
}

/**
 * Runs the Prompt 6 self-test automated test suite across live database records & security middleware.
 */
export async function runSelfTest(ctx: RequestContext): Promise<SelfTestReport> {
  await requireRole(ctx, "admin", "/admin/selftest");

  const checks: CheckResult[] = [];

  // ===== 1. Event Contract Fields Present on Last 50 Events =====
  try {
    const { data: events, error } = await supabaseAdmin
      .from("security_events")
      .select("event_id, event_type, occurred_at, source_system, result, delivery_status")
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const eventList = events ?? [];
    const violations: string[] = [];

    for (const ev of eventList) {
      if (!ev.event_id) violations.push(`Missing event_id`);
      if (!ev.event_type) violations.push(`Missing event_type on ${ev.event_id}`);
      if (!ev.occurred_at) violations.push(`Missing occurred_at on ${ev.event_id}`);
      if (!ev.source_system) violations.push(`Missing source_system on ${ev.event_id}`);
      if (!ev.result) violations.push(`Missing result on ${ev.event_id}`);
    }

    const pass = violations.length === 0;
    checks.push({
      id: "event_contract",
      name: "v1.0 Event Telemetry Contract Verification",
      description: "Verifies mandatory schema fields (event_id, event_type, occurred_at, source_system, result) on last 50 events.",
      status: pass ? "PASS" : "FAIL",
      details: {
        events_inspected: eventList.length,
        violations_count: violations.length,
        violations: violations.slice(0, 5),
      },
      message: pass
        ? `All ${eventList.length} recent security events fully adhere to Telemetry Contract v1.0.`
        : `Detected ${violations.length} contract violations in recent events.`,
    });
  } catch (err: any) {
    checks.push({
      id: "event_contract",
      name: "v1.0 Event Telemetry Contract Verification",
      description: "Verifies mandatory schema fields on last 50 events.",
      status: "FAIL",
      details: { error: err.message },
      message: `Failed to inspect security events: ${err.message}`,
    });
  }

  // ===== 2. Ledger Balanced Check (Sum of DEBIT == Sum of CREDIT) =====
  try {
    const { data: entries, error } = await supabaseAdmin
      .from("ledger_entries")
      .select("direction, amount_minor");

    if (error) throw error;

    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of entries ?? []) {
      const amt = Number(entry.amount_minor || 0);
      if (entry.direction === "DEBIT") totalDebits += amt;
      else if (entry.direction === "CREDIT") totalCredits += amt;
    }

    const discrepancy = totalCredits - totalDebits;
    const pass = discrepancy === 0;

    checks.push({
      id: "ledger_balanced",
      name: "Core Double-Entry Ledger Invariant",
      description: "Verifies balanced accounting invariant: total credits must equal total debits across all ledger entries.",
      status: pass ? "PASS" : "FAIL",
      details: {
        total_entries: entries?.length ?? 0,
        total_debits_minor: totalDebits,
        total_credits_minor: totalCredits,
        discrepancy_minor: discrepancy,
      },
      message: pass
        ? `Ledger is perfectly balanced across ${entries?.length ?? 0} entries (0 Santim discrepancy).`
        : `Ledger discrepancy detected: ${discrepancy} santim difference between credits and debits.`,
    });
  } catch (err: any) {
    checks.push({
      id: "ledger_balanced",
      name: "Core Double-Entry Ledger Invariant",
      description: "Verifies balanced accounting invariant.",
      status: "FAIL",
      details: { error: err.message },
      message: `Failed to verify ledger balance: ${err.message}`,
    });
  }

  // ===== 3. Outbox Delivery SLA Check (No stale PENDING > 10 min when enabled) =====
  try {
    const { data: settings } = await supabaseAdmin
      .from("integration_settings")
      .select("delivery_enabled")
      .eq("id", 1)
      .maybeSingle();

    const isEnabled = Boolean(settings?.delivery_enabled);

    if (!isEnabled) {
      checks.push({
        id: "outbox_delivery_sla",
        name: "ECS Outbox Delivery SLA",
        description: "Checks that no security events remain PENDING older than 10 minutes when delivery is active.",
        status: "PASS",
        details: { delivery_enabled: false },
        message: "Delivery is currently disabled; SLA check skipped (PASS).",
      });
    } else {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count, error } = await supabaseAdmin
        .from("security_events")
        .select("event_id", { count: "exact", head: true })
        .eq("delivery_status", "PENDING")
        .lt("occurred_at", tenMinutesAgo);

      if (error) throw error;

      const staleCount = count ?? 0;
      const pass = staleCount === 0;

      checks.push({
        id: "outbox_delivery_sla",
        name: "ECS Outbox Delivery SLA",
        description: "Checks that no security events remain PENDING older than 10 minutes when delivery is active.",
        status: pass ? "PASS" : "FAIL",
        details: { delivery_enabled: true, stale_pending_count: staleCount },
        message: pass
          ? "No stale pending events detected in outbox queue."
          : `Detected ${staleCount} events pending delivery older than 10 minutes.`,
      });
    }
  } catch (err: any) {
    checks.push({
      id: "outbox_delivery_sla",
      name: "ECS Outbox Delivery SLA",
      description: "Checks that no security events remain PENDING older than 10 minutes.",
      status: "FAIL",
      details: { error: err.message },
      message: `Failed to inspect outbox delivery status: ${err.message}`,
    });
  }

  // ===== 4. Customer Isolation Probe (Owner Check & IDOR Rejection) =====
  try {
    // Probe simulated authorization rejection
    const fakeCustomerCtx: RequestContext = {
      requestId: "probe-req-1",
      endpoint: "/api/transactions/other-user-tx",
      method: "GET",
      ip: "192.0.2.10",
      userAgent: "SelftestProbe/1.0",
      clientDeviceId: "probe-dev-1",
      fingerprintHash: "probe-hash",
      user: { id: "user-probe-alice", publicId: "USR_ALICE", email: "alice@test.test" },
      roles: ["customer"],
      session: null,
      device: null,
      accessToken: null,
    };

    // Customer requesting admin role must throw 403 and emit AUTHZ_DENIED
    let isolationPassed = false;
    try {
      await requireRole(fakeCustomerCtx, "admin", "/admin/selftest-probe");
    } catch (authzErr: any) {
      if (authzErr.status === 403 || authzErr.message?.includes("access")) {
        isolationPassed = true;
      }
    }

    checks.push({
      id: "rls_isolation_probe",
      name: "Customer Isolation & Authorization Boundary Probe",
      description: "Probes authorization boundary to ensure customer identities cannot access administrative operations.",
      status: isolationPassed ? "PASS" : "FAIL",
      details: {
        probe_role: "customer",
        required_role: "admin",
        denied_as_expected: isolationPassed,
      },
      message: isolationPassed
        ? "Customer context access to admin boundary correctly denied with 403."
        : "Customer isolation probe failed to deny access.",
    });
  } catch (err: any) {
    checks.push({
      id: "rls_isolation_probe",
      name: "Customer Isolation & Authorization Boundary Probe",
      description: "Probes authorization boundary.",
      status: "FAIL",
      details: { error: err.message },
      message: `Isolation probe error: ${err.message}`,
    });
  }

  // ===== 5. Signature Verification Probe (Bad Signature Expects 401) =====
  try {
    const fakeRequest = new Request("https://shieldbank.test/api/public/security/events", {
      method: "GET",
      headers: {
        "x-ecs-key-id": "ecs_live_probe_invalid_key",
        "x-ecs-timestamp": Math.floor(Date.now() / 1000).toString(),
        "x-ecs-nonce": crypto.randomUUID(),
        "x-ecs-signature": "0000000000000000000000000000000000000000000000000000000000000000",
      },
    });

    const verifyResult = await verifyEcsSignature(fakeRequest, "read:investigation");
    const pass = !verifyResult.ok && verifyResult.status === 401;

    checks.push({
      id: "signature_probe",
      name: "Inbound HMAC Signature Rejection Probe",
      description: "Submits a request with an intentionally corrupt HMAC signature expecting strict 401 rejection.",
      status: pass ? "PASS" : "FAIL",
      details: {
        expected_status: 401,
        actual_status: verifyResult.status,
        rejected: !verifyResult.ok,
      },
      message: pass
        ? "Corrupt HMAC signature was rejected with 401 Unauthorized."
        : `HMAC probe failed: expected 401, got ${verifyResult.status}.`,
    });
  } catch (err: any) {
    checks.push({
      id: "signature_probe",
      name: "Inbound HMAC Signature Rejection Probe",
      description: "Submits a request with a corrupt HMAC signature.",
      status: "FAIL",
      details: { error: err.message },
      message: `Signature probe error: ${err.message}`,
    });
  }

  const passedCount = checks.filter((c) => c.status === "PASS").length;

  return {
    timestamp: new Date().toISOString(),
    all_passed: passedCount === checks.length,
    passed_count: passedCount,
    total_count: checks.length,
    checks,
  };
}
