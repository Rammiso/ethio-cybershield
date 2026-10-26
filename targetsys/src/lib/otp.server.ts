import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emitSecurityEvent, sha256Hex, type RequestContext } from "./telemetry.server";

export interface SimulatedSms {
  id: string;
  userId: string;
  phone: string;
  code: string;
  purpose: string;
  message: string;
  sentAt: string;
  expiresAt: string;
}

// In-memory SMS store for the simulated SMS inbox (/app/sms)
const SMS_INBOX: SimulatedSms[] = [];

/**
 * Creates an OTP challenge with a 6-digit code, 5-minute expiry, max 3 attempts.
 * Emits AUTH_CHALLENGE event.
 */
export async function createOtpChallenge(
  ctx: RequestContext,
  purpose: "LOGIN_NEW_DEVICE" | "STEP_UP" | "TRANSFER",
) {
  if (!ctx.user) {
    throw new Error("UNAUTHENTICATED: User required to issue OTP challenge.");
  }

  // 6-digit random code
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  const code = randomNum.toString();
  const codeHash = await sha256Hex(code);

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { data: challenge, error } = await supabaseAdmin
    .from("otp_challenges")
    .insert({
      user_id: ctx.user.id,
      session_id: ctx.session?.id ?? null,
      purpose,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      status: "PENDING",
    })
    .select("id, purpose, expires_at")
    .single();

  if (error || !challenge) {
    throw new Error(`Failed to create OTP challenge: ${error?.message}`);
  }

  await emitSecurityEvent(ctx, "AUTH_CHALLENGE", {
    result: "PENDING",
    attributes: {
      challenge_id: challenge.id,
      purpose,
      expires_at: expiresAt,
    },
  });

  // Store in simulated SMS inbox for /app/sms
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("phone")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  const phone = profile?.phone || "+251911000000";
  const smsEntry: SimulatedSms = {
    id: challenge.id,
    userId: ctx.user.id,
    phone,
    code,
    purpose,
    message: `HonorPay Security Code: ${code}. Valid for 5 minutes for ${purpose.replace(/_/g, " ")}. Do not share.`,
    sentAt: new Date().toISOString(),
    expiresAt,
  };

  SMS_INBOX.unshift(smsEntry);
  if (SMS_INBOX.length > 50) SMS_INBOX.pop();

  return {
    challengeId: challenge.id,
    purpose: challenge.purpose,
    expiresAt: challenge.expires_at,
    // Provide code preview only if posture allows
    simulatedCode: code,
  };
}

/**
 * Verifies an OTP challenge.
 * Increments attempts, emits OTP_SUCCESS or OTP_FAILED.
 */
export async function verifyOtpChallenge(
  ctx: RequestContext,
  challengeId: string,
  code: string,
) {
  if (!ctx.user) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data: challenge, error } = await supabaseAdmin
    .from("otp_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (error || !challenge) {
    await emitSecurityEvent(ctx, "OTP_FAILED", {
      result: "FAILURE",
      attributes: {
        reason: "CHALLENGE_NOT_FOUND",
        challenge_id: challengeId,
      },
    });
    return { ok: false, error: "Invalid or expired security code." };
  }

  if (challenge.status !== "PENDING" || new Date(challenge.expires_at).getTime() < Date.now()) {
    await emitSecurityEvent(ctx, "OTP_FAILED", {
      result: "FAILURE",
      attributes: {
        reason: "EXPIRED_OR_RESOLVED",
        challenge_id: challengeId,
        status: challenge.status,
      },
    });
    return { ok: false, error: "This security code has expired. Please request a new one." };
  }

  if (challenge.attempts >= 3) {
    await supabaseAdmin
      .from("otp_challenges")
      .update({ status: "FAILED" })
      .eq("id", challengeId);

    await emitSecurityEvent(ctx, "OTP_FAILED", {
      result: "FAILURE",
      attributes: {
        reason: "MAX_ATTEMPTS_EXCEEDED",
        challenge_id: challengeId,
        attempts: challenge.attempts,
      },
    });
    return { ok: false, error: "Maximum attempts exceeded. Please request a new code." };
  }

  const inputHash = await sha256Hex(code.trim());
  if (inputHash !== challenge.code_hash) {
    const newAttempts = challenge.attempts + 1;
    const isExceeded = newAttempts >= 3;

    await supabaseAdmin
      .from("otp_challenges")
      .update({
        attempts: newAttempts,
        status: isExceeded ? "FAILED" : "PENDING",
      })
      .eq("id", challengeId);

    await emitSecurityEvent(ctx, "OTP_FAILED", {
      result: "FAILURE",
      attributes: {
        reason: "BAD_CODE",
        challenge_id: challengeId,
        attempts: newAttempts,
        remaining_attempts: Math.max(0, 3 - newAttempts),
      },
    });

    return {
      ok: false,
      error: `Incorrect code. ${Math.max(0, 3 - newAttempts)} attempt(s) remaining.`,
    };
  }

  // Success
  await supabaseAdmin
    .from("otp_challenges")
    .update({ status: "VERIFIED" })
    .eq("id", challengeId);

  await emitSecurityEvent(ctx, "OTP_SUCCESS", {
    result: "SUCCESS",
    attributes: {
      challenge_id: challengeId,
      purpose: challenge.purpose,
      attempts: challenge.attempts + 1,
    },
  });

  return { ok: true, verified: true, challengeId };
}

/**
 * Returns simulated SMS messages for the user.
 */
export async function getSimulatedSmsInbox(ctx: RequestContext) {
  if (!ctx.user) return [];
  const now = Date.now();
  return SMS_INBOX.filter(
    (s) => s.userId === ctx.user?.id && new Date(s.expiresAt).getTime() > now - 15 * 60 * 1000,
  );
}
