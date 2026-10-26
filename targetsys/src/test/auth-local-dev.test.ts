import "@/test/setup";
import { describe, expect, it } from "vitest";
import { performLogin, registerCustomer, getCurrentUser } from "@/lib/auth.server";
import type { RequestContext } from "@/lib/telemetry.server";

function createMockCtx(): RequestContext {
  return {
    requestId: "test-req-01",
    endpoint: "/test/auth",
    method: "POST",
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
    clientDeviceId: "test-device-uuid-01",
    fingerprintHash: "test-fp-hash-01",
    user: null,
    roles: [],
    session: null,
    device: null,
    accessToken: null,
  };
}

describe("ShieldBank Auth & Local Dev Testbed", () => {
  it("allows admin demo account login with Testbed#2026", async () => {
    const ctx = createMockCtx();
    const result = await performLogin(ctx, "admin@shieldbank.test", "Testbed#2026");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.roles).toContain("admin");
      expect(result.access_token).toBeTruthy();
      expect(result.refresh_token).toBeTruthy();
      expect(result.sessionPublicId).toBeTruthy();
    }
  });

  it("allows customer login after registration", async () => {
    const ctx = createMockCtx();
    await registerCustomer(ctx, {
      fullName: "Test Customer",
      email: "testcustomer@shieldbank.test",
      password: "Testbed#2026",
      phone: "+251911223344",
    });

    const loginCtx = createMockCtx();
    const result = await performLogin(loginCtx, "testcustomer@shieldbank.test", "Testbed#2026");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.roles).toContain("customer");
      expect(result.access_token).toBeTruthy();
      expect(result.sessionPublicId).toBeTruthy();
    }
  });

  it("rejects invalid password for registered account and locks account upon reaching lockout threshold", async () => {
    const ctx = createMockCtx();
    const testEmail = "testcustomer@shieldbank.test";

    // Consecutive failed login attempts
    for (let i = 1; i <= 4; i++) {
      const res = await performLogin(ctx, testEmail, `BadPassAttempt${i}`);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Incorrect email or password.");
      }
    }

    // 5th attempt reaches lockout threshold (5)
    const lockAttempt = await performLogin(ctx, testEmail, "BadPassAttempt5");
    expect(lockAttempt.ok).toBe(false);

    // 6th attempt is blocked with account locked message
    const lockedRes = await performLogin(ctx, testEmail, "Testbed#2026");
    expect(lockedRes.ok).toBe(false);
    if (!lockedRes.ok) {
      expect(lockedRes.error).toMatch(/temporarily locked/i);
    }

    // Unlock account for subsequent tests
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ failed_login_count: 0, locked_until: null, status: "ACTIVE" })
      .eq("email", testEmail);
  });

  it("validates current password when updating password in customer profile", async () => {
    const { changeCustomerPassword } = await import("@/lib/customer.server");
    const { localDb } = await import("@/integrations/supabase/local-store");
    const testUser = localDb.users.find((u) => u.email === "testcustomer@shieldbank.test");
    expect(testUser).toBeDefined();

    const authCtx = createMockCtx();
    authCtx.user = { id: testUser!.id, publicId: "U_TEST_01", email: testUser!.email };

    // Fails when current password is wrong
    await expect(
      changeCustomerPassword(authCtx, {
        currentPassword: "IncorrectCurrentPassword!",
        newPassword: "BrandNewPassword#2026",
      }),
    ).rejects.toThrow(/Current password is incorrect/i);

    // Succeeds when current password matches
    const changeRes = await changeCustomerPassword(authCtx, {
      currentPassword: "Testbed#2026",
      newPassword: "BrandNewPassword#2026",
    });
    expect(changeRes.ok).toBe(true);

    // Now old password fails to login
    const oldLogin = await performLogin(createMockCtx(), "testcustomer@shieldbank.test", "Testbed#2026");
    expect(oldLogin.ok).toBe(false);

    // New password succeeds
    const newLogin = await performLogin(createMockCtx(), "testcustomer@shieldbank.test", "BrandNewPassword#2026");
    expect(newLogin.ok).toBe(true);

    // Restore password to Testbed#2026 for subsequent tests
    await changeCustomerPassword(authCtx, {
      currentPassword: "BrandNewPassword#2026",
      newPassword: "Testbed#2026",
    });
  });

  it("registers a new customer and allows immediate login", async () => {
    const ctx = createMockCtx();
    const newEmail = `newcustomer_${Date.now()}@shieldbank.test`;
    const newPass = "StrongPassword#2026";

    const regResult = await registerCustomer(ctx, {
      fullName: "Hana Girma",
      email: newEmail,
      password: newPass,
      phone: "+251911998877",
    });

    expect(regResult.ok).toBe(true);
    if (regResult.ok) {
      expect(regResult.roles).toContain("customer");
      expect(regResult.access_token).toBeTruthy();
      expect(regResult.user.email).toBe(newEmail);
      expect(regResult.user.fullName).toBe("Hana Girma");
    }

    // Now test login with this newly registered user
    const loginCtx = createMockCtx();
    const loginResult = await performLogin(loginCtx, newEmail, newPass);
    expect(loginResult.ok).toBe(true);
    if (loginResult.ok) {
      expect(loginResult.roles).toContain("customer");
      expect(loginResult.access_token).toBeTruthy();
    }
  });

  it("fetches user profile and account details for authenticated customer", async () => {
    const ctx = createMockCtx();
    const loginRes = await performLogin(ctx, "testcustomer@shieldbank.test", "Testbed#2026");
    expect(loginRes.ok).toBe(true);

    const currentUser = await getCurrentUser(ctx);
    expect(currentUser).not.toBeNull();
    expect(currentUser?.user.email).toBe("testcustomer@shieldbank.test");
    expect(currentUser?.roles).toContain("customer");
    expect(currentUser?.account).not.toBeNull();
  });

  it("allows admin access and fetches admin overview without errors", async () => {
    const ctx = createMockCtx();
    const loginRes = await performLogin(ctx, "admin@shieldbank.test", "Testbed#2026");
    expect(loginRes.ok).toBe(true);

    const { checkAdminAccess } = await import("@/lib/auth.server");
    const checkRes = await checkAdminAccess(ctx);
    expect(checkRes.allowed).toBe(true);
    expect(checkRes.roles).toContain("admin");

    const { getAdminOverview } = await import("@/lib/admin.server");
    const overview = await getAdminOverview(ctx);
    expect(overview).toBeDefined();
    expect(overview.kpis).toBeDefined();
  });

  it("stores active session status upon successful login", async () => {
    const ctx = createMockCtx();
    const loginRes = await performLogin(ctx, "admin@shieldbank.test", "Testbed#2026");
    expect(loginRes.ok).toBe(true);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin
      .from("target_sessions")
      .select("*")
      .eq("public_id", loginRes.ok ? loginRes.sessionPublicId : "")
      .maybeSingle();

    expect(session).toBeDefined();
    expect(session?.status).toBe("ACTIVE");
  });

  it("allows loginFn middleware to proceed when context has a stale or revoked session", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { setMockRequestForTesting } = await import("@/lib/telemetry.server");

    // Create a revoked session in local store
    await supabaseAdmin.from("target_sessions").insert({
      public_id: "revoked-session-pub-id",
      user_id: "revoked-user-uuid",
      status: "REVOKED",
      expires_at: new Date(Date.now() + 100000).toISOString(),
    });

    const mockReq = new Request("http://localhost:3000/api/auth/login", {
      headers: {
        "user-agent": "test-agent",
        cookie: "sb_testbed_session_id=revoked-session-pub-id",
      },
    });
    setMockRequestForTesting(mockReq);

    const { withTelemetry } = await import("@/lib/telemetry.middleware");
    const mw = withTelemetry("loginFn") as any;
    const serverFn = mw.options?.server || mw.serverFn;

    let handlerInvoked = false;
    const result = await serverFn({
      next: async (params: any) => {
        handlerInvoked = true;
        // Verify that stale session was cleared in context rather than throwing SESSION_ENDED
        expect(params?.context?.tctx?.session).toBeNull();
        return { ok: true };
      },
      data: {},
    });

    expect(handlerInvoked).toBe(true);
    expect(result).toEqual({ ok: true });

    setMockRequestForTesting(null);
  });

  it("ensures first-time password change marks client storage and is never prompted again across relogins", async () => {
    const {
      markStoredEntityPasswordChanged,
      isPasswordChangeCompleted,
      storeRegisteredEntity,
    } = await import("@/lib/client-headers");

    const entity = {
      userId: "u-first-test-01",
      userPublicId: "U_FIRST_01",
      email: "firsttest@shieldbank.test",
      phone: "+251911334455",
      accountNumber: "1000998877",
      mustChangePassword: true,
      initialPassword: "TempPassword#2026",
    };

    storeRegisteredEntity(entity);
    expect(isPasswordChangeCompleted("firsttest@shieldbank.test")).toBe(false);
    expect(isPasswordChangeCompleted("0911334455")).toBe(false);

    // Now mark changed by phone
    markStoredEntityPasswordChanged("0911334455", "NewBrandPassword#2026");

    expect(isPasswordChangeCompleted("0911334455")).toBe(true);
    expect(isPasswordChangeCompleted("+251911334455")).toBe(true);
    expect(isPasswordChangeCompleted("firsttest@shieldbank.test")).toBe(true);
    expect(isPasswordChangeCompleted("u-first-test-01")).toBe(true);
    expect(isPasswordChangeCompleted("1000998877")).toBe(true);
  });
});
