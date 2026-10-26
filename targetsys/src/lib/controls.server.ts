import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emitSecurityEvent, writeAudit, type RequestContext } from "./telemetry.server";

export interface ControlResult {
  status: "CONFIRMED" | "REJECTED";
  control_action_id?: string;
  target_state?: Record<string, unknown> | null;
  actual_state?: Record<string, unknown> | null;
  executed_at?: string;
  message: string;
  code?: string;
}

export function isPrivateOrLoopbackIp(ip: string): boolean {
  const trimmed = ip.trim();
  if (trimmed === "localhost" || trimmed === "127.0.0.1" || trimmed === "::1") return true;
  if (trimmed.startsWith("10.") || trimmed.startsWith("192.168.") || trimmed.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(trimmed)) return true;
  return false;
}

/**
 * Checks for existing idempotent execution in control_actions
 */
async function checkIdempotentControl(idempotencyKey?: string | null): Promise<ControlResult | null> {
  if (!idempotencyKey) return null;

  const { data: existing } = await supabaseAdmin
    .from("control_actions")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    return {
      status: (existing.status as "CONFIRMED" | "REJECTED") ?? "CONFIRMED",
      control_action_id: existing.id,
      target_state: (existing.target_state as Record<string, unknown>) ?? null,
      executed_at: existing.created_at,
      message: "Idempotent replay: control was previously executed.",
    };
  }

  return null;
}

/**
 * 1. FREEZE_TRANSACTION: Freezes a transaction that is currently in PROCESSING status.
 * Releases/restores reserved sender balance. Rejects with 409 if already COMPLETED.
 */
export async function freezeTransaction(
  ctx: RequestContext | null,
  keyId: string,
  params: {
    transaction_id: string;
    reason: string;
    alert_id: string;
    incident_id?: string | null;
    idempotency_key?: string | null;
  },
): Promise<ControlResult> {
  const cached = await checkIdempotentControl(params.idempotency_key);
  if (cached) return cached;

  const { data: tx } = await supabaseAdmin
    .from("transactions")
    .select("*, from_account:accounts!from_account_id(id, public_id, balance_minor), beneficiary:beneficiaries(public_id)")
    .or(`id.eq.${params.transaction_id},public_id.eq.${params.transaction_id}`)
    .maybeSingle();

  if (!tx) {
    return { status: "REJECTED", message: "Transaction not found." };
  }

  if (tx.status === "COMPLETED") {
    // Record rejected control attempt
    const { data: rejectedAction } = await supabaseAdmin
      .from("control_actions")
      .insert({
        action: "FREEZE_TRANSACTION",
        status: "REJECTED",
        target_public_id: tx.public_id,
        target_state: { status: "COMPLETED", amount_minor: tx.amount_minor },
        reason: params.reason,
        alert_ref: params.alert_id,
        incident_ref: params.incident_id ?? null,
        idempotency_key: params.idempotency_key ?? null,
        requested_by_key_id: keyId,
        error: "ALREADY_COMPLETED",
      })
      .select("id")
      .single();

    return {
      status: "REJECTED",
      code: "ALREADY_COMPLETED",
      control_action_id: rejectedAction?.id,
      target_state: { status: "COMPLETED" },
      actual_state: { status: "COMPLETED" },
      message: "ALREADY_COMPLETED: Transaction has already settled and cannot be frozen.",
    };
  }

  if (tx.status !== "PROCESSING") {
    return {
      status: "REJECTED",
      target_state: { status: tx.status },
      message: `Transaction is in status "${tx.status}" and cannot be frozen.`,
    };
  }

  // Update status to FROZEN
  await supabaseAdmin
    .from("transactions")
    .update({ status: "FROZEN" })
    .eq("id", tx.id);

  // Restore reserved funds to sender's checking account
  const fromAcc = tx.from_account as { id: string; balance_minor: number; public_id: string } | null;
  if (fromAcc) {
    const newBalance = Number(fromAcc.balance_minor) + Number(tx.amount_minor);
    await supabaseAdmin
      .from("accounts")
      .update({ balance_minor: newBalance })
      .eq("id", fromAcc.id);

    await supabaseAdmin.from("ledger_entries").insert({
      account_id: fromAcc.id,
      transaction_id: tx.id,
      direction: "CREDIT",
      amount_minor: Number(tx.amount_minor),
      balance_after_minor: newBalance,
    });
  }

  // Re-read from database to verify status change
  const { data: verified } = await supabaseAdmin
    .from("transactions")
    .select("status, public_id")
    .eq("id", tx.id)
    .single();

  if (verified?.status !== "FROZEN") {
    return { status: "REJECTED", message: "Database update verification failed." };
  }

  const targetState = { status: "FROZEN", amount_minor: tx.amount_minor, funds_restored: true };

  const { data: actionRecord } = await supabaseAdmin
    .from("control_actions")
    .insert({
      action: "FREEZE_TRANSACTION",
      status: "CONFIRMED",
      target_public_id: tx.public_id,
      target_state: targetState,
      reason: params.reason,
      alert_ref: params.alert_id,
      incident_ref: params.incident_id ?? null,
      idempotency_key: params.idempotency_key ?? null,
      requested_by_key_id: keyId,
    })
    .select("id")
    .single();

  // Emit RESPONSE_EXECUTED and specific events
  await emitSecurityEvent(ctx, "RESPONSE_EXECUTED", {
    result: "SUCCESS",
    transaction_id: tx.public_id,
    account_id: fromAcc?.public_id ?? null,
    attributes: {
      action: "FREEZE_TRANSACTION",
      status: "CONFIRMED",
      alert_ref: params.alert_id,
      incident_ref: params.incident_id ?? null,
      control_action_id: actionRecord?.id,
    },
  });

  await emitSecurityEvent(ctx, "TRANSFER_FROZEN", {
    result: "SUCCESS",
    transaction_id: tx.public_id,
    account_id: fromAcc?.public_id ?? null,
    amount_minor: tx.amount_minor,
    attributes: {
      reason: params.reason,
      alert_ref: params.alert_id,
      previous_status: "PROCESSING",
    },
  });

  await emitSecurityEvent(ctx, "TRANSFER_BLOCKED", {
    result: "BLOCKED",
    transaction_id: tx.public_id,
    account_id: fromAcc?.public_id ?? null,
    attributes: {
      reason: "TRANSACTION_FROZEN_BY_SECURITY",
      alert_ref: params.alert_id,
    },
  });

  await writeAudit("ECS", keyId, "FREEZE_TRANSACTION", "transaction", tx.public_id, {
    alert_ref: params.alert_id,
    reason: params.reason,
  });

  return {
    status: "CONFIRMED",
    control_action_id: actionRecord?.id,
    target_state: targetState,
    executed_at: new Date().toISOString(),
    message: "Transaction frozen successfully. Customer funds restored.",
  };
}

/**
 * 2. REVOKE_SESSION: Terminates an active session or all sessions for a user.
 */
export async function revokeSessionControl(
  ctx: RequestContext | null,
  keyId: string,
  params: {
    session_id?: string | null;
    user_id?: string | null;
    reason: string;
    alert_id: string;
    incident_id?: string | null;
    idempotency_key?: string | null;
  },
): Promise<ControlResult> {
  const cached = await checkIdempotentControl(params.idempotency_key);
  if (cached) return cached;

  if (!params.session_id && !params.user_id) {
    return { status: "REJECTED", message: "Either session_id or user_id is required." };
  }

  let revokedPublicIds: string[] = [];

  if (params.session_id) {
    const { data: sess } = await supabaseAdmin
      .from("target_sessions")
      .select("id, public_id, status")
      .or(`id.eq.${params.session_id},public_id.eq.${params.session_id}`)
      .maybeSingle();

    if (!sess) {
      return { status: "REJECTED", message: "Session not found." };
    }

    await supabaseAdmin
      .from("target_sessions")
      .update({
        status: "REVOKED",
        revoked_by: "ECS",
        revoked_reason: params.reason,
      })
      .eq("id", sess.id);

    revokedPublicIds.push(sess.public_id);

    await emitSecurityEvent(ctx, "SESSION_REVOKED", {
      result: "SUCCESS",
      session_id: sess.public_id,
      attributes: {
        revoked_by: "ECS",
        revoked_reason: params.reason,
        alert_ref: params.alert_id,
      },
    });
  } else if (params.user_id) {
    // Lookup user by public_id or user_id
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("user_id, public_id")
      .or(`user_id.eq.${params.user_id},public_id.eq.${params.user_id}`)
      .maybeSingle();

    if (!prof) {
      return { status: "REJECTED", message: "User not found." };
    }

    const { data: sessions } = await supabaseAdmin
      .from("target_sessions")
      .select("id, public_id")
      .eq("user_id", prof.user_id)
      .eq("status", "ACTIVE");

    if (sessions && sessions.length > 0) {
      const ids = sessions.map((s) => s.id);
      await supabaseAdmin
        .from("target_sessions")
        .update({
          status: "REVOKED",
          revoked_by: "ECS",
          revoked_reason: params.reason,
        })
        .in("id", ids);

      revokedPublicIds = sessions.map((s) => s.public_id);

      for (const s of sessions) {
        await emitSecurityEvent(ctx, "SESSION_REVOKED", {
          result: "SUCCESS",
          session_id: s.public_id,
          attributes: {
            revoked_by: "ECS",
            revoked_reason: params.reason,
            alert_ref: params.alert_id,
          },
        });
      }
    }
  }

  const targetState = { status: "REVOKED", revoked_sessions: revokedPublicIds };

  const { data: actionRecord } = await supabaseAdmin
    .from("control_actions")
    .insert({
      action: "REVOKE_SESSION",
      status: "CONFIRMED",
      target_public_id: params.session_id || params.user_id || null,
      target_state: targetState,
      reason: params.reason,
      alert_ref: params.alert_id,
      incident_ref: params.incident_id ?? null,
      idempotency_key: params.idempotency_key ?? null,
      requested_by_key_id: keyId,
    })
    .select("id")
    .single();

  await emitSecurityEvent(ctx, "RESPONSE_EXECUTED", {
    result: "SUCCESS",
    session_id: params.session_id ?? null,
    attributes: {
      action: "REVOKE_SESSION",
      status: "CONFIRMED",
      alert_ref: params.alert_id,
      incident_ref: params.incident_id ?? null,
      control_action_id: actionRecord?.id,
    },
  });

  await writeAudit("ECS", keyId, "REVOKE_SESSION", "session", params.session_id ?? params.user_id ?? "all", {
    alert_ref: params.alert_id,
    reason: params.reason,
  });

  return {
    status: "CONFIRMED",
    control_action_id: actionRecord?.id,
    target_state: targetState,
    executed_at: new Date().toISOString(),
    message: `Successfully revoked ${revokedPublicIds.length} session(s).`,
  };
}

/**
 * 3. REQUIRE_STEP_UP: Sets step_up_until on user profile, enforcing OTP verification.
 */
export async function requireStepUpControl(
  ctx: RequestContext | null,
  keyId: string,
  params: {
    user_id: string;
    duration_minutes?: number;
    reason: string;
    alert_id: string;
    incident_id?: string | null;
    idempotency_key?: string | null;
  },
): Promise<ControlResult> {
  const cached = await checkIdempotentControl(params.idempotency_key);
  if (cached) return cached;

  const durationMinutes = Math.min(Math.max(1, params.duration_minutes ?? 60), 1440);

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("user_id, public_id, step_up_until")
    .or(`user_id.eq.${params.user_id},public_id.eq.${params.user_id}`)
    .maybeSingle();

  if (!prof) {
    return { status: "REJECTED", message: "User not found." };
  }

  const stepUpUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  await supabaseAdmin
    .from("profiles")
    .update({ step_up_until: stepUpUntil })
    .eq("user_id", prof.user_id);

  // Re-read to verify state
  const { data: verified } = await supabaseAdmin
    .from("profiles")
    .select("step_up_until")
    .eq("user_id", prof.user_id)
    .single();

  if (!verified?.step_up_until) {
    return { status: "REJECTED", message: "Verification failed: step_up_until not updated." };
  }

  const targetState = { step_up_until: stepUpUntil, duration_minutes: durationMinutes };

  const { data: actionRecord } = await supabaseAdmin
    .from("control_actions")
    .insert({
      action: "REQUIRE_STEP_UP",
      status: "CONFIRMED",
      target_public_id: prof.public_id,
      target_state: targetState,
      reason: params.reason,
      alert_ref: params.alert_id,
      incident_ref: params.incident_id ?? null,
      idempotency_key: params.idempotency_key ?? null,
      requested_by_key_id: keyId,
    })
    .select("id")
    .single();

  await emitSecurityEvent(ctx, "RESPONSE_EXECUTED", {
    result: "SUCCESS",
    user_id: prof.public_id,
    attributes: {
      action: "REQUIRE_STEP_UP",
      status: "CONFIRMED",
      alert_ref: params.alert_id,
      control_action_id: actionRecord?.id,
    },
  });

  await emitSecurityEvent(ctx, "STEP_UP_REQUIRED", {
    result: "SUCCESS",
    user_id: prof.public_id,
    attributes: {
      reason: params.reason,
      alert_ref: params.alert_id,
      step_up_until: stepUpUntil,
    },
  });

  await writeAudit("ECS", keyId, "REQUIRE_STEP_UP", "user", prof.public_id, {
    alert_ref: params.alert_id,
    step_up_until: stepUpUntil,
  });

  return {
    status: "CONFIRMED",
    control_action_id: actionRecord?.id,
    target_state: targetState,
    executed_at: new Date().toISOString(),
    message: `Step-up authentication required for user ${prof.public_id} for ${durationMinutes} minutes.`,
  };
}

/**
 * 4. DISABLE_BENEFICIARY: Disables a beneficiary so transfers to it are blocked.
 */
export async function disableBeneficiaryControl(
  ctx: RequestContext | null,
  keyId: string,
  params: {
    beneficiary_id: string;
    reason: string;
    alert_id: string;
    incident_id?: string | null;
    idempotency_key?: string | null;
  },
): Promise<ControlResult> {
  const cached = await checkIdempotentControl(params.idempotency_key);
  if (cached) return cached;

  const { data: ben } = await supabaseAdmin
    .from("beneficiaries")
    .select("*, account:accounts!account_id(public_id)")
    .or(`id.eq.${params.beneficiary_id},public_id.eq.${params.beneficiary_id}`)
    .maybeSingle();

  if (!ben) {
    return { status: "REJECTED", message: "Beneficiary not found." };
  }

  await supabaseAdmin
    .from("beneficiaries")
    .update({
      status: "DISABLED",
      disabled_reason: params.reason,
    })
    .eq("id", ben.id);

  // Re-read to verify
  const { data: verified } = await supabaseAdmin
    .from("beneficiaries")
    .select("status, disabled_reason")
    .eq("id", ben.id)
    .single();

  if (verified?.status !== "DISABLED") {
    return { status: "REJECTED", message: "Verification failed: beneficiary status not disabled." };
  }

  const targetState = { status: "DISABLED", disabled_reason: params.reason };

  const { data: actionRecord } = await supabaseAdmin
    .from("control_actions")
    .insert({
      action: "DISABLE_BENEFICIARY",
      status: "CONFIRMED",
      target_public_id: ben.public_id,
      target_state: targetState,
      reason: params.reason,
      alert_ref: params.alert_id,
      incident_ref: params.incident_id ?? null,
      idempotency_key: params.idempotency_key ?? null,
      requested_by_key_id: keyId,
    })
    .select("id")
    .single();

  await emitSecurityEvent(ctx, "RESPONSE_EXECUTED", {
    result: "SUCCESS",
    beneficiary_id: ben.public_id,
    attributes: {
      action: "DISABLE_BENEFICIARY",
      status: "CONFIRMED",
      alert_ref: params.alert_id,
      control_action_id: actionRecord?.id,
    },
  });

  await emitSecurityEvent(ctx, "BENEFICIARY_DISABLED", {
    result: "SUCCESS",
    beneficiary_id: ben.public_id,
    account_id: (ben.account as { public_id?: string })?.public_id ?? null,
    attributes: {
      reason: params.reason,
      alert_ref: params.alert_id,
    },
  });

  await writeAudit("ECS", keyId, "DISABLE_BENEFICIARY", "beneficiary", ben.public_id, {
    alert_ref: params.alert_id,
    reason: params.reason,
  });

  return {
    status: "CONFIRMED",
    control_action_id: actionRecord?.id,
    target_state: targetState,
    executed_at: new Date().toISOString(),
    message: `Beneficiary ${ben.name} (${ben.public_id}) disabled successfully.`,
  };
}

/**
 * 5. BLOCK_IP: Blocks an IP address from accessing endpoints (refuses loopback/private).
 */
export async function blockIpControl(
  ctx: RequestContext | null,
  keyId: string,
  params: {
    ip: string;
    duration_minutes?: number;
    reason: string;
    alert_id: string;
    incident_id?: string | null;
    idempotency_key?: string | null;
  },
): Promise<ControlResult> {
  const cached = await checkIdempotentControl(params.idempotency_key);
  if (cached) return cached;

  const targetIp = params.ip.trim();

  // Refuse loopback or private ranges
  if (isPrivateOrLoopbackIp(targetIp)) {
    return {
      status: "REJECTED",
      message: `Cannot block loopback or private RFC1918/RFC3927 IP address "${targetIp}".`,
    };
  }

  const durationMinutes = Math.min(Math.max(1, params.duration_minutes ?? 60), 1440);
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  // Upsert into ip_blocklist
  await supabaseAdmin
    .from("ip_blocklist")
    .upsert({
      ip: targetIp,
      expires_at: expiresAt,
      reason: params.reason,
      source: "ECS",
      alert_ref: params.alert_id,
      updated_at: new Date().toISOString(),
    });

  // Re-read to verify
  const { data: verified } = await supabaseAdmin
    .from("ip_blocklist")
    .select("ip, expires_at")
    .eq("ip", targetIp)
    .maybeSingle();

  if (!verified) {
    return { status: "REJECTED", message: "Verification failed: IP blocklist entry not created." };
  }

  const targetState = { ip: targetIp, expires_at: expiresAt, duration_minutes: durationMinutes };

  const { data: actionRecord } = await supabaseAdmin
    .from("control_actions")
    .insert({
      action: "BLOCK_IP",
      status: "CONFIRMED",
      target_public_id: targetIp,
      target_state: targetState,
      reason: params.reason,
      alert_ref: params.alert_id,
      incident_ref: params.incident_id ?? null,
      idempotency_key: params.idempotency_key ?? null,
      requested_by_key_id: keyId,
    })
    .select("id")
    .single();

  await emitSecurityEvent(ctx, "RESPONSE_EXECUTED", {
    result: "SUCCESS",
    source_ip: targetIp,
    attributes: {
      action: "BLOCK_IP",
      status: "CONFIRMED",
      alert_ref: params.alert_id,
      control_action_id: actionRecord?.id,
    },
  });

  await emitSecurityEvent(ctx, "IP_BLOCKED", {
    result: "BLOCKED",
    source_ip: targetIp,
    attributes: {
      reason: params.reason,
      alert_ref: params.alert_id,
      expires_at: expiresAt,
    },
  });

  await writeAudit("ECS", keyId, "BLOCK_IP", "ip", targetIp, {
    alert_ref: params.alert_id,
    expires_at: expiresAt,
  });

  return {
    status: "CONFIRMED",
    control_action_id: actionRecord?.id,
    target_state: targetState,
    executed_at: new Date().toISOString(),
    message: `IP ${targetIp} blocked for ${durationMinutes} minutes.`,
  };
}

/**
 * 6. LOCK_ACCOUNT: Locks a customer checking account.
 */
export async function lockAccountControl(
  ctx: RequestContext | null,
  keyId: string,
  params: {
    account_id?: string | null;
    user_id?: string | null;
    duration_minutes?: number;
    reason: string;
    alert_id: string;
    incident_id?: string | null;
    idempotency_key?: string | null;
  },
): Promise<ControlResult> {
  const cached = await checkIdempotentControl(params.idempotency_key);
  if (cached) return cached;

  let accountRow: { id: string; public_id: string; status: string; user_id: string | null } | null = null;

  if (params.account_id) {
    const { data } = await supabaseAdmin
      .from("accounts")
      .select("id, public_id, status, user_id")
      .or(`id.eq.${params.account_id},public_id.eq.${params.account_id}`)
      .maybeSingle();
    accountRow = data;
  } else if (params.user_id) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .or(`user_id.eq.${params.user_id},public_id.eq.${params.user_id}`)
      .maybeSingle();

    if (prof) {
      const { data } = await supabaseAdmin
        .from("accounts")
        .select("id, public_id, status, user_id")
        .eq("user_id", prof.user_id)
        .maybeSingle();
      accountRow = data;
    }
  }

  if (!accountRow) {
    return { status: "REJECTED", message: "Account not found." };
  }

  await supabaseAdmin
    .from("accounts")
    .update({ status: "LOCKED" })
    .eq("id", accountRow.id);

  // Re-read to verify
  const { data: verified } = await supabaseAdmin
    .from("accounts")
    .select("status, public_id")
    .eq("id", accountRow.id)
    .single();

  if (verified?.status !== "LOCKED") {
    return { status: "REJECTED", message: "Verification failed: account status not locked." };
  }

  const targetState = { status: "LOCKED", account_id: accountRow.public_id };

  const { data: actionRecord } = await supabaseAdmin
    .from("control_actions")
    .insert({
      action: "LOCK_ACCOUNT",
      status: "CONFIRMED",
      target_public_id: accountRow.public_id,
      target_state: targetState,
      reason: params.reason,
      alert_ref: params.alert_id,
      incident_ref: params.incident_id ?? null,
      idempotency_key: params.idempotency_key ?? null,
      requested_by_key_id: keyId,
    })
    .select("id")
    .single();

  await emitSecurityEvent(ctx, "RESPONSE_EXECUTED", {
    result: "SUCCESS",
    account_id: accountRow.public_id,
    attributes: {
      action: "LOCK_ACCOUNT",
      status: "CONFIRMED",
      alert_ref: params.alert_id,
      control_action_id: actionRecord?.id,
    },
  });

  await emitSecurityEvent(ctx, "ACCOUNT_LOCKED", {
    result: "SUCCESS",
    account_id: accountRow.public_id,
    attributes: {
      reason: params.reason,
      alert_ref: params.alert_id,
    },
  });

  await writeAudit("ECS", keyId, "LOCK_ACCOUNT", "account", accountRow.public_id, {
    alert_ref: params.alert_id,
    reason: params.reason,
  });

  return {
    status: "CONFIRMED",
    control_action_id: actionRecord?.id,
    target_state: targetState,
    executed_at: new Date().toISOString(),
    message: `Account ${accountRow.public_id} locked successfully.`,
  };
}

/**
 * 7. REVERT: Reverts a reversible control action (undo freeze/block/lock/step-up/disable).
 */
export async function revertControlAction(
  ctx: RequestContext | null,
  keyId: string,
  params: {
    control_action_id: string;
    reason?: string;
    alert_id?: string;
  },
): Promise<ControlResult> {
  const { data: action } = await supabaseAdmin
    .from("control_actions")
    .select("*")
    .eq("id", params.control_action_id)
    .maybeSingle();

  if (!action) {
    return { status: "REJECTED", message: "Control action record not found." };
  }

  if (action.status === "REVERTED") {
    return {
      status: "CONFIRMED",
      control_action_id: action.id,
      target_state: { status: "REVERTED" },
      message: "Control action is already reverted.",
    };
  }

  const targetRef = action.target_public_id;
  let revertSuccess = false;

  switch (action.action) {
    case "BLOCK_IP":
      if (targetRef) {
        await supabaseAdmin.from("ip_blocklist").delete().eq("ip", targetRef);
        revertSuccess = true;
      }
      break;

    case "LOCK_ACCOUNT":
      if (targetRef) {
        await supabaseAdmin
          .from("accounts")
          .update({ status: "ACTIVE" })
          .or(`public_id.eq.${targetRef},id.eq.${targetRef}`);
        revertSuccess = true;
      }
      break;

    case "DISABLE_BENEFICIARY":
      if (targetRef) {
        await supabaseAdmin
          .from("beneficiaries")
          .update({ status: "ACTIVE", disabled_reason: null })
          .or(`public_id.eq.${targetRef},id.eq.${targetRef}`);
        revertSuccess = true;
      }
      break;

    case "REQUIRE_STEP_UP":
      if (targetRef) {
        await supabaseAdmin
          .from("profiles")
          .update({ step_up_until: null })
          .or(`public_id.eq.${targetRef},user_id.eq.${targetRef}`);
        revertSuccess = true;
      }
      break;

    case "FREEZE_TRANSACTION":
      // Mark transaction status back or CANCELLED
      if (targetRef) {
        await supabaseAdmin
          .from("transactions")
          .update({ status: "CANCELLED" })
          .or(`public_id.eq.${targetRef},id.eq.${targetRef}`);
        revertSuccess = true;
      }
      break;

    default:
      return {
        status: "REJECTED",
        message: `Action "${action.action}" is not reversible.`,
      };
  }

  if (!revertSuccess) {
    return { status: "REJECTED", message: "Failed to revert control state." };
  }

  // Update control action status to REVERTED
  await supabaseAdmin
    .from("control_actions")
    .update({ status: "REVERTED" })
    .eq("id", action.id);

  const targetState = { status: "REVERTED", original_action: action.action, target_ref: targetRef };

  await emitSecurityEvent(ctx, "RESPONSE_EXECUTED", {
    result: "SUCCESS",
    attributes: {
      action: "REVERT",
      original_action: action.action,
      control_action_id: action.id,
      target_ref: targetRef,
    },
  });

  await writeAudit("ECS", keyId, "REVERT", "control_action", action.id, {
    original_action: action.action,
    target_ref: targetRef,
  });

  return {
    status: "CONFIRMED",
    control_action_id: action.id,
    target_state: targetState,
    executed_at: new Date().toISOString(),
    message: `Control action ${action.action} reverted successfully.`,
  };
}
