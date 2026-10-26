import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emitSecurityEvent, TelemetryError, type RequestContext } from "./telemetry.server";

export interface CreateTransferInput {
  beneficiaryId?: string | null;
  recipientAccountNumber?: string | null;
  amountEtb: number; // in whole ETB or decimal
  note?: string | null;
  idempotencyKey?: string | null;
  otpChallengeId?: string | null;
}

export function getLocalHourAddisAbaba(date = new Date()): number {
  return (date.getUTCHours() + 3) % 24;
}

export function isOffHours(localHour: number, start = "22:00", end = "06:00"): boolean {
  const startH = parseInt(start.split(":")[0] ?? "22", 10);
  const endH = parseInt(end.split(":")[0] ?? "6", 10);
  if (startH > endH) {
    return localHour >= startH || localHour < endH;
  }
  return localHour >= startH && localHour < endH;
}

/**
 * Creates and processes a real synthetic transfer.
 * Atomic, idempotent, limits-enforcing, high-value hold countdown aware, double-entry ledger.
 */
export async function createTransfer(ctx: RequestContext, input: CreateTransferInput) {
  if (!ctx.user) {
    throw new TelemetryError("UNAUTHENTICATED", "Sign in required to make a transfer.", 401);
  }

  const amountMinor = Math.round(input.amountEtb * 100);
  if (amountMinor <= 0) {
    throw new TelemetryError("INVALID_AMOUNT", "Transfer amount must be greater than zero.", 400);
  }

  // Settle any pending processing transfers before beginning
  await settleDueTransfers();

  // 1. Fetch Profile & Posture
  const [{ data: profile }, { data: posture }] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("user_id", ctx.user.id).single(),
    supabaseAdmin.from("security_posture").select("*").eq("id", 1).single(),
  ]);

  if (!profile) throw new TelemetryError("PROFILE_NOT_FOUND", "Profile not found", 404);

  if (profile.must_change_password) {
    throw new TelemetryError(
      "PASSWORD_CHANGE_REQUIRED",
      "You must change your temporary password before performing transfers.",
      403,
    );
  }

  // Check Step-up requirement
  const isStepUpActive = !!profile.step_up_until && new Date(profile.step_up_until).getTime() > Date.now();
  if (isStepUpActive) {
    if (!input.otpChallengeId) {
      await emitSecurityEvent(ctx, "STEP_UP_REQUIRED", {
        result: "PENDING",
        attributes: { reason: "STEP_UP_ACTIVE", action: "TRANSFER" },
      });
      throw new TelemetryError("STEP_UP_REQUIRED", "Step-up verification required. Please enter OTP.", 403);
    }
    const { data: challenge } = await supabaseAdmin
      .from("otp_challenges")
      .select("status")
      .eq("id", input.otpChallengeId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();

    if (!challenge || challenge.status !== "VERIFIED") {
      throw new TelemetryError("STEP_UP_UNVERIFIED", "Please verify the security code first.", 403);
    }
  }

  // 2. Fetch Sender Account
  const { data: fromAccount, error: accErr } = await supabaseAdmin
    .from("accounts")
    .select("*")
    .eq("user_id", ctx.user.id)
    .eq("is_system", false)
    .single();

  if (accErr || !fromAccount) {
    throw new TelemetryError("ACCOUNT_NOT_FOUND", "Primary checking account not found", 404);
  }

  // Account locked?
  if (fromAccount.status === "LOCKED") {
    await emitSecurityEvent(ctx, "TRANSFER_BLOCKED", {
      result: "BLOCKED",
      account_id: fromAccount.public_id,
      amount_minor: amountMinor,
      attributes: { reason: "ACCOUNT_LOCKED", status: fromAccount.status },
    });
    throw new TelemetryError("ACCOUNT_LOCKED", "Your account is locked. Transfers are disabled.", 403);
  }

  // 3. Resolve Beneficiary & Destination Account
  let beneficiary: any = null;
  let targetAccountNumber = "";

  if (input.beneficiaryId) {
    const { data: ben, error: benErr } = await supabaseAdmin
      .from("beneficiaries")
      .select("*")
      .eq("id", input.beneficiaryId)
      .eq("account_id", fromAccount.id)
      .maybeSingle();

    if (benErr || !ben || ben.status === "REMOVED") {
      throw new TelemetryError("BENEFICIARY_NOT_FOUND", "Beneficiary not found.", 404);
    }

    if (ben.status === "DISABLED") {
      await emitSecurityEvent(ctx, "TRANSFER_BLOCKED", {
        result: "BLOCKED",
        account_id: fromAccount.public_id,
        beneficiary_id: ben.public_id,
        amount_minor: amountMinor,
        attributes: {
          reason: "BENEFICIARY_DISABLED",
          disabled_reason: ben.disabled_reason ?? "Security hold",
        },
      });
      throw new TelemetryError("BENEFICIARY_DISABLED", `Beneficiary is disabled: ${ben.disabled_reason || "Security hold"}`, 403);
    }

    beneficiary = ben;
    targetAccountNumber = ben.account_number;
  } else if (input.recipientAccountNumber) {
    targetAccountNumber = input.recipientAccountNumber.trim();
  }

  if (!targetAccountNumber) {
    throw new TelemetryError("RECIPIENT_REQUIRED", "Please select a registered beneficiary or provide a valid recipient account number.", 400);
  }

  // Strictly verify recipient account belongs to an active registered customer
  const { data: toAcc } = await supabaseAdmin
    .from("accounts")
    .select("id, public_id, account_number, balance_minor, is_system, user_id, status")
    .eq("account_number", targetAccountNumber)
    .maybeSingle();

  if (!toAcc || toAcc.is_system || !toAcc.user_id) {
    await emitSecurityEvent(ctx, "TRANSFER_BLOCKED", {
      result: "BLOCKED",
      account_id: fromAccount.public_id,
      amount_minor: amountMinor,
      attributes: {
        reason: "UNREGISTERED_RECIPIENT",
        attempted_account_number: targetAccountNumber,
      },
    });
    throw new TelemetryError(
      "UNREGISTERED_RECIPIENT",
      `Account number "${targetAccountNumber}" is not a registered HonorPay account. Transfers are strictly restricted to registered HonorPay users.`,
      400,
    );
  }

  if (toAcc.id === fromAccount.id) {
    throw new TelemetryError("SELF_TRANSFER", "Cannot transfer funds to your own account.", 400);
  }

  if (toAcc.status === "LOCKED") {
    throw new TelemetryError("RECIPIENT_LOCKED", "Recipient account is currently locked and cannot receive transfers.", 400);
  }

  // If beneficiary record doesn't exist yet for this sender, create one automatically
  if (!beneficiary) {
    const { data: recProf } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", toAcc.user_id)
      .maybeSingle();

    const { data: createdBen } = await supabaseAdmin
      .from("beneficiaries")
      .insert({
        account_id: fromAccount.id,
        name: recProf?.full_name || `HonorPay User (${toAcc.account_number.slice(-4)})`,
        account_number: toAcc.account_number,
        bank_name: "HonorPay",
        is_internal: true,
        status: "ACTIVE",
      })
      .select("*")
      .single();

    beneficiary = createdBen;
  }

  const toAccountId = toAcc.id;

  // 4. Check Idempotency Key (Return existing transaction if already processed)
  const idempotencyKey = input.idempotencyKey || `tx-${ctx.user.publicId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { data: existingTx } = await supabaseAdmin
    .from("transactions")
    .select("*, beneficiary:beneficiaries(public_id, name)")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingTx) {
    return {
      transaction: existingTx,
      idempotentReplay: true,
    };
  }

  // 5. Transfer Limits & Velocity Checks
  if (amountMinor > fromAccount.per_tx_limit_minor) {
    await emitSecurityEvent(ctx, "TRANSFER_BLOCKED", {
      result: "BLOCKED",
      account_id: fromAccount.public_id,
      amount_minor: amountMinor,
      attributes: {
        reason: "PER_TX_LIMIT_EXCEEDED",
        limit_minor: fromAccount.per_tx_limit_minor,
      },
    });
    throw new TelemetryError("LIMIT_EXCEEDED", `Amount exceeds the per-transaction limit of ${(fromAccount.per_tx_limit_minor / 100).toLocaleString()} ETB.`, 400);
  }

  // Compute Daily Total & Velocity
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const sixtyMinAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400 * 1000).toISOString();

  const [
    { data: todayTxs },
    { count: txs10m },
    { count: txs60m },
    { data: past30dTxs },
    { count: prevTxToBenCount },
  ] = await Promise.all([
    supabaseAdmin.from("transactions").select("amount_minor").eq("from_account_id", fromAccount.id).gte("created_at", startOfDay.toISOString()),
    supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).eq("from_account_id", fromAccount.id).gte("created_at", tenMinAgo),
    supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).eq("from_account_id", fromAccount.id).gte("created_at", sixtyMinAgo),
    supabaseAdmin.from("transactions").select("amount_minor").eq("from_account_id", fromAccount.id).eq("status", "COMPLETED").gte("created_at", thirtyDaysAgo),
    supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).eq("from_account_id", fromAccount.id).eq("beneficiary_id", beneficiary.id),
  ]);

  const dailyTotalMinor = (todayTxs ?? []).reduce((acc, t) => acc + Number(t.amount_minor), 0);
  if (dailyTotalMinor + amountMinor > fromAccount.daily_limit_minor) {
    await emitSecurityEvent(ctx, "TRANSFER_BLOCKED", {
      result: "BLOCKED",
      account_id: fromAccount.public_id,
      amount_minor: amountMinor,
      attributes: {
        reason: "DAILY_LIMIT_EXCEEDED",
        daily_total_minor: dailyTotalMinor,
        daily_limit_minor: fromAccount.daily_limit_minor,
      },
    });
    throw new TelemetryError("DAILY_LIMIT_EXCEEDED", `Transfer exceeds your daily limit of ${(fromAccount.daily_limit_minor / 100).toLocaleString()} ETB.`, 400);
  }

  // 6. Deposit Balance Verification
  const balanceBeforeMinor = Number(fromAccount.balance_minor);
  if (balanceBeforeMinor <= 0) {
    await emitSecurityEvent(ctx, "TRANSFER_FAILED", {
      result: "FAILURE",
      account_id: fromAccount.public_id,
      beneficiary_id: beneficiary.public_id,
      amount_minor: amountMinor,
      attributes: {
        failure_reason: "NO_DEPOSIT_FUNDS",
        balance_before_minor: balanceBeforeMinor,
        amount_requested_minor: amountMinor,
      },
    });
    throw new TelemetryError(
      "NO_FUNDS",
      "You have no funds deposited. Please deposit money at an HonorPay branch or teller before making a transfer.",
      400,
    );
  }

  if (balanceBeforeMinor < amountMinor) {
    await emitSecurityEvent(ctx, "TRANSFER_FAILED", {
      result: "FAILURE",
      account_id: fromAccount.public_id,
      beneficiary_id: beneficiary.public_id,
      amount_minor: amountMinor,
      attributes: {
        failure_reason: "INSUFFICIENT_FUNDS",
        balance_before_minor: balanceBeforeMinor,
        amount_requested_minor: amountMinor,
      },
    });
    throw new TelemetryError(
      "INSUFFICIENT_FUNDS",
      `Insufficient balance. Available deposit funds: ${(balanceBeforeMinor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ETB.`,
      400,
    );
  }

  // 7. Context Enrichment Computation (§8)
  const balanceAfterMinor = balanceBeforeMinor - amountMinor;
  const percentOfBalance = balanceBeforeMinor > 0 ? Number(((amountMinor / balanceBeforeMinor) * 100).toFixed(1)) : 100;

  const amounts30d = (past30dTxs ?? []).map((t) => Number(t.amount_minor));
  const avg30dMinor = amounts30d.length > 0 ? Math.round(amounts30d.reduce((a, b) => a + b, 0) / amounts30d.length) : 0;
  const max30dMinor = amounts30d.length > 0 ? Math.max(...amounts30d) : 0;

  const isFirstTransferToBeneficiary = (prevTxToBenCount ?? 0) === 0;
  const beneficiaryAgeSeconds = Math.max(0, Math.round((now.getTime() - new Date(beneficiary.created_at).getTime()) / 1000));

  const { data: device } = ctx.device
    ? await supabaseAdmin.from("target_devices").select("*").eq("id", ctx.device.id).maybeSingle()
    : { data: null };

  const deviceAgeSeconds = device ? Math.max(0, Math.round((now.getTime() - new Date(device.first_seen_at).getTime()) / 1000)) : 0;
  const sessionAgeSeconds = ctx.session
    ? Math.max(0, Math.round((now.getTime() - new Date().getTime()) / 1000))
    : 0;

  const localHour = getLocalHourAddisAbaba(now);
  const offHours = isOffHours(localHour, posture?.off_hours_start, posture?.off_hours_end);

  const highValueThresholdMinor = Number(posture?.high_value_threshold_minor ?? 5000000);
  const isHighValue = amountMinor >= highValueThresholdMinor;
  const justUnderThreshold = amountMinor >= highValueThresholdMinor * 0.95 && amountMinor < highValueThresholdMinor;

  const holdSeconds = posture?.hold_seconds_for_high_value ?? 20;
  const holdUntil = isHighValue ? new Date(now.getTime() + holdSeconds * 1000).toISOString() : null;
  const status = isHighValue ? "PROCESSING" : "COMPLETED";

  // Destination account is already verified and assigned to toAccountId
  const { data: settlementAcc } = await supabaseAdmin
    .from("accounts")
    .select("id, balance_minor")
    .eq("public_id", "ACC_SETTLEMENT")
    .single();

  // 8. Atomic Database Execution: Update sender balance & insert transaction
  await supabaseAdmin
    .from("accounts")
    .update({ balance_minor: balanceAfterMinor })
    .eq("id", fromAccount.id);

  const { data: transaction, error: txError } = await supabaseAdmin
    .from("transactions")
    .insert({
      from_account_id: fromAccount.id,
      to_account_id: toAccountId,
      beneficiary_id: beneficiary.id,
      amount_minor: amountMinor,
      currency: "ETB",
      note: input.note?.trim() || null,
      status,
      hold_until: holdUntil,
      idempotency_key: idempotencyKey,
      session_id: ctx.session?.id ?? null,
      device_id: ctx.device?.id ?? null,
      source_ip: ctx.ip,
      completed_at: status === "COMPLETED" ? now.toISOString() : null,
    })
    .select("*, beneficiary:beneficiaries(public_id, name, account_number, bank_name)")
    .single();

  if (txError || !transaction) {
    // Rollback debit if insertion failed
    await supabaseAdmin
      .from("accounts")
      .update({ balance_minor: balanceBeforeMinor })
      .eq("id", fromAccount.id);
    throw new TelemetryError("TRANSFER_ERROR", `Failed to complete transaction: ${txError?.message}`, 500);
  }

  // 9. Double-entry Ledger Entries
  // Always DEBIT sender
  await supabaseAdmin.from("ledger_entries").insert({
    account_id: fromAccount.id,
    transaction_id: transaction.id,
    direction: "DEBIT",
    amount_minor: amountMinor,
    balance_after_minor: balanceAfterMinor,
  });

  // If instantly COMPLETED, immediately CREDIT destination / settlement
  if (status === "COMPLETED") {
    if (toAccountId) {
      const { data: destAcc } = await supabaseAdmin.from("accounts").select("balance_minor").eq("id", toAccountId).single();
      const destBalanceAfter = Number(destAcc?.balance_minor ?? 0) + amountMinor;
      await supabaseAdmin.from("accounts").update({ balance_minor: destBalanceAfter }).eq("id", toAccountId);
      await supabaseAdmin.from("ledger_entries").insert({
        account_id: toAccountId,
        transaction_id: transaction.id,
        direction: "CREDIT",
        amount_minor: amountMinor,
        balance_after_minor: destBalanceAfter,
      });
    } else if (settlementAcc) {
      const settleBalanceAfter = Number(settlementAcc.balance_minor) + amountMinor;
      await supabaseAdmin.from("accounts").update({ balance_minor: settleBalanceAfter }).eq("id", settlementAcc.id);
      await supabaseAdmin.from("ledger_entries").insert({
        account_id: settlementAcc.id,
        transaction_id: transaction.id,
        direction: "CREDIT",
        amount_minor: amountMinor,
        balance_after_minor: settleBalanceAfter,
      });
    }
  }

  // 10. Emit Telemetry Events
  const commonAttrs = {
    amount_minor: amountMinor,
    balance_before_minor: balanceBeforeMinor,
    balance_after_minor: balanceAfterMinor,
    percent_of_balance: percentOfBalance,
    avg_transfer_amount_30d_minor: avg30dMinor,
    max_transfer_amount_30d_minor: max30dMinor,
    transfers_last_10min: (txs10m ?? 0) + 1,
    transfers_last_60min: (txs60m ?? 0) + 1,
    daily_total_minor: dailyTotalMinor + amountMinor,
    is_first_transfer_to_beneficiary: isFirstTransferToBeneficiary,
    beneficiary_age_seconds: beneficiaryAgeSeconds,
    device_age_seconds: deviceAgeSeconds,
    device_trusted: device?.trusted ?? false,
    session_age_seconds: sessionAgeSeconds,
    local_hour: localHour,
    off_hours: offHours,
    step_up_active: isStepUpActive,
    hold_until: holdUntil,
    just_under_threshold: justUnderThreshold,
  };

  // Always emit TRANSFER_CREATED
  await emitSecurityEvent(ctx, "TRANSFER_CREATED", {
    result: status === "COMPLETED" ? "SUCCESS" : "PENDING",
    account_id: fromAccount.public_id,
    beneficiary_id: beneficiary.public_id,
    transaction_id: transaction.public_id,
    amount_minor: amountMinor,
    currency: "ETB",
    attributes: commonAttrs,
  });

  // If instantly COMPLETED, emit TRANSFER_COMPLETED
  if (status === "COMPLETED") {
    await emitSecurityEvent(ctx, "TRANSFER_COMPLETED", {
      result: "SUCCESS",
      account_id: fromAccount.public_id,
      beneficiary_id: beneficiary.public_id,
      transaction_id: transaction.public_id,
      amount_minor: amountMinor,
      currency: "ETB",
      attributes: commonAttrs,
    });
  }

  return {
    transaction,
    status,
    holdCountdownSeconds: isHighValue ? holdSeconds : 0,
    holdUntil,
  };
}

/**
 * settleDueTransfers: Settles all PROCESSING transfers where hold_until <= now.
 * Credits destination / settlement accounts and emits TRANSFER_COMPLETED.
 */
export async function settleDueTransfers() {
  const now = new Date();
  const { data: dueTxs } = await supabaseAdmin
    .from("transactions")
    .select("*, from_account:accounts!from_account_id(public_id), beneficiary:beneficiaries(public_id, is_internal, account_number)")
    .eq("status", "PROCESSING")
    .lte("hold_until", now.toISOString());

  if (!dueTxs || dueTxs.length === 0) return 0;

  let settledCount = 0;
  for (const tx of dueTxs) {
    if (tx.status !== "PROCESSING") continue;

    // Check if frozen while in hold
    if (tx.frozen_at) continue;

    const amountMinor = Number(tx.amount_minor);

    // Credit destination
    if (tx.to_account_id) {
      const { data: destAcc } = await supabaseAdmin.from("accounts").select("balance_minor").eq("id", tx.to_account_id).single();
      const destBalanceAfter = Number(destAcc?.balance_minor ?? 0) + amountMinor;
      await supabaseAdmin.from("accounts").update({ balance_minor: destBalanceAfter }).eq("id", tx.to_account_id);
      await supabaseAdmin.from("ledger_entries").insert({
        account_id: tx.to_account_id,
        transaction_id: tx.id,
        direction: "CREDIT",
        amount_minor: amountMinor,
        balance_after_minor: destBalanceAfter,
      });
    } else {
      const { data: settlementAcc } = await supabaseAdmin.from("accounts").select("id, balance_minor").eq("public_id", "ACC_SETTLEMENT").single();
      if (settlementAcc) {
        const settleBalanceAfter = Number(settlementAcc.balance_minor) + amountMinor;
        await supabaseAdmin.from("accounts").update({ balance_minor: settleBalanceAfter }).eq("id", settlementAcc.id);
        await supabaseAdmin.from("ledger_entries").insert({
          account_id: settlementAcc.id,
          transaction_id: tx.id,
          direction: "CREDIT",
          amount_minor: amountMinor,
          balance_after_minor: settleBalanceAfter,
        });
      }
    }

    // Update status to COMPLETED
    await supabaseAdmin
      .from("transactions")
      .update({
        status: "COMPLETED",
        completed_at: now.toISOString(),
      })
      .eq("id", tx.id);

    // Emit TRANSFER_COMPLETED
    await emitSecurityEvent(null, "TRANSFER_COMPLETED", {
      result: "SUCCESS",
      account_id: (tx.from_account as { public_id?: string })?.public_id ?? null,
      beneficiary_id: (tx.beneficiary as { public_id?: string })?.public_id ?? null,
      transaction_id: tx.public_id,
      amount_minor: amountMinor,
      currency: "ETB",
      attributes: {
        settlement_type: "HIGH_VALUE_HOLD_EXPIRED",
        completed_at: now.toISOString(),
      },
    });

    settledCount++;
  }

  return settledCount;
}

/**
 * Manually settles a single PROCESSING transfer immediately (Admin release).
 */
export async function settleSingleTransaction(txIdOrPublicId: string) {
  const { data: tx } = await supabaseAdmin
    .from("transactions")
    .select("*, from_account:accounts!from_account_id(public_id), beneficiary:beneficiaries(public_id, is_internal, account_number)")
    .or(`id.eq.${txIdOrPublicId},public_id.eq.${txIdOrPublicId}`)
    .maybeSingle();

  if (!tx) {
    throw new Error("Transaction not found.");
  }

  if (tx.status !== "PROCESSING") {
    throw new Error(`Transaction is in status "${tx.status}" and cannot be released.`);
  }

  const now = new Date();
  const amountMinor = Number(tx.amount_minor);

  // Credit destination or settlement
  if (tx.to_account_id) {
    const { data: destAcc } = await supabaseAdmin
      .from("accounts")
      .select("balance_minor")
      .eq("id", tx.to_account_id)
      .single();
    const destBalanceAfter = Number(destAcc?.balance_minor ?? 0) + amountMinor;
    await supabaseAdmin
      .from("accounts")
      .update({ balance_minor: destBalanceAfter })
      .eq("id", tx.to_account_id);
    await supabaseAdmin.from("ledger_entries").insert({
      account_id: tx.to_account_id,
      transaction_id: tx.id,
      direction: "CREDIT",
      amount_minor: amountMinor,
      balance_after_minor: destBalanceAfter,
    });
  } else {
    const { data: settlementAcc } = await supabaseAdmin
      .from("accounts")
      .select("id, balance_minor")
      .eq("public_id", "ACC_SETTLEMENT")
      .single();
    if (settlementAcc) {
      const settleBalanceAfter = Number(settlementAcc.balance_minor) + amountMinor;
      await supabaseAdmin
        .from("accounts")
        .update({ balance_minor: settleBalanceAfter })
        .eq("id", settlementAcc.id);
      await supabaseAdmin.from("ledger_entries").insert({
        account_id: settlementAcc.id,
        transaction_id: tx.id,
        direction: "CREDIT",
        amount_minor: amountMinor,
        balance_after_minor: settleBalanceAfter,
      });
    }
  }

  // Update status to COMPLETED
  await supabaseAdmin
    .from("transactions")
    .update({
      status: "COMPLETED",
      completed_at: now.toISOString(),
    })
    .eq("id", tx.id);

  // Emit TRANSFER_COMPLETED
  await emitSecurityEvent(null, "TRANSFER_COMPLETED", {
    result: "SUCCESS",
    account_id: (tx.from_account as { public_id?: string })?.public_id ?? null,
    beneficiary_id: (tx.beneficiary as { public_id?: string })?.public_id ?? null,
    transaction_id: tx.public_id,
    amount_minor: amountMinor,
    currency: "ETB",
    attributes: {
      settlement_type: "ADMIN_MANUAL_RELEASE",
      completed_at: now.toISOString(),
    },
  });

  return { ok: true, status: "COMPLETED", transaction_id: tx.public_id };
}

/**
 * Returns customer transactions with TanStack Table filters and pagination.
 * Lazily settles due transfers. Emits ACCOUNT_VIEWED.
 */
export async function getCustomerTransactions(
  ctx: RequestContext,
  opts: { limit?: number; offset?: number; status?: string; search?: string } = {},
) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  // Lazy settlement
  await settleDueTransfers();

  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("id, public_id")
    .eq("user_id", ctx.user.id)
    .single();

  if (!account) return { transactions: [], total: 0 };

  // Emit ACCOUNT_VIEWED
  await emitSecurityEvent(ctx, "ACCOUNT_VIEWED", {
    result: "SUCCESS",
    account_id: account.public_id,
    attributes: { view: "TRANSACTIONS_LIST" },
  });

  let query = supabaseAdmin
    .from("transactions")
    .select("*, beneficiary:beneficiaries(public_id, name, account_number, bank_name)", { count: "exact" })
    .eq("from_account_id", account.id)
    .order("created_at", { ascending: false });

  if (opts.status && opts.status !== "ALL") {
    query = query.eq("status", opts.status);
  }

  if (opts.search) {
    query = query.ilike("note", `%${opts.search}%`);
  }

  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return {
    transactions: data ?? [],
    total: count ?? 0,
  };
}

/**
 * Returns single transaction detail with timeline and double-entry ledger.
 * Checks ownership: if accessed by another user, emits AUTHZ_DENIED with attempted_privilege=owner.
 */
export async function getTransactionDetail(ctx: RequestContext, transactionPublicId: string) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  await settleDueTransfers();

  const { data: tx } = await supabaseAdmin
    .from("transactions")
    .select("*, from_account:accounts!from_account_id(id, public_id, user_id), beneficiary:beneficiaries(public_id, name, account_number, bank_name)")
    .eq("public_id", transactionPublicId)
    .maybeSingle();

  if (!tx) {
    throw new TelemetryError("NOT_FOUND", "Transaction not found", 404);
  }

  // IDOR Ownership verification
  const isOwner = (tx.from_account as { user_id?: string })?.user_id === ctx.user.id;
  const isAdmin = ctx.roles.includes("admin");

  if (!isOwner && !isAdmin) {
    await emitSecurityEvent(ctx, "AUTHZ_DENIED", {
      result: "DENIED",
      transaction_id: tx.public_id,
      attributes: {
        reason: "WRONG_OWNER",
        attempted_privilege: "owner",
        required_role: "owner",
        actor_role: ctx.roles[0] ?? "customer",
        resource_ref: transactionPublicId,
      },
    });
    throw new TelemetryError("FORBIDDEN", "You do not have permission to view this transaction.", 403);
  }

  const { data: ledger } = await supabaseAdmin
    .from("ledger_entries")
    .select("*")
    .eq("transaction_id", tx.id)
    .order("created_at", { ascending: true });

  return {
    transaction: tx,
    ledger: ledger ?? [],
  };
}
