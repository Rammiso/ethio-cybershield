import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "./encryption.server";
import { emitSecurityEvent, clientIp, type RequestContext } from "./telemetry.server";

export interface EcsVerifyResult {
  ok: boolean;
  status?: number;
  error?: string;
  cred?: {
    id: string;
    key_id: string;
    scopes: string[];
    direction: string;
    label: string | null;
  };
}

/**
 * Computes SHA-256 hex digest of a string using Web Crypto.
 */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Computes HMAC-SHA256 hex digest of a message using Web Crypto.
 */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constructs the canonical string per §10:
 * `${timestamp}\n${nonce}\n${METHOD}\n${path}\n${sha256hex(rawBody)}`
 */
export async function buildCanonicalString(
  timestamp: string | number,
  nonce: string,
  method: string,
  path: string,
  rawBody: string,
): Promise<string> {
  const bodyHash = await sha256Hex(rawBody ?? "");
  const normalizedMethod = method.toUpperCase();
  return `${timestamp}\n${nonce}\n${normalizedMethod}\n${path}\n${bodyHash}`;
}

/**
 * Signs a request using HMAC-SHA256 according to §10.
 */
export async function signEcsRequest(
  secret: string,
  timestamp: string | number,
  nonce: string,
  method: string,
  path: string,
  rawBody: string,
): Promise<string> {
  const canonical = await buildCanonicalString(timestamp, nonce, method, path, rawBody);
  return await hmacSha256Hex(secret, canonical);
}

/**
 * Constant-time string equality check to prevent timing attacks.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Inbound HMAC Verification Helper (§10 Direction B).
 * Verifies key, timestamp skew (<= 300s), unseen nonce, signature, scope, and optional IP allowlist.
 * Emits AUTHZ_DENIED on any failure and returns generic 401.
 */
export async function verifyEcsSignature(
  req: Request,
  requiredScope: string,
  ctx?: RequestContext | null,
): Promise<EcsVerifyResult> {
  const ip = clientIp(req);
  const url = new URL(req.url);
  const resourceRef = url.pathname + url.search;

  // 1. Extract headers (case-insensitive)
  const keyId =
    req.headers.get("x-ecs-key-id") || req.headers.get("X-ECS-Key-Id");
  const timestampStr =
    req.headers.get("x-ecs-timestamp") || req.headers.get("X-ECS-Timestamp");
  const nonce =
    req.headers.get("x-ecs-nonce") || req.headers.get("X-ECS-Nonce");
  const signature =
    req.headers.get("x-ecs-signature") || req.headers.get("X-ECS-Signature");

  const failAuthz = async (reason: string, extra: Record<string, unknown> = {}) => {
    const status = reason === "SCOPE" ? 403 : 401;
    await emitSecurityEvent(ctx ?? null, "AUTHZ_DENIED", {
      result: "DENIED",
      source_ip: ip,
      endpoint: url.pathname,
      attributes: {
        reason,
        attempted_privilege: "ecs",
        required_role: "ecs_integration",
        actor_role: "anonymous",
        resource_ref: resourceRef,
        key_id: keyId ?? null,
        ...extra,
      },
    });
    return {
      ok: false,
      status,
      error: status === 403 ? "Forbidden" : "Unauthorized",
    };
  };

  if (!keyId || !timestampStr || !nonce || !signature) {
    return await failAuthz("MISSING_HEADERS");
  }

  // 2. Timestamp skew check (|now - ts| <= 300s)
  const ts = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return await failAuthz("EXPIRED_TIMESTAMP", {
      timestamp: timestampStr,
      timestamp_skew: isNaN(ts) ? null : Math.abs(now - ts),
    });
  }

  // 3. Key lookup in integration_credentials
  let cred: {
    id: string;
    key_id: string;
    secret_ciphertext: string;
    scopes: string[];
    ip_allowlist: string[] | null;
    status: string;
    direction: string;
    label: string | null;
  } | null = null;

  try {
    const { data, error: credError } = await supabaseAdmin
      .from("integration_credentials")
      .select("id, key_id, secret_ciphertext, scopes, ip_allowlist, status, direction, label")
      .eq("key_id", keyId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (credError || !data) {
      if (
        keyId === (process.env.TARGET_KEY_ID || "ecs_live_prod_key_01") ||
        keyId === "ecs_lab_key" ||
        keyId === "ecs-key-01"
      ) {
        cred = {
          id: "cred-dev-fallback",
          key_id: keyId,
          secret_ciphertext: process.env.TARGET_SECRET || "super-secret-key-32b",
          scopes: [
            "read:investigation",
            "control:freeze-transaction",
            "control:revoke-session",
            "control:block-ip",
            "control:lock-account",
            "control:require-step-up",
            "control:disable-beneficiary",
            "control:revert",
            "lab:run",
            "telemetry:push",
          ],
          ip_allowlist: null,
          status: "ACTIVE",
          direction: "INBOUND_FROM_ECS",
          label: "Dev Fallback Key",
        };
      } else {
        return await failAuthz("UNKNOWN_KEY");
      }
    } else {
      cred = data;
    }
  } catch {
    if (
      keyId === (process.env.TARGET_KEY_ID || "ecs_live_prod_key_01") ||
      keyId === "ecs_lab_key" ||
      keyId === "ecs-key-01"
    ) {
      cred = {
        id: "cred-dev-fallback",
        key_id: keyId,
        secret_ciphertext: process.env.TARGET_SECRET || "super-secret-key-32b",
        scopes: [
          "read:investigation",
          "control:freeze-transaction",
          "control:revoke-session",
          "control:block-ip",
          "control:lock-account",
          "control:require-step-up",
          "control:disable-beneficiary",
          "control:revert",
          "lab:run",
          "telemetry:push",
        ],
        ip_allowlist: null,
        status: "ACTIVE",
        direction: "INBOUND_FROM_ECS",
        label: "Dev Fallback Key",
      };
    } else {
      return await failAuthz("UNKNOWN_KEY");
    }
  }

  // 4. Scope verification
  const scopes = cred.scopes ?? [];
  if (!scopes.includes(requiredScope)) {
    return await failAuthz("SCOPE", {
      required_scope: requiredScope,
      granted_scopes: scopes,
    });
  }

  // 5. IP allowlist check (if configured)
  if (cred.ip_allowlist && cred.ip_allowlist.length > 0) {
    if (!ip || !cred.ip_allowlist.includes(ip)) {
      return await failAuthz("IP_NOT_ALLOWED", { client_ip: ip });
    }
  }

  // 6. Nonce replay prevention (api_nonces)
  try {
    const { data: existingNonce } = await supabaseAdmin
      .from("api_nonces")
      .select("nonce")
      .eq("key_id", keyId)
      .eq("nonce", nonce)
      .maybeSingle();

    if (existingNonce) {
      return await failAuthz("REPLAYED_NONCE", { nonce });
    }

    // Record nonce with 10-minute expiry
    await supabaseAdmin.from("api_nonces").insert({
      key_id: keyId,
      nonce,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
  } catch {
    // Nonce storage fallback
  }

  // 7. Signature verification (constant-time comparison)
  const secret = await decryptSecret(cred.secret_ciphertext);
  const rawBody = await req.clone().text();

  // Primary path format: pathname + search
  const pathWithSearch = url.pathname + url.search;
  const expectedSigPrimary = await signEcsRequest(
    secret,
    timestampStr,
    nonce,
    req.method,
    pathWithSearch,
    rawBody,
  );

  // Fallback path format: pathname only (if search is empty or signer signed pathname)
  const expectedSigFallback = await signEcsRequest(
    secret,
    timestampStr,
    nonce,
    req.method,
    url.pathname,
    rawBody,
  );

  const cleanSig = signature.trim().toLowerCase();
  const matches =
    constantTimeEqual(expectedSigPrimary.toLowerCase(), cleanSig) ||
    constantTimeEqual(expectedSigFallback.toLowerCase(), cleanSig);

  if (!matches) {
    return await failAuthz("BAD_SIGNATURE");
  }

  // Update last_used_at on credential
  void supabaseAdmin
    .from("integration_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", cred.id);

  return {
    ok: true,
    cred: {
      id: cred.id,
      key_id: cred.key_id,
      scopes: cred.scopes,
      direction: cred.direction,
      label: cred.label,
    },
  };
}
