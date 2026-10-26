import { createMiddleware } from "@tanstack/react-start";
import type { RequestContext } from "./telemetry.server";

/**
 * withTelemetry(endpoint): applied to EVERY server function.
 * Builds RequestContext, enforces IP blocklist + revoked sessions, scans inputs,
 * emits API_REQUEST, and exposes `context.tctx` to the handler.
 */
export function withTelemetry(endpoint: string, opts: { sensitive?: boolean } = {}) {
  return createMiddleware({ type: "function" }).server(async ({ next, data }) => {
    const t = await import("./telemetry.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const started = Date.now();
    const tctx: RequestContext = await t.buildRequestContext(endpoint);

    const { data: posture } = await supabaseAdmin
      .from("security_posture")
      .select("rate_limit_enabled,rate_limit_per_min,api_request_telemetry")
      .eq("id", 1)
      .single();

    const [reqIp, reqSess] = await Promise.all([
      t.countRecent("source_ip", tctx.ip),
      t.countRecent("session_id_pub", tctx.session?.publicId ?? null),
    ]);

    const isSequentialProbing = t.detectSequentialProbing(
      tctx.session?.publicId ?? tctx.ip ?? "anon",
      data,
    );

    const apiEvent = (status: number, result: "SUCCESS" | "FAILURE" | "DENIED" | "BLOCKED", extra: Record<string, unknown> = {}) => {
      if (posture?.api_request_telemetry === "SENSITIVE_ONLY" && !opts.sensitive && result === "SUCCESS") return Promise.resolve(null);
      return t.emitSecurityEvent(tctx, "API_REQUEST", {
        result,
        attributes: {
          method: tctx.method,
          status_code: status,
          duration_ms: Date.now() - started,
          requests_last_60s_ip: reqIp,
          requests_last_60s_session: reqSess,
          sequential_resource_probing: isSequentialProbing,
          ...extra,
        },
      });
    };

    // 1. IP blocklist
    if (await t.isIpBlocked(tctx.ip)) {
      await apiEvent(403, "BLOCKED", { reason: "IP_BLOCKED" });
      throw new Error("ACCESS_BLOCKED: Access from your network is temporarily blocked.");
    }

    // 2. Revoked / expired session
    const isPublicAuthEndpoint = endpoint === "loginFn" || endpoint === "registerFn";
    const isAccessCheckEndpoint = endpoint === "checkAdminAccess";
    if (tctx.session && tctx.session.status !== "ACTIVE") {
      if (!isPublicAuthEndpoint && !isAccessCheckEndpoint) {
        await t.emitSecurityEvent(tctx, "AUTHZ_DENIED", {
          result: "DENIED",
          attributes: {
            reason: tctx.session.status === "REVOKED" ? "SESSION_REVOKED" : `SESSION_${tctx.session.status}`,
            attempted_privilege: "owner",
            required_role: "active_session",
            actor_role: tctx.roles[0] ?? "none",
            resource_ref: endpoint,
          },
        });
        throw new Error("SESSION_ENDED: Your session was ended for security reasons.");
      } else {
        // Clear stale session on auth / access-check endpoints so flow redirects cleanly to login
        tctx.session = null;
        tctx.user = null;
        tctx.roles = [];
      }
    }

    // 3. Rate limit
    if (posture?.rate_limit_enabled && Math.max(reqIp, reqSess) >= posture.rate_limit_per_min) {
      await t.emitSecurityEvent(tctx, "RATE_LIMITED", {
        result: "BLOCKED",
        attributes: { requests_last_60s_ip: reqIp, requests_last_60s_session: reqSess, limit: posture.rate_limit_per_min },
      });
      throw new Error("RATE_LIMITED: Too many requests. Please slow down.");
    }

    // 4. Suspicious input scan (never executed; just observed)
    for (const hit of t.scanInputs(data)) {
      await t.emitSecurityEvent(tctx, "SUSPICIOUS_PARAMETER_PATTERN", { result: "PENDING", attributes: hit });
    }

    if (tctx.session) {
      void supabaseAdmin.from("target_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", tctx.session.id);
    }

    try {
      const result = await next({ context: { tctx } });
      await apiEvent(200, "SUCCESS");
      return result;
    } catch (e) {
      const status = e instanceof t.TelemetryError ? e.status : 500;
      await apiEvent(status, status === 403 || status === 401 ? "DENIED" : "FAILURE", {
        error_code: e instanceof t.TelemetryError ? e.code : "ERROR",
      });
      if (e instanceof t.TelemetryError) throw new Error(`${e.code}: ${e.message}`);
      throw e;
    }
  });
}
