import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptSecret } from "./encryption.server";
import { emitSecurityEvent, writeAudit, requireRole, type RequestContext } from "./telemetry.server";
import { deliverEventToEcs, retryFailedDeliveries } from "./outbox.server";
import { revertControlAction, freezeTransaction } from "./controls.server";
import { settleSingleTransaction } from "./transfer.server";

export async function getOutboundConfig(ctx: RequestContext) {
  await requireRole(ctx, "admin", "/admin/integration");

  const [{ data: settings }, { data: outboundCred }, { data: stats }] = await Promise.all([
    supabaseAdmin.from("integration_settings").select("*").eq("id", 1).maybeSingle(),
    supabaseAdmin
      .from("integration_credentials")
      .select("id, key_id, status, updated_at")
      .eq("direction", "OUTBOUND_TO_ECS")
      .eq("status", "ACTIVE")
      .maybeSingle(),
    supabaseAdmin.from("security_events").select("delivery_status"),
  ]);

  const deliveryStats = {
    pending: (stats ?? []).filter((s) => s.delivery_status === "PENDING").length,
    delivered: (stats ?? []).filter((s) => s.delivery_status === "DELIVERED").length,
    failed: (stats ?? []).filter((s) => s.delivery_status === "FAILED").length,
    total: stats?.length ?? 0,
  };

  return {
    settings: settings ?? {
      delivery_enabled: false,
      ecs_base_url: null,
      source_system: "shieldbank-testbed",
      last_health_check_at: null,
      last_health_status: null,
    },
    outboundCred: outboundCred
      ? {
          key_id: outboundCred.key_id,
          status: outboundCred.status,
          updated_at: outboundCred.updated_at,
          configured: true,
        }
      : { configured: false },
    deliveryStats,
  };
}

export async function saveOutboundConfig(
  ctx: RequestContext,
  data: {
    ecs_base_url?: string | null;
    delivery_enabled?: boolean;
    key_id?: string | null;
    secret?: string | null;
  },
) {
  await requireRole(ctx, "admin", "/admin/integration");

  // Upsert settings
  await supabaseAdmin
    .from("integration_settings")
    .upsert({
      id: 1,
      ecs_base_url: data.ecs_base_url?.trim() || null,
      delivery_enabled: data.delivery_enabled ?? false,
      updated_at: new Date().toISOString(),
    });

  // If new credentials were provided
  if (data.key_id?.trim() && data.secret?.trim()) {
    const encryptedSecret = await encryptSecret(data.secret.trim());

    // Mark previous outbound credentials inactive
    await supabaseAdmin
      .from("integration_credentials")
      .update({ status: "ROTATED" })
      .eq("direction", "OUTBOUND_TO_ECS")
      .eq("status", "ACTIVE");

    await supabaseAdmin.from("integration_credentials").insert({
      direction: "OUTBOUND_TO_ECS",
      key_id: data.key_id.trim(),
      secret_ciphertext: encryptedSecret,
      label: "ECS Telemetry Outbound Key",
      scopes: ["telemetry:push"],
      status: "ACTIVE",
    });
  }

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    attributes: {
      action: "UPDATE_OUTBOUND_INTEGRATION_CONFIG",
      ecs_base_url: data.ecs_base_url,
      delivery_enabled: data.delivery_enabled,
      credential_updated: !!(data.key_id && data.secret),
    },
  });

  await writeAudit("ADMIN", ctx.user?.publicId ?? "ADMIN", "UPDATE_OUTBOUND_CONFIG", "integration_settings", "1", {
    delivery_enabled: data.delivery_enabled,
  });

  return { ok: true, message: "Outbound configuration saved successfully." };
}

export async function sendTestEvent(ctx: RequestContext) {
  await requireRole(ctx, "admin", "/admin/integration");

  const eventId = await emitSecurityEvent(ctx, "API_REQUEST", {
    result: "SUCCESS",
    endpoint: "/admin/integration/test",
    attributes: {
      test: true,
      sender: "Admin Test Button",
      timestamp: new Date().toISOString(),
    },
  });

  if (!eventId) {
    return { ok: false, error: "Failed to record security event in outbox." };
  }

  const deliveryResult = await deliverEventToEcs(eventId);

  return {
    ok: deliveryResult.ok,
    eventId,
    status: deliveryResult.status,
    error: deliveryResult.error,
  };
}

export async function checkEcsHealth(ctx: RequestContext) {
  await requireRole(ctx, "admin", "/admin/integration");

  const { data: settings } = await supabaseAdmin
    .from("integration_settings")
    .select("ecs_base_url")
    .eq("id", 1)
    .maybeSingle();

  if (!settings?.ecs_base_url) {
    return { ok: false, status: "NOT_CONFIGURED", message: "ECS Base URL is not set." };
  }

  const started = Date.now();
  const url = `${settings.ecs_base_url.replace(/\/+$/, "")}/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    const latencyMs = Date.now() - started;
    const healthStatus = res.ok ? "ONLINE" : `ERROR_${res.status}`;

    await supabaseAdmin
      .from("integration_settings")
      .update({
        last_health_check_at: new Date().toISOString(),
        last_health_status: healthStatus,
      })
      .eq("id", 1);

    return {
      ok: res.ok,
      status: healthStatus,
      statusCode: res.status,
      latencyMs,
      message: res.ok ? "ECS endpoint is responsive." : `ECS returned HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("integration_settings")
      .update({
        last_health_check_at: new Date().toISOString(),
        last_health_status: "UNREACHABLE",
      })
      .eq("id", 1);

    return {
      ok: false,
      status: "UNREACHABLE",
      error: errMsg,
      message: "Could not reach ECS endpoint.",
    };
  }
}

export async function retryOutboxEvents(ctx: RequestContext) {
  await requireRole(ctx, "admin", "/admin/integration");
  const result = await retryFailedDeliveries(20);
  return { ok: true, ...result };
}

// ===== Inbound Keys CRUD =====

export async function getInboundKeys(ctx: RequestContext) {
  await requireRole(ctx, "admin", "/admin/integration");

  const { data } = await supabaseAdmin
    .from("integration_credentials")
    .select("id, key_id, label, scopes, ip_allowlist, status, created_at, last_used_at, rotated_at")
    .eq("direction", "INBOUND_FROM_ECS")
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function createInboundKey(
  ctx: RequestContext,
  data: {
    label: string;
    scopes: string[];
    ip_allowlist?: string[] | null;
  },
) {
  await requireRole(ctx, "admin", "/admin/integration");

  const keyId = `ecs_live_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  // 64-char random hex secret
  const rawSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const encrypted = await encryptSecret(rawSecret);

  const { data: created, error } = await supabaseAdmin
    .from("integration_credentials")
    .insert({
      direction: "INBOUND_FROM_ECS",
      key_id: keyId,
      secret_ciphertext: encrypted,
      label: data.label.trim() || "ECS Inbound Key",
      scopes: data.scopes,
      ip_allowlist: data.ip_allowlist ?? null,
      status: "ACTIVE",
    })
    .select("id, key_id, label, scopes, ip_allowlist, status, created_at")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create ECS key: ${error?.message}`);
  }

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    attributes: {
      action: "CREATE_INBOUND_ECS_KEY",
      key_id: keyId,
      label: created.label,
      scopes: created.scopes,
    },
  });

  await writeAudit("ADMIN", ctx.user?.publicId ?? "ADMIN", "CREATE_ECS_KEY", "integration_credentials", keyId, {
    label: created.label,
    scopes: created.scopes,
  });

  return {
    ...created,
    secret: rawSecret, // RETURNED ONCE!
  };
}

export async function revokeInboundKey(ctx: RequestContext, keyId: string) {
  await requireRole(ctx, "admin", "/admin/integration");

  await supabaseAdmin
    .from("integration_credentials")
    .update({ status: "REVOKED" })
    .eq("key_id", keyId);

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    attributes: {
      action: "REVOKE_INBOUND_ECS_KEY",
      key_id: keyId,
    },
  });

  await writeAudit("ADMIN", ctx.user?.publicId ?? "ADMIN", "REVOKE_ECS_KEY", "integration_credentials", keyId);

  return { ok: true, message: `Key ${keyId} revoked successfully.` };
}

export async function rotateInboundKey(ctx: RequestContext, keyId: string) {
  await requireRole(ctx, "admin", "/admin/integration");

  const rawSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const encrypted = await encryptSecret(rawSecret);

  await supabaseAdmin
    .from("integration_credentials")
    .update({
      secret_ciphertext: encrypted,
      rotated_at: new Date().toISOString(),
      status: "ACTIVE",
    })
    .eq("key_id", keyId);

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    attributes: {
      action: "ROTATE_INBOUND_ECS_KEY",
      key_id: keyId,
    },
  });

  await writeAudit("ADMIN", ctx.user?.publicId ?? "ADMIN", "ROTATE_ECS_KEY", "integration_credentials", keyId);

  return { ok: true, new_secret: rawSecret };
}

// ===== Control Actions Log =====

export async function getControlActions(
  ctx: RequestContext,
  opts: { limit?: number; offset?: number } = {},
) {
  await requireRole(ctx, "admin", "/admin/responses");

  const limit = Math.min(Math.max(1, opts.limit ?? 50), 100);
  const offset = Math.max(0, opts.offset ?? 0);

  const { data, count, error } = await supabaseAdmin
    .from("control_actions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch control actions: ${error.message}`);
  }

  return {
    actions: data ?? [],
    total: count ?? 0,
  };
}

export async function revertActionAdmin(
  ctx: RequestContext,
  controlActionId: string,
  reason?: string,
) {
  await requireRole(ctx, "admin", "/admin/responses");
  return await revertControlAction(ctx, "admin-console", {
    control_action_id: controlActionId,
    reason: reason || "Administrator manual revert",
  });
}

// ===== PROMPT 5 ADMIN DASHBOARD IMPLEMENTATIONS =====

// 1. Overview KPIs & Telemetry Feed
export async function getAdminOverview(ctx: RequestContext) {
  await requireRole(ctx, "admin", "/admin");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [
    { count: customersCount },
    { data: nonSystemAccounts },
    { data: txToday },
    { count: activeSessionsCount },
    { count: blockedIpsCount },
    { data: intSettings },
    { count: undeliveredCount },
    { data: liveEvents },
    { data: events24h },
    { data: tx24h },
    { data: failedLogins },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("user_id", { count: "exact", head: true }),
    supabaseAdmin.from("accounts").select("id, balance_minor").eq("is_system", false),
    supabaseAdmin.from("transactions").select("status, amount_minor, created_at").gte("created_at", startOfDay.toISOString()),
    supabaseAdmin.from("target_sessions").select("id", { count: "exact", head: true }).eq("status", "ACTIVE").gte("expires_at", new Date().toISOString()),
    supabaseAdmin.from("ip_blocklist").select("ip", { count: "exact", head: true }),
    supabaseAdmin.from("integration_settings").select("delivery_enabled, ecs_base_url, last_health_status").eq("id", 1).maybeSingle(),
    supabaseAdmin.from("security_events").select("event_id", { count: "exact", head: true }).in("delivery_status", ["PENDING", "FAILED"]),
    supabaseAdmin
      .from("security_events")
      .select("seq, event_id, event_type, result, source_ip, user_id_pub, delivery_status, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(12),
    supabaseAdmin.from("security_events").select("event_type, occurred_at").gte("occurred_at", since24h),
    supabaseAdmin.from("transactions").select("amount_minor, status, created_at").gte("created_at", since24h),
    supabaseAdmin.from("security_events").select("source_ip").eq("event_type", "LOGIN_FAILED").gte("occurred_at", since24h),
  ]);

  // Aggregate non-system balances
  const totalBalanceMinor = (nonSystemAccounts ?? []).reduce(
    (sum, a) => sum + Number(a.balance_minor ?? 0),
    0,
  );
  const totalBalanceEtb = totalBalanceMinor / 100;

  // Transaction counts by status today
  const txStatusCounts = {
    completed: (txToday ?? []).filter((t) => t.status === "COMPLETED").length,
    processing: (txToday ?? []).filter((t) => t.status === "PROCESSING").length,
    frozen: (txToday ?? []).filter((t) => t.status === "FROZEN").length,
    failed: (txToday ?? []).filter((t) => t.status === "FAILED").length,
    total: txToday?.length ?? 0,
  };

  // Group 24h events by type
  const eventCountsByType: Record<string, number> = {};
  for (const ev of events24h ?? []) {
    eventCountsByType[ev.event_type] = (eventCountsByType[ev.event_type] ?? 0) + 1;
  }

  // Top source IPs by failed logins
  const ipFailCounts: Record<string, number> = {};
  for (const f of failedLogins ?? []) {
    const ip = f.source_ip || "unknown";
    ipFailCounts[ip] = (ipFailCounts[ip] ?? 0) + 1;
  }
  const topSourceIpsFailed = Object.entries(ipFailCounts)
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    kpis: {
      customers: customersCount ?? 0,
      accounts: nonSystemAccounts?.length ?? 0,
      total_balance_etb: totalBalanceEtb,
      transactions_today: txStatusCounts.total,
      completed_today: txStatusCounts.completed,
      processing_today: txStatusCounts.processing,
      frozen_today: txStatusCounts.frozen,
      failed_today: txStatusCounts.failed,
      active_sessions: activeSessionsCount ?? 0,
      blocked_ips: blockedIpsCount ?? 0,
      undelivered_events: undeliveredCount ?? 0,
      integration_health:
        intSettings?.delivery_enabled && intSettings?.ecs_base_url
          ? intSettings.last_health_status ?? "CONFIGURED"
          : "DISABLED",
    },
    live_events: liveEvents ?? [],
    event_distribution_24h: eventCountsByType,
    tx_volume_24h: (tx24h ?? []).length,
    top_failed_ips: topSourceIpsFailed,
  };
}

// 2. Live Security Events Feed (polling endpoint)
export async function getLiveSecurityEvents(ctx: RequestContext, limit = 15) {
  await requireRole(ctx, "admin", "/admin");

  const { data } = await supabaseAdmin
    .from("security_events")
    .select("seq, event_id, event_type, result, source_ip, user_id_pub, delivery_status, occurred_at, attributes")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

// 3. Customers Management
export async function getAdminCustomers(ctx: RequestContext, search?: string) {
  await requireRole(ctx, "admin", "/admin/customers");

  let query = supabaseAdmin
    .from("profiles")
    .select(`
      user_id,
      public_id,
      email,
      full_name,
      phone,
      status,
      failed_login_count,
      locked_until,
      step_up_until,
      last_login_at,
      created_at,
      accounts:accounts(id, public_id, balance_minor, status, is_system),
      devices:target_devices(id, is_trusted, status),
      sessions:target_sessions(id, status, expires_at)
    `)
    .order("created_at", { ascending: false });

  if (search?.trim()) {
    const q = search.trim();
    query = query.or(`public_id.ilike.%${q}%,email.ilike.%${q}%,full_name.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load customers: ${error.message}`);
  }

  // Filter out system accounts and compute aggregates
  return (data ?? []).map((prof) => {
    const userAccounts = (prof.accounts as any[] ?? []).filter((a) => !a.is_system);
    const totalBalanceMinor = userAccounts.reduce((sum, a) => sum + Number(a.balance_minor ?? 0), 0);
    const activeSessions = (prof.sessions as any[] ?? []).filter(
      (s) => s.status === "ACTIVE" && new Date(s.expires_at) > new Date(),
    ).length;
    const trustedDevices = (prof.devices as any[] ?? []).filter(
      (d) => d.is_trusted && d.status === "ACTIVE",
    ).length;

    return {
      user_id: prof.user_id,
      public_id: prof.public_id,
      email: prof.email,
      full_name: prof.full_name,
      phone: prof.phone,
      status: prof.status,
      failed_login_count: prof.failed_login_count,
      locked_until: prof.locked_until,
      step_up_until: prof.step_up_until,
      last_login_at: prof.last_login_at,
      account_count: userAccounts.length,
      total_balance_etb: totalBalanceMinor / 100,
      active_sessions_count: activeSessions,
      trusted_devices_count: trustedDevices,
      created_at: prof.created_at,
      primary_account_id: userAccounts[0]?.public_id ?? null,
    };
  });
}

export async function getCustomerDetail(ctx: RequestContext, userPublicId: string) {
  await requireRole(ctx, "admin", "/admin/customers");

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .or(`public_id.eq.${userPublicId},user_id.eq.${userPublicId}`)
    .maybeSingle();

  if (!prof) {
    throw new Error("Customer profile not found.");
  }

  const [{ data: accounts }, { data: devices }, { data: sessions }, { data: events }] =
    await Promise.all([
      supabaseAdmin.from("accounts").select("*").eq("user_id", prof.user_id).eq("is_system", false),
      supabaseAdmin.from("target_devices").select("*").eq("user_id", prof.user_id).order("last_seen_at", { ascending: false }),
      supabaseAdmin.from("target_sessions").select("*").eq("user_id", prof.user_id).order("created_at", { ascending: false }),
      supabaseAdmin.from("security_events").select("*").eq("user_id_pub", prof.public_id).order("occurred_at", { ascending: false }).limit(20),
    ]);

  return {
    profile: prof,
    accounts: accounts ?? [],
    devices: devices ?? [],
    sessions: sessions ?? [],
    recent_events: events ?? [],
  };
}

export async function adminLockUnlockAccount(
  ctx: RequestContext,
  accountOrUserPublicId: string,
  lock: boolean,
  reason?: string,
) {
  await requireRole(ctx, "admin", "/admin/customers");

  // Lookup profile
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("user_id, public_id")
    .or(`public_id.eq.${accountOrUserPublicId},user_id.eq.${accountOrUserPublicId}`)
    .maybeSingle();

  const newStatus = lock ? "LOCKED" : "ACTIVE";

  if (prof) {
    await supabaseAdmin
      .from("profiles")
      .update({
        status: newStatus,
        locked_until: lock ? new Date(Date.now() + 24 * 3600_000).toISOString() : null,
      })
      .eq("user_id", prof.user_id);

    // Also update accounts
    await supabaseAdmin
      .from("accounts")
      .update({ status: newStatus })
      .eq("user_id", prof.user_id);
  } else {
    // Lookup by account public_id
    await supabaseAdmin
      .from("accounts")
      .update({ status: newStatus })
      .eq("public_id", accountOrUserPublicId);
  }

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    user_id: prof?.public_id ?? accountOrUserPublicId,
    attributes: {
      action: lock ? "LOCK_ACCOUNT" : "UNLOCK_ACCOUNT",
      target: accountOrUserPublicId,
      reason: reason || "Administrator manual action",
    },
  });

  await writeAudit(
    "ADMIN",
    ctx.user?.publicId ?? "ADMIN",
    lock ? "LOCK_ACCOUNT" : "UNLOCK_ACCOUNT",
    "account",
    accountOrUserPublicId,
    { reason },
  );

  return { ok: true, status: newStatus };
}

export async function adminRevokeUserSessions(ctx: RequestContext, userPublicId: string) {
  await requireRole(ctx, "admin", "/admin/customers");

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("user_id, public_id")
    .or(`public_id.eq.${userPublicId},user_id.eq.${userPublicId}`)
    .maybeSingle();

  if (!prof) {
    throw new Error("Customer not found.");
  }

  await supabaseAdmin
    .from("target_sessions")
    .update({ status: "REVOKED", revoked_by: "ADMIN", revoked_reason: "Administrator revoked sessions" })
    .eq("user_id", prof.user_id)
    .eq("status", "ACTIVE");

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    user_id: prof.public_id,
    attributes: {
      action: "REVOKE_ALL_SESSIONS",
      target_user: prof.public_id,
    },
  });

  await writeAudit("ADMIN", ctx.user?.publicId ?? "ADMIN", "REVOKE_USER_SESSIONS", "user", prof.public_id);

  return { ok: true, message: `Sessions for ${prof.public_id} revoked.` };
}

// 4. Transactions Management
export async function getAdminTransactions(
  ctx: RequestContext,
  opts: {
    status?: string;
    minAmountEtb?: number;
    maxAmountEtb?: number;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  await requireRole(ctx, "admin", "/admin/transactions");

  const limit = Math.min(Math.max(1, opts.limit ?? 50), 100);
  const offset = Math.max(0, opts.offset ?? 0);

  let query = supabaseAdmin
    .from("transactions")
    .select(`
      id,
      public_id,
      amount_minor,
      currency,
      status,
      hold_until,
      completed_at,
      created_at,
      from_account:accounts!from_account_id(public_id, user_id),
      to_account:accounts!to_account_id(public_id),
      beneficiary:beneficiaries(name, bank_name, account_number, public_id)
    `, { count: "exact" })
    .order("created_at", { ascending: false });

  if (opts.status && opts.status !== "ALL") {
    query = query.eq("status", opts.status);
  }
  if (opts.minAmountEtb !== undefined) {
    query = query.gte("amount_minor", opts.minAmountEtb * 100);
  }
  if (opts.maxAmountEtb !== undefined) {
    query = query.lte("amount_minor", opts.maxAmountEtb * 100);
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim();
    query = query.or(`public_id.ilike.%${q}%`);
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) {
    throw new Error(`Failed to load transactions: ${error.message}`);
  }

  return {
    transactions: data ?? [],
    total: count ?? 0,
  };
}

export async function getTransactionDetail(ctx: RequestContext, txPublicId: string) {
  await requireRole(ctx, "admin", "/admin/transactions");

  const { data: tx } = await supabaseAdmin
    .from("transactions")
    .select(`
      *,
      from_account:accounts!from_account_id(*),
      to_account:accounts!to_account_id(*),
      beneficiary:beneficiaries(*)
    `)
    .or(`id.eq.${txPublicId},public_id.eq.${txPublicId}`)
    .maybeSingle();

  if (!tx) {
    throw new Error("Transaction not found.");
  }

  const [{ data: ledger }, { data: events }] = await Promise.all([
    supabaseAdmin.from("ledger_entries").select("*").eq("transaction_id", tx.id).order("created_at", { ascending: true }),
    supabaseAdmin.from("security_events").select("*").or(`attributes->>transaction_id.eq.${tx.public_id},attributes->>transaction_id.eq.${tx.id}`).order("occurred_at", { ascending: true }),
  ]);

  return {
    transaction: tx,
    ledger: ledger ?? [],
    events: events ?? [],
  };
}

export async function adminFreezeTransaction(ctx: RequestContext, txPublicId: string, reason?: string) {
  await requireRole(ctx, "admin", "/admin/transactions");

  return await freezeTransaction(ctx, "ADMIN_OPERATOR", {
    transaction_id: txPublicId,
    reason: reason || "Manual operator intervention from admin console",
    alert_id: "MANUAL_ADMIN_FREEZE",
  });
}

export async function adminReleaseTransaction(ctx: RequestContext, txPublicId: string) {
  await requireRole(ctx, "admin", "/admin/transactions");

  const result = await settleSingleTransaction(txPublicId);

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    attributes: {
      action: "MANUAL_RELEASE_TRANSFER",
      transaction_id: txPublicId,
    },
  });

  await writeAudit("ADMIN", ctx.user?.publicId ?? "ADMIN", "RELEASE_TRANSFER", "transaction", txPublicId);

  return result;
}

// 5. Security Events Explorer
export async function getAdminSecurityEvents(
  ctx: RequestContext,
  opts: {
    eventType?: string;
    result?: string;
    sourceIp?: string;
    userIdPub?: string;
    deliveryStatus?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  await requireRole(ctx, "admin", "/admin/events");

  const limit = Math.min(Math.max(1, opts.limit ?? 50), 100);
  const offset = Math.max(0, opts.offset ?? 0);

  let query = supabaseAdmin
    .from("security_events")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false });

  if (opts.eventType && opts.eventType !== "ALL") {
    query = query.eq("event_type", opts.eventType);
  }
  if (opts.result && opts.result !== "ALL") {
    query = query.eq("result", opts.result);
  }
  if (opts.sourceIp?.trim()) {
    query = query.eq("source_ip", opts.sourceIp.trim());
  }
  if (opts.userIdPub?.trim()) {
    query = query.eq("user_id_pub", opts.userIdPub.trim());
  }
  if (opts.deliveryStatus && opts.deliveryStatus !== "ALL") {
    query = query.eq("delivery_status", opts.deliveryStatus);
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) {
    throw new Error(`Failed to load security events: ${error.message}`);
  }

  return {
    events: data ?? [],
    total: count ?? 0,
  };
}

export async function adminRetrySingleEvent(ctx: RequestContext, eventId: string) {
  await requireRole(ctx, "admin", "/admin/events");

  const { data: event } = await supabaseAdmin
    .from("security_events")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!event) {
    throw new Error("Event not found.");
  }

  const result = await deliverEventToEcs(event);

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    attributes: {
      action: "RETRY_EVENT_DELIVERY",
      event_id: eventId,
      delivery_result: result.ok ? "DELIVERED" : "FAILED",
    },
  });

  return result;
}

// 6. Sessions & Devices
export async function getAdminSessionsDevices(ctx: RequestContext) {
  await requireRole(ctx, "admin", "/admin/sessions");

  const [{ data: sessions }, { data: devices }] = await Promise.all([
    supabaseAdmin
      .from("target_sessions")
      .select(`
        id,
        public_id,
        status,
        ip_address,
        user_agent,
        created_at,
        last_active_at,
        expires_at,
        user:profiles!user_id(public_id, email, full_name),
        device:target_devices!device_id(label, is_trusted)
      `)
      .order("last_active_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("target_devices")
      .select(`
        id,
        public_id,
        label,
        fingerprint_hash,
        is_trusted,
        status,
        first_seen_at,
        last_seen_at,
        user:profiles!user_id(public_id, email)
      `)
      .order("last_seen_at", { ascending: false })
      .limit(100),
  ]);

  // Compute shared devices (fingerprint shared across multiple user accounts)
  const fpMap: Record<string, any[]> = {};
  for (const dev of devices ?? []) {
    if (!dev.fingerprint_hash) continue;
    fpMap[dev.fingerprint_hash] = fpMap[dev.fingerprint_hash] ?? [];
    fpMap[dev.fingerprint_hash].push(dev);
  }

  const sharedDevices = Object.entries(fpMap)
    .filter(([_, devList]) => {
      const distinctUsers = new Set(devList.map((d) => d.user?.public_id).filter(Boolean));
      return distinctUsers.size > 1;
    })
    .map(([fp, devList]) => ({
      fingerprint_hash: fp,
      device_count: devList.length,
      users: Array.from(new Set(devList.map((d) => d.user?.email || d.user?.public_id))),
      devices: devList,
    }));

  return {
    sessions: sessions ?? [],
    devices: devices ?? [],
    shared_devices: sharedDevices,
  };
}

export async function adminRevokeSingleSession(ctx: RequestContext, sessionId: string) {
  await requireRole(ctx, "admin", "/admin/sessions");

  await supabaseAdmin
    .from("target_sessions")
    .update({
      status: "REVOKED",
      revoked_by: "ADMIN",
      revoked_reason: "Manual operator session termination",
    })
    .or(`id.eq.${sessionId},public_id.eq.${sessionId}`);

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    attributes: {
      action: "REVOKE_SESSION",
      session_id: sessionId,
    },
  });

  await writeAudit("ADMIN", ctx.user?.publicId ?? "ADMIN", "REVOKE_SESSION", "session", sessionId);

  return { ok: true, message: `Session ${sessionId} terminated.` };
}

// 7. Blocked IPs
export async function getAdminIpBlocklist(ctx: RequestContext) {
  await requireRole(ctx, "admin", "/admin/ip-blocklist");

  const { data, error } = await supabaseAdmin
    .from("ip_blocklist")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load IP blocklist: ${error.message}`);
  }

  return data ?? [];
}

export async function adminAddBlockedIp(
  ctx: RequestContext,
  ip: string,
  reason: string,
  durationMinutes = 1440,
) {
  await requireRole(ctx, "admin", "/admin/ip-blocklist");

  const cleanIp = ip.trim();
  if (!cleanIp) throw new Error("IP address is required.");

  const expiresAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();

  const { error } = await supabaseAdmin.from("ip_blocklist").upsert({
    ip: cleanIp,
    reason: reason.trim() || "Manual administrator block",
    source: "ADMIN",
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to block IP: ${error.message}`);
  }

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    source_ip: cleanIp,
    attributes: {
      action: "BLOCK_IP",
      ip: cleanIp,
      reason,
      expires_at: expiresAt,
    },
  });

  await writeAudit("ADMIN", ctx.user?.publicId ?? "ADMIN", "BLOCK_IP", "ip", cleanIp, { reason, expires_at: expiresAt });

  return { ok: true, message: `IP ${cleanIp} blocked successfully.` };
}

export async function adminRemoveBlockedIp(ctx: RequestContext, ip: string) {
  await requireRole(ctx, "admin", "/admin/ip-blocklist");

  await supabaseAdmin.from("ip_blocklist").delete().eq("ip", ip);

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    source_ip: ip,
    attributes: {
      action: "UNBLOCK_IP",
      ip,
    },
  });

  await writeAudit("ADMIN", ctx.user?.publicId ?? "ADMIN", "UNBLOCK_IP", "ip", ip);

  return { ok: true, message: `IP ${ip} removed from blocklist.` };
}

// 8. Audit Logs
export async function getAdminAuditLogs(
  ctx: RequestContext,
  opts: { limit?: number; offset?: number; actorType?: string; action?: string } = {},
) {
  await requireRole(ctx, "admin", "/admin/audit");

  const limit = Math.min(Math.max(1, opts.limit ?? 50), 100);
  const offset = Math.max(0, opts.offset ?? 0);

  let query = supabaseAdmin
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (opts.actorType && opts.actorType !== "ALL") {
    query = query.eq("actor_type", opts.actorType);
  }
  if (opts.action?.trim()) {
    query = query.ilike("action", `%${opts.action.trim()}%`);
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) {
    throw new Error(`Failed to load audit logs: ${error.message}`);
  }

  return {
    logs: data ?? [],
    total: count ?? 0,
  };
}

// 9. Security Posture Management
export async function updateSecurityPosture(
  ctx: RequestContext,
  updates: Record<string, unknown>,
) {
  await requireRole(ctx, "admin", "/admin");

  const { data, error } = await supabaseAdmin
    .from("security_posture")
    .update(updates)
    .eq("id", 1)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update security posture: ${error.message}`);
  }

  await emitSecurityEvent(ctx, "ADMIN_ACTION", {
    result: "SUCCESS",
    attributes: {
      action: "UPDATE_SECURITY_POSTURE",
      updates,
    },
  });

  await writeAudit(
    "ADMIN",
    ctx.user?.publicId ?? "ADMIN",
    "UPDATE_SECURITY_POSTURE",
    "security_posture",
    "singleton",
    updates,
  );

  return data;
}

export async function runAdminSelfTest(ctx: RequestContext) {
  const { runSelfTest } = await import("./selftest.server");
  return await runSelfTest(ctx);
}

