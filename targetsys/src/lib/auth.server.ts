import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emitSecurityEvent, type RequestContext } from "./telemetry.server";
import { localAuthAdmin } from "@/integrations/supabase/local-store";

export function publicAuthClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type LoginResult =
  | {
      ok: true;
      access_token: string;
      refresh_token: string;
      sessionPublicId: string;
      roles: string[];
      mustChangePassword?: boolean;
    }
  | { ok: false; error: string; requiresOtp?: boolean; challengeId?: string };

async function ipStats(ip: string | null) {
  if (!ip) return { failures: 0, distinct: 0 };
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("security_events")
    .select("attributes")
    .eq("event_type", "LOGIN_FAILED")
    .eq("source_ip", ip)
    .gte("occurred_at", since)
    .limit(1000);
  const ids = new Set((data ?? []).map((r) => (r.attributes as { identifier?: string })?.identifier));
  return { failures: data?.length ?? 0, distinct: ids.size };
}

export async function performLogin(
  ctx: RequestContext,
  rawEmail: string,
  password: string,
  otpChallengeId?: string | null,
  otpCode?: string | null,
): Promise<LoginResult> {
  const input = rawEmail.trim();
  let identifier = input.toLowerCase();
  const generic = "Incorrect email or password.";
  const { data: posture } = await supabaseAdmin.from("security_posture").select("*").eq("id", 1).single();

  // 1. Direct profile lookup by email
  let { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("email", identifier).maybeSingle();

  // 2. If not found by email, check if input is a 10-digit account number
  if (!profile) {
    const { data: acc } = await supabaseAdmin
      .from("accounts")
      .select("user_id")
      .eq("account_number", input)
      .maybeSingle();
    if (acc?.user_id) {
      const { data: p } = await supabaseAdmin.from("profiles").select("*").eq("user_id", acc.user_id).maybeSingle();
      if (p) {
        profile = p;
        identifier = p.email;
      }
    }
  }

  // 3. If not found, check if input is an Ethiopian phone number (e.g. starting with 09, +251, 251, or 9...)
  if (!profile) {
    const digits = input.replace(/\D/g, "");
    if (digits.length >= 9) {
      const core = digits.startsWith("251") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
      const intl = `+251${core}`;
      const local = `0${core}`;

      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .or(`phone.eq.${intl},phone.eq.${local},phone.eq.${input},phone.eq.+${digits}`);
      if (profs && profs.length > 0 && profs[0]) {
        profile = profs[0];
        identifier = profs[0].email;
      } else {
        // Fallback: check all profiles for matching normalized phone digits
        const { data: allProfs } = await supabaseAdmin.from("profiles").select("*");
        if (allProfs) {
          const match = allProfs.find((p: any) => {
            if (!p.phone) return false;
            const pDig = p.phone.replace(/\D/g, "");
            return pDig === digits || pDig.endsWith(core) || digits.endsWith(pDig);
          });
          if (match) {
            profile = match;
            identifier = match.email;
          }
        }
      }
    }
  }

  let deviceKnown = false;
  if (profile && ctx.fingerprintHash) {
    const { data: d } = await supabaseAdmin
      .from("target_devices")
      .select("id")
      .eq("user_id", profile.user_id)
      .eq("fingerprint_hash", ctx.fingerprintHash)
      .eq("status", "ACTIVE")
      .maybeSingle();
    deviceKnown = !!d;
  }

  const fail = async (reason: "UNKNOWN_USER" | "BAD_PASSWORD" | "ACCOUNT_LOCKED", consecutive: number) => {
    const s = await ipStats(ctx.ip);
    await emitSecurityEvent(ctx, "LOGIN_FAILED", {
      result: "FAILURE",
      user_id: profile?.public_id ?? null,
      session_id: null,
      device_id: null,
      attributes: {
        identifier,
        failure_reason: reason,
        consecutive_failures_for_identifier: consecutive,
        failures_last_60s_for_ip: s.failures + 1,
        distinct_identifiers_last_60s_for_ip: s.distinct + (s.failures === 0 ? 1 : 0),
        user_agent: ctx.userAgent,
        device_known: deviceKnown,
      },
    });
  };

  // Account locked?
  if (profile && (profile.status === "LOCKED" || (profile.locked_until && new Date(profile.locked_until) > new Date()))) {
    await fail("ACCOUNT_LOCKED", profile.failed_login_count);
    return { ok: false, error: "This account is temporarily locked. Contact support." };
  }

  let authUser: any = null;
  let authSession: any = null;

  try {
    const { data: auth, error } = await publicAuthClient().auth.signInWithPassword({ email: identifier, password });
    if (!error && auth?.session && auth?.user) {
      authUser = auth.user;
      authSession = auth.session;
    }
  } catch {
    // If publicAuthClient network call fails or throws, fall through to localAuthAdmin
  }

  if (!authUser || !authSession) {
    const localRes = await localAuthAdmin.signInWithPassword({ email: identifier, password });
    if (localRes.data?.user && localRes.data?.session) {
      authUser = localRes.data.user;
      authSession = localRes.data.session;
    }
  }

  if (!authUser || !authSession) {
    if (!profile) {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await supabaseAdmin
        .from("security_events")
        .select("event_id", { count: "exact", head: true })
        .eq("event_type", "LOGIN_FAILED")
        .eq("attributes->>identifier", identifier)
        .gte("occurred_at", since);
      await fail("UNKNOWN_USER", (count ?? 0) + 1);
      return { ok: false, error: generic };
    }
    const consecutive = profile.failed_login_count + 1;
    const update: Database["public"]["Tables"]["profiles"]["Update"] = {
      failed_login_count: consecutive,
      last_failed_login_at: new Date().toISOString(),
    };
    const shouldLock = !!posture?.lockout_enabled && consecutive >= (posture?.lockout_threshold ?? 5);
    if (shouldLock) update.locked_until = new Date(Date.now() + 15 * 60_000).toISOString();
    await supabaseAdmin.from("profiles").update(update).eq("user_id", profile.user_id);
    await fail("BAD_PASSWORD", consecutive);
    if (shouldLock) {
      await emitSecurityEvent(ctx, "ACCOUNT_LOCKED", {
        result: "SUCCESS",
        user_id: profile.public_id,
        attributes: { reason: "LOCKOUT_THRESHOLD", consecutive_failures: consecutive, locked_minutes: 15 },
      });
    }
    return { ok: false, error: generic };
  }

  // ===== Success =====
  const userId = authUser.id;
  const { data: prof } = await supabaseAdmin.from("profiles").select("*").eq("user_id", userId).single();
  if (!prof) return { ok: false, error: generic };
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  ctx.user = { id: userId, publicId: prof.public_id, email: prof.email };
  ctx.roles = (roles ?? []).map((r) => r.role);

  // Device
  const fp = ctx.fingerprintHash ?? `nofp-${crypto.randomUUID()}`;
  let { data: device } = await supabaseAdmin
    .from("target_devices")
    .select("*")
    .eq("user_id", userId)
    .eq("fingerprint_hash", fp)
    .eq("status", "ACTIVE")
    .maybeSingle();
  const newDevice = !device;

  if (newDevice && posture?.new_device_requires_otp) {
    if (!otpChallengeId || !otpCode) {
      const { createOtpChallenge } = await import("./otp.server");
      const ch = await createOtpChallenge(ctx, "LOGIN_NEW_DEVICE");
      return {
        ok: false,
        requiresOtp: true,
        challengeId: ch.challengeId,
        error: "New device detected. Verification code required.",
      };
    } else {
      const { verifyOtpChallenge } = await import("./otp.server");
      const v = await verifyOtpChallenge(ctx, otpChallengeId, otpCode);
      if (!v.ok) {
        return {
          ok: false,
          requiresOtp: true,
          challengeId: otpChallengeId,
          error: v.error ?? "Invalid verification code.",
        };
      }
    }
  }

  if (!device) {
    const { data: created } = await supabaseAdmin
      .from("target_devices")
      .insert({ user_id: userId, fingerprint_hash: fp, user_agent: ctx.userAgent, label: deviceLabel(ctx.userAgent) })
      .select("*")
      .single();
    device = created!;
    const [{ count: userDeviceCount }, { data: sameFp }] = await Promise.all([
      supabaseAdmin.from("target_devices").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "ACTIVE"),
      supabaseAdmin.from("target_devices").select("user_id,first_seen_at").eq("fingerprint_hash", fp),
    ]);
    const others = new Set((sameFp ?? []).map((r) => r.user_id).filter((u) => u !== userId));
    const firstSeen = (sameFp ?? []).map((r) => r.first_seen_at).sort()[0] ?? device.first_seen_at;
    ctx.device = { id: device.id, publicId: device.public_id };
    await emitSecurityEvent(ctx, "DEVICE_REGISTERED", {
      result: "SUCCESS",
      session_id: null,
      attributes: {
        trusted: device.trusted,
        user_device_count: userDeviceCount ?? 1,
        other_accounts_seen_on_device: others.size,
        device_first_seen_at: firstSeen,
      },
    });
  } else {
    await supabaseAdmin.from("target_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  }
  ctx.device = { id: device.id, publicId: device.public_id };

  // Previous session (for ip change)
  const { data: prevSession } = await supabaseAdmin
    .from("target_sessions")
    .select("source_ip")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: session } = await supabaseAdmin
    .from("target_sessions")
    .insert({
      user_id: userId,
      device_id: device.id,
      source_ip: ctx.ip,
      user_agent: ctx.userAgent,
      status: "ACTIVE",
    })
    .select("*")
    .single();
  ctx.session = { id: session!.id, publicId: session!.public_id, status: "ACTIVE" };

  const lastFail = prof.last_failed_login_at ? new Date(prof.last_failed_login_at).getTime() : null;
  await emitSecurityEvent(ctx, "LOGIN_SUCCESS", {
    result: "SUCCESS",
    attributes: {
      new_device: newDevice,
      failed_attempts_since_last_success: prof.failed_login_count,
      seconds_since_last_failure: lastFail ? Math.round((Date.now() - lastFail) / 1000) : null,
      previous_login_at: prof.last_login_at,
      user_agent: ctx.userAgent,
    },
  });
  await emitSecurityEvent(ctx, "SESSION_CREATED", {
    result: "SUCCESS",
    attributes: {
      device_known: !newDevice,
      ip_changed_from_last_session: prevSession ? prevSession.source_ip !== ctx.ip : false,
      session_age_seconds: 0,
    },
  });
  await supabaseAdmin
    .from("profiles")
    .update({ failed_login_count: 0, last_login_at: new Date().toISOString() })
    .eq("user_id", userId);

  const { data: latestProf } = await supabaseAdmin
    .from("profiles")
    .select("must_change_password")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    ok: true,
    access_token: authSession.access_token,
    refresh_token: authSession.refresh_token,
    sessionPublicId: session!.public_id,
    roles: ctx.roles,
    mustChangePassword: latestProf ? !!latestProf.must_change_password : !!prof.must_change_password,
  };
}

export function deviceLabel(ua: string) {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Mac/i.test(ua) ? "macOS" : /Windows/i.test(ua) ? "Windows" : /Linux/i.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

export type RegisterResult =
  | {
      ok: true;
      access_token: string;
      refresh_token: string;
      sessionPublicId: string;
      roles: string[];
      user: { publicId: string; email: string; fullName: string };
    }
  | { ok: false; error: string };

/**
 * registerCustomer: creates user, profile, customer role, active account (balance 0),
 * first device, and first session. Emits DEVICE_REGISTERED and SESSION_CREATED.
 */
export async function registerCustomer(
  ctx: RequestContext,
  data: { email: string; password: string; fullName: string; phone?: string | null | undefined },
): Promise<RegisterResult> {
  const identifier = data.email.trim().toLowerCase();

  // Check if profile already exists with this email
  const { data: existingProf } = await supabaseAdmin
    .from("profiles")
    .select("public_id")
    .eq("email", identifier)
    .maybeSingle();

  if (existingProf) {
    return { ok: false, error: "An account with this email address already exists." };
  }

  // Create auth user in Supabase Auth (or local store)
  let createdUser: any = null;
  try {
    const { data: authRes, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: identifier,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (!authError && authRes?.user) {
      createdUser = authRes.user;
    }
  } catch {
    // fall through to localAuthAdmin
  }

  if (!createdUser) {
    const localRes = await localAuthAdmin.admin.createUser({
      email: identifier,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (localRes.data?.user) {
      createdUser = localRes.data.user;
    } else {
      return { ok: false, error: localRes.error?.message ?? "Failed to create user account." };
    }
  }

  const userId = createdUser.id;

  // Insert profile row
  const { data: prof, error: profError } = await supabaseAdmin
    .from("profiles")
    .insert({
      user_id: userId,
      email: identifier,
      full_name: data.fullName.trim(),
      phone: data.phone?.trim() ?? null,
      status: "ACTIVE",
      failed_login_count: 0,
      last_login_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (profError || !prof) {
    return { ok: false, error: "Failed to initialize customer profile." };
  }

  // Insert customer role
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "customer" });

  // Insert active ETB account (balance 0)
  await supabaseAdmin.from("accounts").insert({
    user_id: userId,
    balance_minor: 0,
    currency: "ETB",
    status: "ACTIVE",
    is_system: false,
    daily_limit_minor: 50000000,
    per_tx_limit_minor: 50000000,
  });

  ctx.user = { id: userId, publicId: prof.public_id, email: prof.email };
  ctx.roles = ["customer"];

  // Create initial device
  const fp = ctx.fingerprintHash ?? `nofp-${crypto.randomUUID()}`;
  const { data: device } = await supabaseAdmin
    .from("target_devices")
    .insert({
      user_id: userId,
      fingerprint_hash: fp,
      user_agent: ctx.userAgent,
      label: deviceLabel(ctx.userAgent),
      trusted: true,
      status: "ACTIVE",
    })
    .select("*")
    .single();

  ctx.device = { id: device!.id, publicId: device!.public_id };

  // Emit DEVICE_REGISTERED
  await emitSecurityEvent(ctx, "DEVICE_REGISTERED", {
    result: "SUCCESS",
    session_id: null,
    attributes: {
      trusted: device!.trusted,
      user_device_count: 1,
      other_accounts_seen_on_device: 0,
      device_first_seen_at: device!.first_seen_at,
    },
  });

  // Create initial target session
  const { data: session } = await supabaseAdmin
    .from("target_sessions")
    .insert({
      user_id: userId,
      device_id: device!.id,
      source_ip: ctx.ip,
      user_agent: ctx.userAgent,
      status: "ACTIVE",
    })
    .select("*")
    .single();

  ctx.session = { id: session!.id, publicId: session!.public_id, status: "ACTIVE" };

  // Emit SESSION_CREATED
  await emitSecurityEvent(ctx, "SESSION_CREATED", {
    result: "SUCCESS",
    attributes: {
      device_known: true,
      ip_changed_from_last_session: false,
      session_age_seconds: 0,
    },
  });

  // Sign in to produce client auth tokens
  let accessTok = "";
  let refreshTok = "";
  try {
    const { data: authSession } = await publicAuthClient().auth.signInWithPassword({
      email: identifier,
      password: data.password,
    });
    if (authSession?.session) {
      accessTok = authSession.session.access_token;
      refreshTok = authSession.session.refresh_token;
    }
  } catch {
    // fall through to localAuthAdmin
  }

  if (!accessTok) {
    const localSign = await localAuthAdmin.signInWithPassword({
      email: identifier,
      password: data.password,
    });
    accessTok = localSign.data?.session?.access_token ?? "";
    refreshTok = localSign.data?.session?.refresh_token ?? "";
  }

  return {
    ok: true,
    access_token: accessTok,
    refresh_token: refreshTok,
    sessionPublicId: session!.public_id,
    roles: ["customer"],
    user: {
      publicId: prof.public_id,
      email: prof.email,
      fullName: prof.full_name,
    },
  };
}

/**
 * logoutUser: marks target_session LOGGED_OUT and emits LOGOUT event.
 */
export async function logoutUser(ctx: RequestContext) {
  if (ctx.session) {
    await supabaseAdmin
      .from("target_sessions")
      .update({ status: "LOGGED_OUT" })
      .eq("id", ctx.session.id);
  }

  await emitSecurityEvent(ctx, "LOGOUT", {
    result: "SUCCESS",
    user_id: ctx.user?.publicId ?? null,
    session_id: ctx.session?.publicId ?? null,
    device_id: ctx.device?.publicId ?? null,
    attributes: {
      session_id: ctx.session?.publicId ?? null,
      user_id: ctx.user?.publicId ?? null,
    },
  });

  return { ok: true };
}

/**
 * checkAdminAccess: verifies admin role.
 * If customer visits: emits AUTHZ_DENIED with attempted_privilege=admin and returns redirect=/app.
 * If unauthenticated: emits AUTHZ_DENIED with attempted_privilege=admin and returns redirect=/login.
 */
export async function checkAdminAccess(ctx: RequestContext) {
  if (!ctx.user) {
    await emitSecurityEvent(ctx, "AUTHZ_DENIED", {
      result: "DENIED",
      attributes: {
        reason: "UNAUTHENTICATED",
        attempted_privilege: "admin",
        required_role: "admin",
        actor_role: "anonymous",
        resource_ref: "/admin",
      },
    });
    return { allowed: false, redirect: "/login", reason: "UNAUTHENTICATED" };
  }

  if (!ctx.roles.includes("admin")) {
    await emitSecurityEvent(ctx, "AUTHZ_DENIED", {
      result: "DENIED",
      attributes: {
        reason: "MISSING_ROLE",
        attempted_privilege: "admin",
        required_role: "admin",
        actor_role: ctx.roles[0] ?? "customer",
        resource_ref: "/admin",
      },
    });
    return { allowed: false, redirect: "/app", reason: "FORBIDDEN" };
  }

  return { allowed: true, redirect: null, user: ctx.user, roles: ctx.roles };
}

/**
 * getCurrentUser: fetches current user profile, roles, and session info.
 */
export async function getCurrentUser(ctx: RequestContext) {
  if (!ctx.user) return null;
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("public_id, email, full_name, phone, status, must_change_password")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select("id, public_id, account_number, balance_minor, currency, status")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  return {
    user: {
      id: ctx.user.id,
      publicId: ctx.user.publicId,
      email: ctx.user.email,
      fullName: prof?.full_name ?? "",
      phone: prof?.phone ?? null,
      status: prof?.status ?? "ACTIVE",
      mustChangePassword: !!prof?.must_change_password,
    },
    roles: ctx.roles,
    session: ctx.session,
    device: ctx.device,
    account: account ?? null,
  };
}

/** Creates auth user + profile + customer role + empty account. */
export async function createCustomer(email: string, password: string, fullName: string, phone: string | null, role: "customer" | "admin" = "customer") {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(error?.message ?? "create user failed");
  const uid = data.user.id;
  await supabaseAdmin.from("profiles").insert({ user_id: uid, email, full_name: fullName, phone });
  await supabaseAdmin.from("user_roles").insert({ user_id: uid, role });
  if (role === "customer") {
    await supabaseAdmin.from("accounts").insert({ user_id: uid, balance_minor: 0 });
  }
  return uid;
}
