import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emitSecurityEvent, TelemetryError, type RequestContext } from "./telemetry.server";

export interface DepositInput {
  customerAccountId: string;
  amountEtb: number;
  channel?: string;
  reference?: string;
  note?: string;
}

export interface CustomerSummary {
  accountId: string;
  accountPublicId: string;
  accountNumber: string;
  balanceMinor: number;
  balanceEtb: number;
  currency: string;
  accountStatus: string;
  userId: string;
  userPublicId: string;
  fullName: string;
  email: string;
  phone: string | null;
  registeredAt: string;
}

/**
 * Verify employee or admin privilege.
 */
function assertStaffPrivilege(ctx: RequestContext) {
  if (!ctx.user) {
    throw new TelemetryError("UNAUTHENTICATED", "Sign in required to access Teller portal.", 401);
  }
  const hasStaffRole = ctx.roles.some((r) => r === "employee" || r === "admin");
  if (!hasStaffRole) {
    throw new TelemetryError("FORBIDDEN", "Access restricted to authorized HonorPay staff and administrators.", 403);
  }
}

/**
 * List all registered customer accounts with their personal profile and deposit balance.
 */
export async function listRegisteredCustomers(ctx: RequestContext): Promise<CustomerSummary[]> {
  assertStaffPrivilege(ctx);

  const { data: accounts, error: accError } = await supabaseAdmin
    .from("accounts")
    .select("id, public_id, account_number, balance_minor, currency, status, user_id, created_at")
    .eq("is_system", false)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false });

  if (accError) {
    throw new Error(`Failed to list customer accounts: ${accError.message}`);
  }

  if (!accounts || accounts.length === 0) return [];

  const validAccounts = accounts.filter((a) => !a.is_system && a.user_id);
  if (validAccounts.length === 0) return [];

  const userIds = validAccounts.map((a) => a.user_id).filter(Boolean);
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, public_id, user_id, full_name, email, phone, created_at")
    .in("user_id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  return validAccounts.map((acc) => {
    const prof = profileMap.get(acc.user_id);
    const balanceMinor = Number(acc.balance_minor ?? 0);
    return {
      accountId: acc.id,
      accountPublicId: acc.public_id,
      accountNumber: acc.account_number,
      balanceMinor,
      balanceEtb: balanceMinor / 100,
      currency: acc.currency || "ETB",
      accountStatus: acc.status || "ACTIVE",
      userId: acc.user_id,
      userPublicId: prof?.public_id ?? "U_UNKNOWN",
      fullName: prof?.full_name ?? "Unnamed Customer",
      email: prof?.email ?? "",
      phone: prof?.phone ?? null,
      registeredAt: prof?.created_at ?? acc.created_at,
    };
  });
}

/**
 * Search registered customers by query string (account number, phone, email, or name).
 */
export async function searchRegisteredCustomer(
  ctx: RequestContext,
  query: string,
): Promise<CustomerSummary | null> {
  const clean = query.trim().toLowerCase();
  if (!clean) return null;

  const cleanDigits = clean.replace(/\D/g, "");
  const corePhoneQ = cleanDigits.startsWith("251") ? cleanDigits.slice(3) : cleanDigits.startsWith("0") ? cleanDigits.slice(1) : cleanDigits;

  const customers = await listRegisteredCustomers(ctx);
  const match = customers.find((c) => {
    if (c.accountNumber.toLowerCase() === clean || c.accountNumber.toLowerCase().includes(clean)) return true;
    if (c.email.toLowerCase() === clean || c.email.toLowerCase().includes(clean)) return true;
    if (c.fullName.toLowerCase().includes(clean)) return true;
    if (c.accountPublicId.toLowerCase() === clean || c.userPublicId.toLowerCase() === clean) return true;

    if (c.phone) {
      const pLower = c.phone.toLowerCase();
      if (pLower.includes(clean)) return true;
      const pDigits = c.phone.replace(/\D/g, "");
      const corePDigits = pDigits.startsWith("251") ? pDigits.slice(3) : pDigits.startsWith("0") ? pDigits.slice(1) : pDigits;

      if (cleanDigits.length >= 3 && pDigits.includes(cleanDigits)) return true;
      if (corePhoneQ.length >= 3 && (corePDigits.includes(corePhoneQ) || corePhoneQ.includes(corePDigits))) return true;

      const localPhone = corePDigits.length === 9 ? `0${corePDigits}` : "";
      if (localPhone && (localPhone.includes(clean) || clean.includes(localPhone))) return true;
    }

    return false;
  });

  return match || null;
}

/**
 * Process a cash deposit into a registered customer's account.
 * Atomically credits customer balance, creates ledger CREDIT, and logs deposit transaction.
 */
export async function depositCustomerFunds(ctx: RequestContext, input: DepositInput) {
  assertStaffPrivilege(ctx);

  const amountEtb = Number(input.amountEtb);
  if (isNaN(amountEtb) || amountEtb <= 0) {
    throw new TelemetryError("INVALID_AMOUNT", "Deposit amount must be greater than zero.", 400);
  }

  const amountMinor = Math.round(amountEtb * 100);

  // 1. Fetch destination customer account
  const { data: customerAccount, error: accError } = await supabaseAdmin
    .from("accounts")
    .select("id, public_id, account_number, balance_minor, status, is_system, user_id, currency")
    .or(`id.eq.${input.customerAccountId},public_id.eq.${input.customerAccountId},account_number.eq.${input.customerAccountId}`)
    .maybeSingle();

  if (accError || !customerAccount) {
    throw new TelemetryError("ACCOUNT_NOT_FOUND", "Destination customer account not found.", 404);
  }

  if (customerAccount.is_system) {
    throw new TelemetryError("INVALID_ACCOUNT", "Deposits cannot be processed into system accounts.", 400);
  }

  if (customerAccount.status === "LOCKED") {
    throw new TelemetryError("ACCOUNT_LOCKED", "This customer account is currently LOCKED by security controls.", 403);
  }

  // 2. Fetch customer profile for receipt details
  const { data: customerProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, public_id, full_name, email, phone")
    .eq("user_id", customerAccount.user_id)
    .maybeSingle();

  // 3. Settlement / Central Cash Vault account
  const { data: settlementAcc } = await supabaseAdmin
    .from("accounts")
    .select("id, balance_minor, public_id")
    .eq("public_id", "ACC_SETTLEMENT")
    .maybeSingle();

  const now = new Date().toISOString();
  const balanceBeforeMinor = Number(customerAccount.balance_minor ?? 0);
  const balanceAfterMinor = balanceBeforeMinor + amountMinor;

  // 4. Update customer account balance
  const { error: updateErr } = await supabaseAdmin
    .from("accounts")
    .update({ balance_minor: balanceAfterMinor, updated_at: now })
    .eq("id", customerAccount.id);

  if (updateErr) {
    throw new TelemetryError("DEPOSIT_ERROR", `Failed to credit account: ${updateErr.message}`, 500);
  }

  // 5. Create transaction record
  const channel = input.channel || "BRANCH_TELLER";
  const refCode = input.reference || `OTC-${Math.floor(100000 + Math.random() * 900000)}`;
  const idempotencyKey = `dep-${ctx.user!.publicId}-${customerAccount.public_id}-${Date.now()}`;

  const depositNote =
    input.note?.trim() ||
    `Branch cash deposit (Ref: ${refCode}) via teller ${ctx.user!.email || ctx.user!.publicId}`;

  const { data: tx, error: txError } = await supabaseAdmin
    .from("transactions")
    .insert({
      from_account_id: settlementAcc?.id ?? null,
      to_account_id: customerAccount.id,
      amount_minor: amountMinor,
      currency: customerAccount.currency || "ETB",
      status: "COMPLETED",
      note: depositNote,
      idempotency_key: idempotencyKey,
      session_id: ctx.session?.id ?? null,
      device_id: ctx.device?.id ?? null,
      source_ip: ctx.ip,
      completed_at: now,
    })
    .select("*")
    .single();

  if (txError || !tx) {
    // Revert balance on failure
    await supabaseAdmin
      .from("accounts")
      .update({ balance_minor: balanceBeforeMinor, updated_at: now })
      .eq("id", customerAccount.id);
    throw new TelemetryError("TRANSACTION_FAILED", `Failed to record deposit transaction: ${txError?.message}`, 500);
  }

  // 6. Record Double-entry Ledger Entries
  // Customer CREDIT
  await supabaseAdmin.from("ledger_entries").insert({
    account_id: customerAccount.id,
    transaction_id: tx.id,
    direction: "CREDIT",
    amount_minor: amountMinor,
    balance_after_minor: balanceAfterMinor,
  });

  // Vault/Settlement DEBIT
  if (settlementAcc) {
    const settleBalAfter = Number(settlementAcc.balance_minor ?? 0) - amountMinor;
    await supabaseAdmin
      .from("accounts")
      .update({ balance_minor: settleBalAfter })
      .eq("id", settlementAcc.id);

    await supabaseAdmin.from("ledger_entries").insert({
      account_id: settlementAcc.id,
      transaction_id: tx.id,
      direction: "DEBIT",
      amount_minor: amountMinor,
      balance_after_minor: settleBalAfter,
    });
  }

  // 7. Emit Security Telemetry for ECS detection monitoring
  await emitSecurityEvent(ctx, "DEPOSIT_PROCESSED", {
    result: "SUCCESS",
    account_id: customerAccount.public_id,
    amount_minor: amountMinor,
    attributes: {
      teller_id: ctx.user!.publicId,
      teller_email: ctx.user!.email,
      customer_id: customerProfile?.public_id ?? "CUSTOMER",
      customer_name: customerProfile?.full_name ?? "HonorPay Customer",
      customer_account: customerAccount.account_number,
      channel,
      reference: refCode,
      balance_before_minor: balanceBeforeMinor,
      balance_after_minor: balanceAfterMinor,
      transaction_public_id: tx.public_id,
    },
  });

  return {
    success: true,
    receiptNumber: refCode,
    transactionId: tx.public_id,
    accountNumber: customerAccount.account_number,
    customerName: customerProfile?.full_name ?? "HonorPay Customer",
    depositAmountEtb: amountEtb,
    amountMinor,
    balanceBeforeEtb: balanceBeforeMinor / 100,
    balanceAfterEtb: balanceAfterMinor / 100,
    processedAt: now,
  };
}

/**
 * Fetch recent teller deposits for audit review and confirmation feed.
 */
export async function getRecentDeposits(ctx: RequestContext, limit = 20) {
  assertStaffPrivilege(ctx);

  const { data: txs, error } = await supabaseAdmin
    .from("transactions")
    .select("id, public_id, amount_minor, currency, status, note, completed_at, created_at, to_account_id")
    .not("to_account_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !txs) return [];

  // Filter or augment with account and customer info
  const accountIds = Array.from(new Set(txs.map((t) => t.to_account_id).filter(Boolean)));
  if (accountIds.length === 0) return [];

  const { data: accounts } = await supabaseAdmin
    .from("accounts")
    .select("id, account_number, user_id, public_id")
    .in("id", accountIds);

  const accMap = new Map((accounts ?? []).map((a) => [a.id, a]));
  const userIds = Array.from(new Set((accounts ?? []).map((a) => a.user_id).filter(Boolean)));

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, full_name, email, phone")
    .in("user_id", userIds);

  const profMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  return txs
    .filter((t) => t.note && t.note.toLowerCase().includes("deposit"))
    .map((t) => {
      const acc = accMap.get(t.to_account_id!);
      const prof = acc ? profMap.get(acc.user_id) : null;
      return {
        id: t.id,
        publicId: t.public_id,
        amountMinor: t.amount_minor,
        amountEtb: t.amount_minor / 100,
        currency: t.currency || "ETB",
        status: t.status,
        note: t.note,
        accountNumber: acc?.account_number ?? "Unknown",
        customerName: prof?.full_name ?? "Registered Customer",
        customerPhone: prof?.phone ?? null,
        completedAt: t.completed_at || t.created_at,
      };
    });
}

export interface RegisterCustomerByTellerInput {
  fullName: string;
  email: string;
  phone?: string | null;
  initialPassword?: string;
}

export interface RegisteredCustomerResult extends CustomerSummary {
  initialPassword?: string;
  mustChangePassword: boolean;
}

/**
 * Register a new customer at the branch by a teller.
 * Creates auth user, profile with must_change_password: true, customer role,
 * and standard 10-digit customer account (balance 0 ETB).
 */
export async function registerCustomerByTeller(
  ctx: RequestContext,
  data: RegisterCustomerByTellerInput,
): Promise<RegisteredCustomerResult> {
  assertStaffPrivilege(ctx);

  const fullName = data.fullName.trim();
  const email = data.email.trim().toLowerCase();
  const phone = data.phone?.trim() || null;
  const initialPassword = data.initialPassword?.trim() || "Welcome@2026";

  if (!fullName || fullName.length < 2) {
    throw new TelemetryError("VALIDATION_ERROR", "Customer full name must be at least 2 characters.", 400);
  }

  if (!email || !email.includes("@")) {
    throw new TelemetryError("VALIDATION_ERROR", "A valid email address is required.", 400);
  }

  if (initialPassword.length < 8) {
    throw new TelemetryError("VALIDATION_ERROR", "Initial password must be at least 8 characters.", 400);
  }

  // Check if profile exists
  const { data: existingProf } = await supabaseAdmin
    .from("profiles")
    .select("public_id")
    .eq("email", email)
    .maybeSingle();

  if (existingProf) {
    throw new TelemetryError("CUSTOMER_EXISTS", `A customer with email '${email}' is already registered.`, 409);
  }

  // Create auth user
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authErr || !authData?.user) {
    throw new TelemetryError("REGISTRATION_FAILED", authErr?.message || "Failed to create customer user.", 400);
  }

  const userId = authData.user.id;
  const now = new Date().toISOString();

  // Create profile with must_change_password: true
  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .insert({
      user_id: userId,
      email,
      full_name: fullName,
      phone,
      status: "ACTIVE",
      must_change_password: true,
    })
    .select("*")
    .single();

  if (profErr || !profile) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new TelemetryError("PROFILE_FAILED", `Failed to initialize customer profile: ${profErr?.message}`, 500);
  }

  // Assign customer role
  await supabaseAdmin.from("user_roles").insert({
    user_id: userId,
    role: "customer",
  });

  // Generate 10-digit account number starting with 1000
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const accountNumber = `1000${randomSuffix}`;
  const accountPublicId = `ACC_${Math.floor(1000 + Math.random() * 9000)}`;

  // Create active account with 0 balance
  const { data: account, error: accErr } = await supabaseAdmin
    .from("accounts")
    .insert({
      user_id: userId,
      public_id: accountPublicId,
      account_number: accountNumber,
      balance_minor: 0,
      currency: "ETB",
      daily_limit_minor: 50000000,
      per_tx_limit_minor: 25000000,
      status: "ACTIVE",
      is_system: false,
      opened_at: now,
    })
    .select("*")
    .single();

  if (accErr || !account) {
    throw new TelemetryError("ACCOUNT_FAILED", `Failed to open customer account: ${accErr?.message}`, 500);
  }

  // Emit security telemetry
  await emitSecurityEvent(ctx, "CUSTOMER_ONBOARDED", {
    result: "SUCCESS",
    user_id: profile.public_id,
    account_id: account.public_id,
    attributes: {
      registered_by_teller_id: ctx.user!.publicId,
      teller_email: ctx.user!.email,
      customer_email: email,
      customer_name: fullName,
      account_number: accountNumber,
      must_change_password: true,
    },
  });

  return {
    accountId: account.id,
    accountPublicId: account.public_id,
    accountNumber: account.account_number,
    balanceMinor: 0,
    balanceEtb: 0,
    currency: account.currency || "ETB",
    accountStatus: account.status || "ACTIVE",
    userId,
    userPublicId: profile.public_id,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone ?? null,
    registeredAt: profile.created_at,
    initialPassword,
    mustChangePassword: true,
  };
}
