import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "./encryption.server";
import { signEcsRequest } from "./hmac.server";

export interface OutboxDeliveryResult {
  ok: boolean;
  eventId: string;
  status: "DELIVERED" | "FAILED" | "PENDING";
  error?: string;
}

/**
 * Delivers a single security event from the outbox to ECS via signed POST.
 * If delivery is disabled or outbound credential is not set, leaves status PENDING.
 */
export async function deliverEventToEcs(eventId: string): Promise<OutboxDeliveryResult> {
  const { data: event, error: eventErr } = await supabaseAdmin
    .from("security_events")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (eventErr || !event) {
    return { ok: false, eventId, status: "FAILED", error: "Event not found" };
  }

  // 1. Check integration settings
  const { data: settings } = await supabaseAdmin
    .from("integration_settings")
    .select("delivery_enabled, ecs_base_url, source_system")
    .eq("id", 1)
    .maybeSingle();

  if (!settings?.delivery_enabled || !settings.ecs_base_url) {
    // Keep PENDING without error
    return { ok: true, eventId, status: "PENDING" };
  }

  // 2. Fetch OUTBOUND_TO_ECS credential
  const { data: cred } = await supabaseAdmin
    .from("integration_credentials")
    .select("key_id, secret_ciphertext, status")
    .eq("direction", "OUTBOUND_TO_ECS")
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!cred) {
    // No outbound credential configured yet; leave PENDING
    return { ok: true, eventId, status: "PENDING" };
  }

  // 3. Format payload per §8 Telemetry contract v1.0
  const payload = {
    schema_version: "1.0",
    event_id: event.event_id,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    source_system: event.source_system || settings.source_system || "shieldbank-testbed",
    user_id: event.user_id_pub ?? null,
    account_id: event.account_id_pub ?? null,
    session_id: event.session_id_pub ?? null,
    device_id: event.device_id_pub ?? null,
    source_ip: event.source_ip ?? null,
    endpoint: event.endpoint ?? null,
    result: event.result,
    amount: event.amount_minor != null ? Math.round(event.amount_minor / 100) : null,
    currency: event.currency || (event.amount_minor != null ? "ETB" : null),
    beneficiary_id: event.beneficiary_id_pub ?? null,
    transaction_id: event.transaction_id_pub ?? null,
    user_agent: (event.attributes as Record<string, unknown>)?.user_agent ?? null,
    attributes: (event.attributes as Record<string, unknown>) ?? {},
  };

  const rawBody = JSON.stringify(payload);
  const path = "/api/events";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();

  try {
    const secret = await decryptSecret(cred.secret_ciphertext);
    const signature = await signEcsRequest(secret, timestamp, nonce, "POST", path, rawBody);

    let baseEcsUrl = settings.ecs_base_url.replace(/\/+$/, "");
    if ((baseEcsUrl.includes("localhost") || baseEcsUrl.includes("127.0.0.1")) && process.env["VERCEL"]) {
      baseEcsUrl = process.env["ECS_BASE_URL"] || "https://ethio-cyber-shield.onrender.com";
    }
    const targetUrl = `${baseEcsUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ECS-Key-Id": cred.key_id,
        "X-ECS-Timestamp": timestamp,
        "X-ECS-Nonce": nonce,
        "X-ECS-Signature": signature,
      },
      body: rawBody,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (res.ok) {
      await supabaseAdmin
        .from("security_events")
        .update({
          delivery_status: "DELIVERED",
          delivered_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("event_id", event.event_id);

      return { ok: true, eventId, status: "DELIVERED" };
    } else {
      const errText = await res.text().catch(() => "HTTP error");
      const errMsg = `HTTP ${res.status}: ${errText.slice(0, 200)}`;

      await supabaseAdmin
        .from("security_events")
        .update({
          delivery_status: "FAILED",
          attempts: (event.attempts ?? 0) + 1,
          last_error: errMsg,
        })
        .eq("event_id", event.event_id);

      return { ok: false, eventId, status: "FAILED", error: errMsg };
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("security_events")
      .update({
        delivery_status: "FAILED",
        attempts: (event.attempts ?? 0) + 1,
        last_error: errMsg.slice(0, 300),
      })
      .eq("event_id", event.event_id);

    return { ok: false, eventId, status: "FAILED", error: errMsg };
  }
}

/**
 * Retries failed outbox deliveries with exponential backoff (cap 5 min, max 8 attempts).
 * Called by admin sweeper or lazily at the end of requests.
 */
export async function retryFailedDeliveries(maxCount = 20) {
  const { data: failedEvents } = await supabaseAdmin
    .from("security_events")
    .select("event_id, attempts, updated_at")
    .eq("delivery_status", "FAILED")
    .lt("attempts", 8)
    .order("updated_at", { ascending: true })
    .limit(maxCount);

  if (!failedEvents || failedEvents.length === 0) {
    return { retried: 0, succeeded: 0, failed: 0 };
  }

  const now = Date.now();
  let retried = 0;
  let succeeded = 0;
  let failed = 0;

  for (const item of failedEvents) {
    // Exponential backoff: 5s * 2^(attempts), capped at 300s (5 minutes)
    const backoffSec = Math.min(300, Math.pow(2, item.attempts) * 5);
    const updatedMs = new Date(item.updated_at).getTime();

    if (now - updatedMs < backoffSec * 1000) {
      continue;
    }

    retried++;
    const res = await deliverEventToEcs(item.event_id);
    if (res.ok && res.status === "DELIVERED") {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { retried, succeeded, failed };
}

/**
 * Non-blocking background retry invoked lazily at the end of requests.
 */
export function lazyRetryFailedDeliveries() {
  setTimeout(() => {
    void retryFailedDeliveries(5).catch(() => {});
  }, 100);
}
