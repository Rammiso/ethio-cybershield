import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyEcsSignature } from "./hmac.server";
import {
  freezeTransaction,
  revokeSessionControl,
  requireStepUpControl,
  disableBeneficiaryControl,
  blockIpControl,
  lockAccountControl,
  revertControlAction,
} from "./controls.server";
import {
  getAccountByRef,
  getUserBaseline,
  getUserSessions,
  getUserDevices,
  getAccountTransactions,
  getAccountBeneficiaries,
} from "./public-read.server";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ error: { code, message } }, status);
}

/**
 * Main dispatcher for all inbound ECS and public security endpoints under /api/public/security/*
 */
export async function handlePublicSecurityApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // ===== 1. Public Health Check =====
  if (pathname === "/api/public/security/health") {
    if (request.method !== "GET") {
      return errorResponse("METHOD_NOT_ALLOWED", "Only GET method is supported", 405);
    }

    let labMode = true;
    try {
      const { data: posture } = await supabaseAdmin
        .from("security_posture")
        .select("lab_mode")
        .eq("id", 1)
        .maybeSingle();
      if (posture) labMode = posture.lab_mode;
    } catch {
      // Default to true in offline/test environments
    }

    return jsonResponse({
      status: "healthy",
      version: "1.0.0",
      lab_mode: labMode,
      server_time: new Date().toISOString(),
    });
  }

  // ===== 2. READ Endpoints (scope: read:investigation) =====
  if (
    pathname === "/api/public/security/events" ||
    pathname.startsWith("/api/public/security/accounts/") ||
    pathname.startsWith("/api/public/security/users/") ||
    pathname === "/api/public/security/sessions" ||
    pathname === "/api/public/security/devices" ||
    pathname === "/api/public/security/transactions" ||
    pathname === "/api/public/security/beneficiaries"
  ) {
    if (request.method !== "GET") {
      return errorResponse("METHOD_NOT_ALLOWED", "Only GET method is supported", 405);
    }

    const auth = await verifyEcsSignature(request, "read:investigation");
    if (!auth.ok) {
      return errorResponse(auth.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED", auth.error ?? "Unauthorized", auth.status ?? 401);
    }

    // 2a. Events Pull Endpoint
    if (pathname === "/api/public/security/events") {
      const sinceSeqParam = url.searchParams.get("since_seq");
      const limitParam = url.searchParams.get("limit");

      const sinceSeq = sinceSeqParam ? parseInt(sinceSeqParam, 10) : 0;
      const rawLimit = limitParam ? parseInt(limitParam, 10) : 100;
      const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 100 : rawLimit), 500);

      const { data: rows, error } = await supabaseAdmin
        .from("security_events")
        .select("*")
        .gt("seq", isNaN(sinceSeq) ? 0 : sinceSeq)
        .order("seq", { ascending: true })
        .limit(limit);

      if (error) {
        return errorResponse("SERVER_ERROR", "Failed to retrieve security events", 500);
      }

      const events = (rows ?? []).map((row) => ({
        schema_version: "1.0",
        event_id: row.event_id,
        event_type: row.event_type,
        occurred_at: row.occurred_at,
        source_system: row.source_system || "shieldbank-testbed",
        user_id: row.user_id_pub ?? null,
        account_id: row.account_id_pub ?? null,
        session_id: row.session_id_pub ?? null,
        device_id: row.device_id_pub ?? null,
        source_ip: row.source_ip ?? null,
        endpoint: row.endpoint ?? null,
        result: row.result,
        amount: row.amount_minor != null ? Math.round(row.amount_minor / 100) : null,
        currency: row.currency || (row.amount_minor != null ? "ETB" : null),
        beneficiary_id: row.beneficiary_id_pub ?? null,
        transaction_id: row.transaction_id_pub ?? null,
        attributes: (row.attributes as Record<string, unknown>) ?? {},
      }));

      const lastSeq = rows && rows.length > 0 ? rows[rows.length - 1]!.seq : (isNaN(sinceSeq) ? 0 : sinceSeq);

      return jsonResponse({
        events,
        next_seq: lastSeq,
      });
    }

    // 2b. Account detail
    if (pathname.startsWith("/api/public/security/accounts/")) {
      const accountRef = pathname.replace("/api/public/security/accounts/", "").trim();
      const account = await getAccountByRef(accountRef);
      if (!account) return errorResponse("NOT_FOUND", "Account not found", 404);
      return jsonResponse(account);
    }

    // 2c. User baseline detail
    if (pathname.startsWith("/api/public/security/users/")) {
      const userRef = pathname.replace("/api/public/security/users/", "").trim();
      const user = await getUserBaseline(userRef);
      if (!user) return errorResponse("NOT_FOUND", "User not found", 404);
      return jsonResponse(user);
    }

    // 2d. User sessions
    if (pathname === "/api/public/security/sessions") {
      const userRef = url.searchParams.get("user_id");
      if (!userRef) return errorResponse("BAD_REQUEST", "user_id query parameter is required", 400);
      const sessions = await getUserSessions(userRef);
      return jsonResponse({ sessions });
    }

    // 2e. User devices
    if (pathname === "/api/public/security/devices") {
      const userRef = url.searchParams.get("user_id");
      if (!userRef) return errorResponse("BAD_REQUEST", "user_id query parameter is required", 400);
      const devices = await getUserDevices(userRef);
      return jsonResponse({ devices });
    }

    // 2f. Account transactions
    if (pathname === "/api/public/security/transactions") {
      const accountRef = url.searchParams.get("account_id");
      const since = url.searchParams.get("since");
      if (!accountRef) return errorResponse("BAD_REQUEST", "account_id query parameter is required", 400);
      const transactions = await getAccountTransactions(accountRef, since);
      return jsonResponse({ transactions });
    }

    // 2g. Account beneficiaries
    if (pathname === "/api/public/security/beneficiaries") {
      const accountRef = url.searchParams.get("account_id");
      if (!accountRef) return errorResponse("BAD_REQUEST", "account_id query parameter is required", 400);
      const beneficiaries = await getAccountBeneficiaries(accountRef);
      return jsonResponse({ beneficiaries });
    }
  }

  // ===== 3. CONTROL Endpoints (each scope separate) =====
  if (pathname.startsWith("/api/public/security/controls/")) {
    if (request.method !== "POST") {
      return errorResponse("METHOD_NOT_ALLOWED", "Only POST method is supported", 405);
    }

    const controlAction = pathname.replace("/api/public/security/controls/", "").trim();
    const requiredScope = `control:${controlAction}`;

    const auth = await verifyEcsSignature(request, requiredScope);
    if (!auth.ok) {
      return errorResponse(auth.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED", auth.error ?? "Unauthorized", auth.status ?? 401);
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorResponse("BAD_REQUEST", "Invalid JSON request body", 400);
    }

    const keyId = auth.cred?.key_id ?? "ecs-key";

    switch (controlAction) {
      case "freeze-transaction": {
        if (!body.transaction_id || !body.reason || !body.alert_id) {
          return errorResponse("BAD_REQUEST", "transaction_id, reason, and alert_id are required", 400);
        }
        const result = await freezeTransaction(null, keyId, body);
        if (result.code === "ALREADY_COMPLETED") {
          return jsonResponse(result, 409);
        }
        return jsonResponse(result, result.status === "CONFIRMED" ? 200 : 400);
      }

      case "revoke-session": {
        if ((!body.session_id && !body.user_id) || !body.reason || !body.alert_id) {
          return errorResponse("BAD_REQUEST", "session_id (or user_id), reason, and alert_id are required", 400);
        }
        const result = await revokeSessionControl(null, keyId, body);
        return jsonResponse(result, result.status === "CONFIRMED" ? 200 : 400);
      }

      case "require-step-up": {
        if (!body.user_id || !body.reason || !body.alert_id) {
          return errorResponse("BAD_REQUEST", "user_id, reason, and alert_id are required", 400);
        }
        const result = await requireStepUpControl(null, keyId, body);
        return jsonResponse(result, result.status === "CONFIRMED" ? 200 : 400);
      }

      case "disable-beneficiary": {
        if (!body.beneficiary_id || !body.reason || !body.alert_id) {
          return errorResponse("BAD_REQUEST", "beneficiary_id, reason, and alert_id are required", 400);
        }
        const result = await disableBeneficiaryControl(null, keyId, body);
        return jsonResponse(result, result.status === "CONFIRMED" ? 200 : 400);
      }

      case "block-ip": {
        if (!body.ip || !body.reason || !body.alert_id) {
          return errorResponse("BAD_REQUEST", "ip, reason, and alert_id are required", 400);
        }
        const result = await blockIpControl(null, keyId, body);
        return jsonResponse(result, result.status === "CONFIRMED" ? 200 : 400);
      }

      case "lock-account": {
        if ((!body.account_id && !body.user_id) || !body.reason || !body.alert_id) {
          return errorResponse("BAD_REQUEST", "account_id (or user_id), reason, and alert_id are required", 400);
        }
        const result = await lockAccountControl(null, keyId, body);
        return jsonResponse(result, result.status === "CONFIRMED" ? 200 : 400);
      }

      case "revert": {
        if (!body.control_action_id) {
          return errorResponse("BAD_REQUEST", "control_action_id is required", 400);
        }
        const result = await revertControlAction(null, keyId, body);
        return jsonResponse(result, result.status === "CONFIRMED" ? 200 : 400);
      }

      default:
        return errorResponse("NOT_FOUND", `Unknown control action: ${controlAction}`, 404);
    }
  }

  return errorResponse("NOT_FOUND", "Endpoint not found", 404);
}
