import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emitSecurityEvent, TelemetryError, type RequestContext } from "./telemetry.server";
import { localAuthAdmin } from "@/integrations/supabase/local-store";
import { publicAuthClient } from "./auth.server";

export async function getBeneficiaries(ctx: RequestContext) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("id")
    .eq("user_id", ctx.user.id)
    .single();

  if (!account) return [];

  const { data, error } = await supabaseAdmin
    .from("beneficiaries")
    .select("*")
    .eq("account_id", account.id)
    .neq("status", "REMOVED")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addBeneficiary(
  ctx: RequestContext,
  data: {
    name: string;
    accountNumber: string;
    bankName: string;
    isInternal?: boolean;
    otpChallengeId?: string | null;
  },
) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  // Check Step-up requirement
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("step_up_until, last_login_at")
    .eq("user_id", ctx.user.id)
    .single();

  const isStepUpActive = !!profile?.step_up_until && new Date(profile.step_up_until).getTime() > Date.now();
  if (isStepUpActive) {
    if (!data.otpChallengeId) {
      await emitSecurityEvent(ctx, "STEP_UP_REQUIRED", {
        result: "PENDING",
        attributes: { reason: "STEP_UP_ACTIVE", action: "ADD_BENEFICIARY" },
      });
      throw new TelemetryError("STEP_UP_REQUIRED", "Step-up verification required. Please enter security code.", 403);
    }
    const { data: challenge } = await supabaseAdmin
      .from("otp_challenges")
      .select("status")
      .eq("id", data.otpChallengeId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();

    if (!challenge || challenge.status !== "VERIFIED") {
      throw new TelemetryError("STEP_UP_UNVERIFIED", "Please verify security code first.", 403);
    }
  }

  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("id, public_id, opened_at")
    .eq("user_id", ctx.user.id)
    .single();

  if (!account) throw new TelemetryError("ACCOUNT_NOT_FOUND", "Account not found", 404);

  const { data: ben, error } = await supabaseAdmin
    .from("beneficiaries")
    .insert({
      account_id: account.id,
      name: data.name.trim(),
      account_number: data.accountNumber.trim(),
      bank_name: data.bankName.trim(),
      is_internal: data.isInternal ?? false,
      status: "ACTIVE",
    })
    .select("*")
    .single();

  if (error || !ben) {
    throw new TelemetryError("BENEFICIARY_ERROR", `Failed to add beneficiary: ${error?.message}`, 500);
  }

  // Enrichment calculation (§8)
  const now = Date.now();
  const [{ count: benCount }, { data: dev }] = await Promise.all([
    supabaseAdmin.from("beneficiaries").select("id", { count: "exact", head: true }).eq("account_id", account.id).neq("status", "REMOVED"),
    ctx.device ? supabaseAdmin.from("target_devices").select("first_seen_at").eq("id", ctx.device.id).maybeSingle() : { data: null },
  ]);

  const accountAgeDays = Math.max(0, Math.round((now - new Date(account.opened_at).getTime()) / (86400 * 1000)));
  const secondsSinceLogin = profile?.last_login_at ? Math.max(0, Math.round((now - new Date(profile.last_login_at).getTime()) / 1000)) : 0;
  const secondsSinceDeviceReg = dev?.data?.first_seen_at ? Math.max(0, Math.round((now - new Date(dev.data.first_seen_at).getTime()) / 1000)) : 0;

  await emitSecurityEvent(ctx, "BENEFICIARY_CREATED", {
    result: "SUCCESS",
    account_id: account.public_id,
    beneficiary_id: ben.public_id,
    attributes: {
      beneficiary_count: benCount ?? 1,
      account_age_days: accountAgeDays,
      seconds_since_login: secondsSinceLogin,
      seconds_since_device_registered: secondsSinceDeviceReg,
      bank_name: ben.bank_name,
      is_internal: ben.is_internal,
    },
  });

  return ben;
}

export async function removeBeneficiary(ctx: RequestContext, beneficiaryPublicId: string) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("id, public_id")
    .eq("user_id", ctx.user.id)
    .single();

  if (!account) throw new TelemetryError("ACCOUNT_NOT_FOUND", "Account not found", 404);

  const { data: ben } = await supabaseAdmin
    .from("beneficiaries")
    .select("id, public_id")
    .eq("public_id", beneficiaryPublicId)
    .eq("account_id", account.id)
    .maybeSingle();

  if (!ben) throw new TelemetryError("NOT_FOUND", "Beneficiary not found", 404);

  await supabaseAdmin
    .from("beneficiaries")
    .update({ status: "REMOVED" })
    .eq("id", ben.id);

  await emitSecurityEvent(ctx, "BENEFICIARY_REMOVED", {
    result: "SUCCESS",
    account_id: account.public_id,
    beneficiary_id: ben.public_id,
  });

  return { ok: true };
}

export async function getDevices(ctx: RequestContext) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const { data } = await supabaseAdmin
    .from("target_devices")
    .select("*")
    .eq("user_id", ctx.user.id)
    .neq("status", "REMOVED")
    .order("last_seen_at", { ascending: false });

  return data ?? [];
}

export async function registerDevice(ctx: RequestContext, label: string) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const fp = ctx.fingerprintHash ?? `manual-fp-${crypto.randomUUID()}`;
  const { data: device, error } = await supabaseAdmin
    .from("target_devices")
    .insert({
      user_id: ctx.user.id,
      fingerprint_hash: fp,
      label: label.trim(),
      user_agent: ctx.userAgent,
      trusted: true,
      status: "ACTIVE",
    })
    .select("*")
    .single();

  if (error || !device) {
    throw new TelemetryError("DEVICE_ERROR", `Failed to register device: ${error?.message}`, 500);
  }

  const { count } = await supabaseAdmin
    .from("target_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .eq("status", "ACTIVE");

  await emitSecurityEvent(ctx, "DEVICE_REGISTERED", {
    result: "SUCCESS",
    device_id: device.public_id,
    attributes: {
      trusted: true,
      user_device_count: count ?? 1,
      other_accounts_seen_on_device: 0,
      device_first_seen_at: device.first_seen_at,
    },
  });

  return device;
}

export async function removeDevice(ctx: RequestContext, devicePublicId: string) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const { data: dev } = await supabaseAdmin
    .from("target_devices")
    .select("id, public_id")
    .eq("public_id", devicePublicId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (!dev) throw new TelemetryError("NOT_FOUND", "Device not found", 404);

  await supabaseAdmin
    .from("target_devices")
    .update({ status: "REMOVED" })
    .eq("id", dev.id);

  await emitSecurityEvent(ctx, "DEVICE_REMOVED", {
    result: "SUCCESS",
    device_id: dev.public_id,
  });

  return { ok: true };
}

export async function getSessions(ctx: RequestContext) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const { data } = await supabaseAdmin
    .from("target_sessions")
    .select("*, device:target_devices(label, fingerprint_hash, trusted)")
    .eq("user_id", ctx.user.id)
    .order("last_seen_at", { ascending: false });

  await emitSecurityEvent(ctx, "SESSION_VIEWED", {
    result: "SUCCESS",
    attributes: { session_count: data?.length ?? 0 },
  });

  return data ?? [];
}

export async function revokeCustomerSession(ctx: RequestContext, sessionPublicId: string) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const { data: sess } = await supabaseAdmin
    .from("target_sessions")
    .select("id, public_id, status")
    .eq("public_id", sessionPublicId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (!sess) throw new TelemetryError("NOT_FOUND", "Session not found", 404);

  await supabaseAdmin
    .from("target_sessions")
    .update({
      status: "REVOKED",
      revoked_by: "SELF",
      revoked_reason: "Customer revoked from security center",
    })
    .eq("id", sess.id);

  await emitSecurityEvent(ctx, "SESSION_REVOKED", {
    result: "SUCCESS",
    session_id: sess.public_id,
    attributes: {
      revoked_by: "SELF",
      revoked_reason: "Customer initiated revocation",
      session_id_revoked: sess.public_id,
    },
  });

  return { ok: true };
}

export async function getProfileDetails(ctx: RequestContext) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const [{ data: prof }, { data: account }] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("user_id", ctx.user.id).single(),
    supabaseAdmin.from("accounts").select("*").eq("user_id", ctx.user.id).single(),
  ]);

  await emitSecurityEvent(ctx, "PROFILE_VIEWED", {
    result: "SUCCESS",
    attributes: { view: "SECURITY_PROFILE" },
  });

  return {
    profile: prof,
    account,
    roles: ctx.roles,
  };
}

export async function updateCustomerProfile(
  ctx: RequestContext,
  data: { fullName?: string; phone?: string; otpChallengeId?: string | null },
) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("user_id", ctx.user.id)
    .single();

  if (!prof) throw new TelemetryError("NOT_FOUND", "Profile not found", 404);

  const isStepUpActive = !!prof.step_up_until && new Date(prof.step_up_until).getTime() > Date.now();
  if (isStepUpActive) {
    if (!data.otpChallengeId) {
      await emitSecurityEvent(ctx, "STEP_UP_REQUIRED", {
        result: "PENDING",
        attributes: { reason: "STEP_UP_ACTIVE", action: "PROFILE_CHANGE" },
      });
      throw new TelemetryError("STEP_UP_REQUIRED", "Step-up verification required.", 403);
    }
  }

  const updates: Record<string, string> = {};
  const changedFields: string[] = [];

  if (data.fullName && data.fullName.trim() !== prof.full_name) {
    updates["full_name"] = data.fullName.trim();
    changedFields.push("full_name");
  }
  if (data.phone !== undefined && data.phone !== prof.phone) {
    updates["phone"] = data.phone?.trim() ?? "";
    changedFields.push("phone");
  }

  if (changedFields.length > 0) {
    await supabaseAdmin.from("profiles").update(updates).eq("user_id", ctx.user.id);

    const now = Date.now();
    const secondsSinceLogin = prof.last_login_at
      ? Math.max(0, Math.round((now - new Date(prof.last_login_at).getTime()) / 1000))
      : 0;

    await emitSecurityEvent(ctx, "PROFILE_CHANGED", {
      result: "SUCCESS",
      attributes: {
        changed_fields: changedFields,
        seconds_since_login: secondsSinceLogin,
        device_known: !!ctx.device,
      },
    });
  }

  return { ok: true, changedFields };
}

export async function changeCustomerPassword(
  ctx: RequestContext,
  data: { currentPassword: string; newPassword: string; otpChallengeId?: string | null },
) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("last_login_at, step_up_until")
    .eq("user_id", ctx.user.id)
    .single();

  const isStepUpActive = !!prof?.step_up_until && new Date(prof.step_up_until).getTime() > Date.now();
  if (isStepUpActive && !data.otpChallengeId) {
    await emitSecurityEvent(ctx, "STEP_UP_REQUIRED", {
      result: "PENDING",
      attributes: { reason: "STEP_UP_ACTIVE", action: "PASSWORD_CHANGE" },
    });
    throw new TelemetryError("STEP_UP_REQUIRED", "Step-up verification required.", 403);
  }

  // Update password in Supabase Auth
  const { error } = await supabaseAdmin.auth.admin.updateUserById(ctx.user.id, {
    password: data.newPassword,
  });

  if (error) {
    throw new TelemetryError("PASSWORD_UPDATE_FAILED", error.message, 400);
  }

  // Clear mandatory password change flag
  await supabaseAdmin
    .from("profiles")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id);

  const now = Date.now();
  const secondsSinceLogin = prof?.last_login_at
    ? Math.max(0, Math.round((now - new Date(prof.last_login_at).getTime()) / 1000))
    : 0;

  await emitSecurityEvent(ctx, "PASSWORD_CHANGED", {
    result: "SUCCESS",
    attributes: {
      changed_fields: ["password"],
      seconds_since_login: secondsSinceLogin,
      device_known: !!ctx.device,
    },
  });

  return { ok: true };
}

/**
 * Force password change on first customer login.
 * Validates current temporary password, sets new password, clears must_change_password flag.
 */
export async function forceChangePassword(
  ctx: RequestContext,
  data: { currentPassword: string; newPassword: string },
) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  if (!data.newPassword || data.newPassword.length < 8) {
    throw new TelemetryError("WEAK_PASSWORD", "New password must be at least 8 characters long.", 400);
  }

  if (data.newPassword === data.currentPassword) {
    throw new TelemetryError("SAME_PASSWORD", "New password must be different from current password.", 400);
  }

  // Verify current password
  let verified = false;
  try {
    const { data: auth, error } = await publicAuthClient().auth.signInWithPassword({
      email: ctx.user.email,
      password: data.currentPassword,
    });
    if (!error && auth?.user) verified = true;
  } catch {
    // fallback
  }

  if (!verified) {
    const localRes = await localAuthAdmin.signInWithPassword({
      email: ctx.user.email,
      password: data.currentPassword,
    });
    if (localRes.data?.user) verified = true;
  }

  // Also accept Welcome@2026 or DEMO_PASSWORD if customer is in must_change_password state
  if (!verified) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("must_change_password")
      .eq("user_id", ctx.user.id)
      .maybeSingle();

    if (prof?.must_change_password && (data.currentPassword === "Welcome@2026" || data.currentPassword === "Testbed#2026")) {
      verified = true;
    }
  }

  if (!verified) {
    throw new TelemetryError("INVALID_PASSWORD", "Current temporary password is incorrect.", 400);
  }

  // Update password in auth admin
  const { error } = await supabaseAdmin.auth.admin.updateUserById(ctx.user.id, {
    password: data.newPassword,
  });

  if (error) {
    throw new TelemetryError("PASSWORD_UPDATE_FAILED", error.message, 400);
  }

  // Clear mandatory password change flag
  await supabaseAdmin
    .from("profiles")
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id);

  // In local testbed mode, explicitly ensure memory store and dump file are updated
  try {
    const { localDb } = await import("@/integrations/supabase/local-store");
    const uIdx = localDb.users.findIndex((u) => u.id === ctx.user!.id || u.email === ctx.user!.email);
    if (uIdx >= 0) {
      localDb.users[uIdx]!.passwordHash = data.newPassword;
    }
    for (const p of localDb.tables["profiles"] || []) {
      if (p.user_id === ctx.user!.id || (ctx.user!.email && p.email === ctx.user!.email) || (ctx.user!.publicId && p.public_id === ctx.user!.publicId)) {
        p.must_change_password = false;
        p.updated_at = new Date().toISOString();
      }
    }
    localDb.save();
  } catch {
    // ignore
  }

  // Create or refresh an active session with valid tokens to avoid session invalidation on password change
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let sessionPublicId: string | null = ctx.session?.publicId ?? null;

  try {
    const { createMockJwt } = await import("@/integrations/supabase/local-store");
    const tokens = createMockJwt({
      id: ctx.user.id,
      email: ctx.user.email,
      fullName: ctx.user.publicId,
    });
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  } catch {
    // fallback
  }

  if (!sessionPublicId) {
    const { data: sess } = await supabaseAdmin
      .from("target_sessions")
      .select("public_id")
      .eq("user_id", ctx.user.id)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    sessionPublicId = sess?.public_id ?? null;
  }

  if (!sessionPublicId) {
    const { data: newSess } = await supabaseAdmin
      .from("target_sessions")
      .insert({
        user_id: ctx.user.id,
        device_id: ctx.device?.id ?? null,
        source_ip: ctx.ip,
        user_agent: ctx.userAgent,
        status: "ACTIVE",
      })
      .select("*")
      .single();
    sessionPublicId = newSess?.public_id ?? null;
  }

  await emitSecurityEvent(ctx, "PASSWORD_CHANGED", {
    result: "SUCCESS",
    attributes: {
      action: "FORCE_CHANGE_FIRST_LOGIN",
      changed_fields: ["password"],
      device_known: !!ctx.device,
    },
  });

  return {
    ok: true,
    userId: ctx.user.id,
    userPublicId: ctx.user.publicId,
    email: ctx.user.email,
    mustChangePassword: false,
    access_token: accessToken,
    refresh_token: refreshToken,
    sessionPublicId,
    message: "Password updated successfully.",
  };
}

/**
 * Lookup registered recipient by 10-digit account number or registered phone number.
 * Used for live recipient identity verification in mobile banking transfer flow.
 */
export async function lookupRegisteredRecipient(
  ctx: RequestContext,
  query: string,
) {
  if (!ctx.user) throw new TelemetryError("UNAUTHENTICATED", "Sign in required", 401);

  const clean = query.trim();
  if (!clean || clean.length < 2) {
    return { found: false, error: "Please enter an account number, name, or phone number" };
  }
  const cleanNoSpace = clean.replace(/[\s-]/g, "");

  // 1. Try matching account number
  const { data: byAcc } = await supabaseAdmin
    .from("accounts")
    .select("id, public_id, account_number, user_id, status, is_system")
    .eq("account_number", cleanNoSpace)
    .eq("is_system", false)
    .maybeSingle();

  let targetAccount = byAcc;

  // 2. If not found by account number, try searching profiles by phone, name, or email
  if (!targetAccount) {
    const cleanDigits = cleanNoSpace.replace(/\D/g, "");
    const core = cleanDigits.startsWith("251") ? cleanDigits.slice(3) : cleanDigits.startsWith("0") ? cleanDigits.slice(1) : cleanDigits;
    const pIntl = `+251${core}`;
    const pLocal = `0${core}`;

    let orClause = `email.eq.${clean.toLowerCase()}`;
    if (cleanDigits.length >= 3) {
      orClause += `,phone.eq.${pIntl},phone.eq.${pLocal},phone.eq.${cleanNoSpace},phone.eq.+${cleanDigits}`;
    }
    if (clean.length >= 2 && !/^\d+$/.test(clean)) {
      orClause += `,full_name.ilike.%${clean}%`;
    }

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, phone, email, full_name")
      .or(orClause)
      .limit(1);

    if (profs && profs.length > 0 && profs[0]?.user_id) {
      const { data: acc } = await supabaseAdmin
        .from("accounts")
        .select("id, public_id, account_number, user_id, status, is_system")
        .eq("user_id", profs[0].user_id)
        .eq("is_system", false)
        .maybeSingle();
      if (acc) {
        targetAccount = acc;
      }
    }
  }

  if (!targetAccount || targetAccount.is_system || !targetAccount.user_id) {
    return {
      found: false,
      error: "Recipient is not registered with HonorPay. Mobile transfers can only be made to registered users.",
    };
  }

  if (targetAccount.user_id === ctx.user.id) {
    return {
      found: false,
      isSelf: true,
      error: "You cannot transfer funds to your own account.",
    };
  }

  // Fetch verified profile details
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("full_name, phone, public_id")
    .eq("user_id", targetAccount.user_id)
    .maybeSingle();

  const phoneStr = prof?.phone ?? "";
  const maskedPhone = phoneStr.length > 4 ? `${phoneStr.slice(0, 4)}••••${phoneStr.slice(-2)}` : phoneStr;

  return {
    found: true,
    accountId: targetAccount.id,
    accountNumber: targetAccount.account_number,
    accountPublicId: targetAccount.public_id,
    fullName: prof?.full_name ?? "HonorPay Customer",
    maskedPhone,
    status: targetAccount.status,
  };
}
