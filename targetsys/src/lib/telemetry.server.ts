// Server-only telemetry core: request context, event emission, input scanning.
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RequestContext = {
  requestId: string;
  endpoint: string;
  method: string;
  ip: string | null;
  userAgent: string;
  secChUaPlatform: string | null;
  secChUa: string | null;
  clientDeviceId: string | null;
  fingerprintHash: string | null;
  deviceMac: string | null;
  networkType: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  user: { id: string; publicId: string; email: string } | null;
  roles: string[];
  session: { id: string; publicId: string; status: string } | null;
  device: { id: string; publicId: string } | null;
  accessToken: string | null;
  labScenarioId?: string;
};

export type EventFields = {
  result: "SUCCESS" | "FAILURE" | "DENIED" | "BLOCKED" | "PENDING";
  user_id?: string | null;
  account_id?: string | null;
  session_id?: string | null;
  device_id?: string | null;
  source_ip?: string | null;
  endpoint?: string | null;
  amount_minor?: number | null;
  currency?: string | null;
  beneficiary_id?: string | null;
  transaction_id?: string | null;
  attributes?: Record<string, unknown>;
};

export class TelemetryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function clientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

let mockRequestForTesting: Request | null = null;

export function setMockRequestForTesting(req: Request | null) {
  mockRequestForTesting = req;
}

export async function buildRequestContext(endpoint: string, explicitReq?: Request | null): Promise<RequestContext> {
  let req: Request | null = explicitReq ?? mockRequestForTesting ?? null;
  if (!req) {
    try {
      req = getRequest();
    } catch {
      req = null;
    }
  }

  const headers = req?.headers ?? new Headers();
  const userAgent = (headers.get("user-agent") ?? "").slice(0, 500);
  const secChUaPlatform = headers.get("sec-ch-ua-platform")?.replace(/"/g, "") ?? null;
  const secChUa = headers.get("sec-ch-ua") ?? null;
  const clientDeviceId = headers.get("x-device-id")?.slice(0, 100) ?? null;
  const deviceMac = headers.get("x-device-mac") ?? headers.get("x-mac-address") ?? null;
  const networkType = headers.get("x-network-type") ?? headers.get("x-connection-type") ?? null;
  const fingerprintHash = clientDeviceId ? await sha256Hex(`${clientDeviceId}|${userAgent}`) : null;

  const rawCity = headers.get("x-vercel-ip-city") || headers.get("cf-ipcity");
  const city = rawCity ? decodeURIComponent(rawCity).trim() : null;
  const country = headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry") || null;
  const region = headers.get("x-vercel-ip-country-region") || headers.get("cf-region") || null;
  const rawLat = headers.get("x-vercel-ip-latitude");
  const rawLon = headers.get("x-vercel-ip-longitude");
  const latitude = rawLat ? parseFloat(rawLat) : null;
  const longitude = rawLon ? parseFloat(rawLon) : null;

  const ctx: RequestContext = {
    requestId: crypto.randomUUID(),
    endpoint,
    method: req?.method ?? "GET",
    ip: req ? clientIp(req) : null,
    userAgent,
    secChUaPlatform,
    secChUa,
    clientDeviceId,
    fingerprintHash,
    deviceMac,
    networkType,
    city,
    region,
    country,
    latitude,
    longitude,
    user: null,
    roles: [],
    session: null,
    device: null,
    accessToken: null,
  };

  const entitiesHeader = headers.get("x-honorpay-entities");
  if (entitiesHeader) {
    try {
      const { localDb } = await import("@/integrations/supabase/local-store");
      localDb.syncFromEntities(JSON.parse(entitiesHeader));
    } catch {
      // ignore
    }
  }

  const auth = headers.get("authorization");
  let token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const cookieHeader = headers.get("cookie") || "";
  if (!token && cookieHeader) {
    const match = cookieHeader.match(/sb_access_token=([^;]+)/);
    if (match) token = decodeURIComponent(match[1]!);
  }

  let sessPub = headers.get("x-target-session");
  if (!sessPub && cookieHeader) {
    const match = cookieHeader.match(/sb_testbed_session_id=([^;]+)/);
    if (match) sessPub = decodeURIComponent(match[1]!);
  }

  if (token && token.split(".").length === 3) {
    let authUser: any = null;
    try {
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user) authUser = data.user;
    } catch {
      // fall through
    }

    if (!authUser) {
      const { parseMockJwt } = await import("@/integrations/supabase/local-store");
      const parsed = parseMockJwt(token);
      if (parsed) {
        authUser = { id: parsed.sub, email: parsed.email };
      }
    }

    if (authUser) {
      ctx.accessToken = token;
      const [{ data: prof }, { data: roles }] = await Promise.all([
        supabaseAdmin.from("profiles").select("public_id,email").eq("user_id", authUser.id).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", authUser.id),
      ]);
      if (prof) ctx.user = { id: authUser.id, publicId: prof.public_id, email: prof.email };
      ctx.roles = (roles ?? []).map((r) => r.role);
    }
  }

  // Session resolution: either from user or directly from session id
  if (sessPub) {
    const query = supabaseAdmin
      .from("target_sessions")
      .select("id,public_id,status,expires_at,device_id,user_id")
      .eq("public_id", sessPub);
    const { data: s } = ctx.user
      ? await query.eq("user_id", ctx.user.id).maybeSingle()
      : await query.maybeSingle();

    if (s) {
      if (!ctx.user && s.user_id) {
        const [{ data: prof }, { data: roles }] = await Promise.all([
          supabaseAdmin.from("profiles").select("public_id,email").eq("user_id", s.user_id).maybeSingle(),
          supabaseAdmin.from("user_roles").select("role").eq("user_id", s.user_id),
        ]);
        if (prof) ctx.user = { id: s.user_id, publicId: prof.public_id, email: prof.email };
        ctx.roles = (roles ?? []).map((r) => r.role);
      }

      let status = s.status;
      if (status === "ACTIVE" && new Date(s.expires_at).getTime() < Date.now()) {
        status = "EXPIRED";
        await supabaseAdmin.from("target_sessions").update({ status: "EXPIRED" }).eq("id", s.id);
      }
      ctx.session = { id: s.id, publicId: s.public_id, status };
      if (s.device_id) {
        const { data: d } = await supabaseAdmin
          .from("target_devices")
          .select("id,public_id")
          .eq("id", s.device_id)
          .maybeSingle();
        if (d) ctx.device = { id: d.id, publicId: d.public_id };
      }
    }
  }
  return ctx;
}

/** Inserts into security_events (the outbox). Never throws. Returns event_id or null. */
export async function emitSecurityEvent(
  ctx: RequestContext | null,
  eventType: string,
  fields: EventFields,
): Promise<string | null> {
  const attributes: Record<string, unknown> = { ...(fields.attributes ?? {}) };
  if (ctx?.labScenarioId) attributes["lab_scenario_id"] = ctx.labScenarioId;
  if (ctx) attributes["request_id"] = ctx.requestId;
  if (ctx?.userAgent && !attributes["user_agent"]) attributes["user_agent"] = ctx.userAgent;
  if (ctx?.secChUaPlatform && !attributes["sec_ch_ua_platform"]) attributes["sec_ch_ua_platform"] = ctx.secChUaPlatform;
  if (ctx?.secChUa && !attributes["sec_ch_ua"]) attributes["sec_ch_ua"] = ctx.secChUa;
  if (ctx?.clientDeviceId && !attributes["device_id"]) attributes["device_id"] = ctx.clientDeviceId;
  if (ctx?.fingerprintHash && !attributes["device_fingerprint"]) attributes["device_fingerprint"] = ctx.fingerprintHash;
  if (ctx?.deviceMac && !attributes["device_mac"]) attributes["device_mac"] = ctx.deviceMac;
  if (ctx?.networkType && !attributes["network_type"]) attributes["network_type"] = ctx.networkType;
  if (ctx?.city && !attributes["city"]) attributes["city"] = ctx.city;
  if (ctx?.region && !attributes["region"]) attributes["region"] = ctx.region;
  if (ctx?.country && !attributes["country"]) attributes["country"] = ctx.country;
  if (ctx?.latitude != null && attributes["latitude"] == null) attributes["latitude"] = ctx.latitude;
  if (ctx?.longitude != null && attributes["longitude"] == null) attributes["longitude"] = ctx.longitude;
  const row = {
    event_type: eventType,
    result: fields.result,
    user_id_pub: fields.user_id !== undefined ? fields.user_id : (ctx?.user?.publicId ?? null),
    account_id_pub: fields.account_id ?? null,
    session_id_pub: fields.session_id !== undefined ? fields.session_id : (ctx?.session?.publicId ?? null),
    device_id_pub: fields.device_id !== undefined ? fields.device_id : (ctx?.device?.publicId ?? null),
    source_ip: fields.source_ip !== undefined ? fields.source_ip : (ctx?.ip ?? null),
    endpoint: fields.endpoint !== undefined ? fields.endpoint : (ctx?.endpoint ?? null),
    amount_minor: fields.amount_minor ?? null,
    currency: fields.currency ?? null,
    beneficiary_id_pub: fields.beneficiary_id ?? null,
    transaction_id_pub: fields.transaction_id ?? null,
    attributes: attributes as never,
  };
  try {
    const { data, error } = await supabaseAdmin
      .from("security_events")
      .insert(row)
      .select("event_id")
      .single();
    if (error) throw error;

    // Outbox delivery worker (signed POST to ECS) - awaited so serverless does not freeze before delivery
    try {
      const { deliverEventToEcs, lazyRetryFailedDeliveries } = await import("./outbox.server");
      await deliverEventToEcs(data.event_id);
      lazyRetryFailedDeliveries();
    } catch {
      // Telemetry delivery failures must never throw or block
    }

    return data.event_id;
  } catch (e) {
    console.error("[telemetry] emit failed", eventType, e);
    return null;
  }
}

// In-memory sliding window for detecting sequential resource ID probing within 60 seconds
const RECENT_PROBES = new Map<string, Array<{ num: number; time: number }>>();

export function detectSequentialProbing(actorKey: string, data: unknown): boolean {
  if (!data) return false;
  const now = Date.now();

  const numbers: number[] = [];
  const extractNumbers = (val: unknown) => {
    if (typeof val === "number" && Number.isInteger(val)) {
      numbers.push(val);
    } else if (typeof val === "string") {
      const matches = val.match(/\d+/g);
      if (matches) {
        for (const m of matches) {
          const parsed = parseInt(m, 10);
          if (!isNaN(parsed) && parsed > 0) numbers.push(parsed);
        }
      }
    } else if (val && typeof val === "object") {
      for (const v of Object.values(val)) {
        extractNumbers(v);
      }
    }
  };

  extractNumbers(data);
  if (numbers.length === 0) return false;

  const history = RECENT_PROBES.get(actorKey) ?? [];
  const recent = history.filter((h) => now - h.time <= 60000);

  for (const n of numbers) {
    recent.push({ num: n, time: now });
  }
  RECENT_PROBES.set(actorKey, recent);

  if (recent.length < 3) return false;

  // Check if there are 3 sequential numbers (e.g. 1001, 1002, 1003)
  const sortedUnique = Array.from(new Set(recent.map((h) => h.num))).sort((a, b) => a - b);
  for (let i = 0; i <= sortedUnique.length - 3; i++) {
    const a = sortedUnique[i]!;
    const b = sortedUnique[i + 1]!;
    const c = sortedUnique[i + 2]!;
    if (b === a + 1 && c === b + 1) {
      return true;
    }
  }

  return false;
}

export async function writeAudit(
  actorType: "USER" | "ADMIN" | "ECS" | "SYSTEM",
  actorRef: string | null,
  action: string,
  entity: string | null,
  entityRef: string | null,
  detail: Record<string, unknown> = {},
) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_type: actorType,
    actor_ref: actorRef,
    action,
    entity,
    entity_ref: entityRef,
    detail: detail as never,
  });
}

// ===== Suspicious input scanning =====
const PATTERNS: Array<[string, RegExp]> = [
  [
    "SQLI",
    /(?:'\s*(?:or|and)\s+(?:'?[^'\s]+'?\s*=\s*'?[^'\s]+'?|\d+\s*=\s*\d+|true|false))|(?:'\s*or\s+''=')|(?:\b(?:or|and)\b\s+['"]?[\w]+['"]?\s*=\s*['"]?[\w]+['"]?)|(?:['"]\s*(?:--|#|\/\*))|(?:--\s*$)|(?:;\s*(?:drop|alter|truncate|delete|insert|update|exec|execute|declare|select)\b)|(?:\bunion\b\s+(?:all\s+)?\bselect\b)|(?:\b(?:sleep|pg_sleep|waitfor\s+delay|benchmark)\s*\(?)|(?:\b(?:schema|information_schema|database\(\)|version\(\)|user\(\)|load_file|into\s+outfile|xp_cmdshell)\b)|(?:\b(?:extractvalue|updatexml|floor\(rand)\b)|(?:0x[0-9a-fA-F]{4,})|(?:\bchar\(\d+)/i,
  ],
  ["XSS", /(<\s*script)|(onerror\s*=)|(onload\s*=)|(javascript:)|(<\s*iframe)/i],
  ["PATH_TRAVERSAL", /(\.\.\/)|(\.\.\\)|(%2e%2e)/i],
  ["COMMAND_INJECTION", /(;\s*(ls|cat|rm|curl|wget)\b)|(\|\s*\w+)|(`[^`]*`)|(\$\()/i],
  ["TEMPLATE_INJECTION", /(\{\{.*\}\})|(\$\{.*\})/],
];
const SENSITIVE_FIELDS = new Set(["password", "otp", "code", "token", "secret", "newPassword"]);

export function scanInputs(
  data: unknown,
  path = "",
  out: Array<{ pattern_class: string; field_name: string; sample: string }> = [],
) {
  if (out.length > 10) return out;
  if (typeof data === "string") {
    const field = path.split(".").pop() ?? path;
    if (SENSITIVE_FIELDS.has(field)) return out;
    if (data.length > 2000) {
      out.push({ pattern_class: "OVERSIZE_INPUT", field_name: path, sample: `length=${data.length}` });
    }
    for (const [cls, re] of PATTERNS) {
      if (re.test(data)) {
        out.push({ pattern_class: cls, field_name: path, sample: sanitize(data) });
      }
    }
  } else if (Array.isArray(data)) {
    data.forEach((v, i) => scanInputs(v, `${path}[${i}]`, out));
  } else if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) scanInputs(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

function sanitize(s: string) {
  return s
    .slice(0, 80)
    .replace(/[<>"'`]/g, (c) => `&#${c.charCodeAt(0)};`)
    .replace(/[\u0000-\u001f]/g, " ");
}

export async function isIpBlocked(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const { data } = await supabaseAdmin.from("ip_blocklist").select("ip,expires_at").eq("ip", ip).maybeSingle();
  if (!data) return false;
  return !data.expires_at || new Date(data.expires_at).getTime() > Date.now();
}

export async function countRecent(column: "source_ip" | "session_id_pub", value: string | null, seconds = 60) {
  if (!value) return 0;
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("security_events")
    .select("event_id", { count: "exact", head: true })
    .eq("event_type", "API_REQUEST")
    .eq(column, value)
    .gte("occurred_at", since);
  return count ?? 0;
}

/** Throws after emitting AUTHZ_DENIED if the caller lacks the role. */
export async function requireRole(ctx: RequestContext, role: "admin" | "customer", resourceRef?: string) {
  if (!ctx.user) {
    await emitSecurityEvent(ctx, "AUTHZ_DENIED", {
      result: "DENIED",
      attributes: { reason: "UNAUTHENTICATED", attempted_privilege: role, required_role: role, actor_role: "anonymous", resource_ref: resourceRef ?? ctx.endpoint },
    });
    throw new TelemetryError("UNAUTHENTICATED", "Please sign in.", 401);
  }
  if (!ctx.roles.includes(role)) {
    await emitSecurityEvent(ctx, "AUTHZ_DENIED", {
      result: "DENIED",
      attributes: {
        reason: "MISSING_ROLE",
        attempted_privilege: role === "admin" ? "admin" : "owner",
        required_role: role,
        actor_role: ctx.roles[0] ?? "none",
        resource_ref: resourceRef ?? ctx.endpoint,
      },
    });
    throw new TelemetryError("FORBIDDEN", "You don't have access to this.", 403);
  }
}
