import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTelemetry } from "./telemetry.middleware";

export const RegisterInputSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  phone: z.string().trim().optional().nullable(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const isValidLoginIdentifier = (val: string): boolean => {
  const clean = val.trim();
  if (!clean) return false;
  // 1. Valid email format
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return true;
  // 2. Ethiopian mobile phone (09..., +2519..., 07..., +2517...)
  const digits = clean.replace(/[\s-]/g, "");
  if (/^(\+251|251|0)?[97]\d{8}$/.test(digits)) return true;
  // 3. 10-digit account number (1000...)
  if (/^\d{10}$/.test(digits)) return true;
  // 4. Attack / security payloads (SQLi, XSS, quotes, comments) so telemetry captures them rather than throwing generic schema errors
  if (/['";#\/*]|(--)|(\b(or|and|union|select|drop|sleep)\b)/i.test(clean)) return true;
  return false;
};

export const LoginInputSchema = z.object({
  email: z.string().trim().refine(isValidLoginIdentifier, {
    message: "Please enter a valid email address, mobile phone (09...), or 10-digit account number",
  }),
  password: z.string().min(1, "Password is required"),
  otpChallengeId: z.string().uuid().optional().nullable(),
  otpCode: z.string().min(6).max(6).optional().nullable(),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

/**
 * registerFn: Creates customer profile, role, empty account, first device and session.
 * Emits DEVICE_REGISTERED and SESSION_CREATED.
 */
export const registerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => RegisterInputSchema.parse(data))
  .middleware([withTelemetry("registerFn")])
  .handler(async ({ data, context }) => {
    const { registerCustomer } = await import("./auth.server");
    return await registerCustomer(context.tctx, data);
  });

/**
 * loginFn: Verifies credentials, records brute-force stats, registers unknown devices,
 * creates active session. Emits LOGIN_FAILED / LOGIN_SUCCESS / SESSION_CREATED.
 */
export const loginFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => LoginInputSchema.parse(data))
  .middleware([withTelemetry("loginFn", { sensitive: true })])
  .handler(async ({ data, context }) => {
    const { performLogin } = await import("./auth.server");
    return await performLogin(
      context.tctx,
      data.email,
      data.password,
      data.otpChallengeId,
      data.otpCode,
    );
  });

/**
 * logoutFn: Marks session LOGGED_OUT and emits LOGOUT event.
 */
export const logoutFn = createServerFn({ method: "POST" })
  .middleware([withTelemetry("logoutFn")])
  .handler(async ({ context }) => {
    const { logoutUser } = await import("./auth.server");
    return await logoutUser(context.tctx);
  });

/**
 * getCurrentUserFn: Returns the current user profile, roles, and session info.
 */
export const getCurrentUserFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getCurrentUser")])
  .handler(async ({ context }) => {
    const { getCurrentUser } = await import("./auth.server");
    return await getCurrentUser(context.tctx);
  });

/**
 * checkAdminAccessFn: Verifies admin privilege.
 * Emits AUTHZ_DENIED with attempted_privilege='admin' if non-admin or unauthenticated.
 */
export const checkAdminAccessFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("checkAdminAccess")])
  .handler(async ({ context }) => {
    const { checkAdminAccess } = await import("./auth.server");
    return await checkAdminAccess(context.tctx);
  });

/**
 * getSecurityPostureFn: Fetches security posture singleton settings.
 */
export const getSecurityPostureFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getSecurityPosture")])
  .handler(async () => {
    const { getSecurityPosture } = await import("./seed.server");
    return await getSecurityPosture();
  });
