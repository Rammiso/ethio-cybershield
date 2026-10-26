import "@/test/setup";
import { describe, expect, it, vi } from "vitest";
import { runSelfTest } from "@/lib/selftest.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RequestContext } from "@/lib/telemetry.server";

function createChain(data: any = null, count: number = 0) {
  const chain: any = {
    data,
    count,
    error: null,
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    in: vi.fn(() => chain),
    or: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    single: async () => ({
      data: chain.data
        ? (Array.isArray(chain.data) ? chain.data[0] ?? { event_id: "ev-mock-1", id: "mock-1" } : chain.data)
        : { event_id: "ev-mock-1", id: "mock-1" },
      error: null,
    }),
    maybeSingle: async () => ({
      data: Array.isArray(chain.data) ? chain.data[0] ?? null : chain.data,
      error: null,
    }),
    then: (resolve: any) => resolve({ data: chain.data ?? [], count: chain.count, error: null }),
  };
  return chain;
}

describe("Prompt 6 Diagnostic Self-Test Suite", () => {
  const adminCtx: RequestContext = {
    requestId: "req-admin-selftest-1",
    endpoint: "/admin/selftest",
    method: "POST",
    ip: "192.168.1.100",
    userAgent: "AdminOps/1.0",
    clientDeviceId: "dev-admin",
    fingerprintHash: "fp-admin",
    user: { id: "admin-uuid-1", publicId: "USR_ADMIN", email: "admin@shieldbank.test" },
    roles: ["admin"],
    session: { id: "sess-admin-1", publicId: "SESS_ADMIN", deviceId: "dev-admin", status: "ACTIVE", expiresAt: "2099-01-01" },
    device: null,
    accessToken: "token-admin",
  };

  const customerCtx: RequestContext = {
    requestId: "req-customer-selftest-1",
    endpoint: "/admin/selftest",
    method: "POST",
    ip: "192.168.1.101",
    userAgent: "Mozilla/5.0",
    clientDeviceId: "dev-customer",
    fingerprintHash: "fp-customer",
    user: { id: "cust-uuid-1", publicId: "USR_CUST", email: "customer@shieldbank.test" },
    roles: ["customer"],
    session: null,
    device: null,
    accessToken: "token-cust",
  };

  describe("Automated Self-Test Diagnostic Engine", () => {
    it("rejects non-admin context with 403 Forbidden", async () => {
      await expect(runSelfTest(customerCtx)).rejects.toMatchObject({ status: 403 });
    });

    it("runs all 5 checks and reports all_passed: true in a healthy system", async () => {
      const originalFrom = supabaseAdmin.from;

      supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
        if (table === "security_events") {
          return {
            select: (cols: string, opts?: any) => {
              if (opts?.count === "exact") {
                return {
                  eq: () => ({
                    lt: async () => ({ count: 0, error: null }),
                  }),
                };
              }
              return {
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        event_id: "ev-1",
                        event_type: "LOGIN_SUCCESS",
                        occurred_at: new Date().toISOString(),
                        source_system: "shieldbank-testbed",
                        result: "SUCCESS",
                        delivery_status: "DELIVERED",
                      },
                      {
                        event_id: "ev-2",
                        event_type: "TRANSFER_CREATED",
                        occurred_at: new Date().toISOString(),
                        source_system: "shieldbank-testbed",
                        result: "SUCCESS",
                        delivery_status: "DELIVERED",
                      },
                    ],
                    error: null,
                  }),
                }),
              };
            },
            insert: () => createChain(),
          };
        }
        if (table === "ledger_entries") {
          return {
            select: async () => ({
              data: [
                { direction: "DEBIT", amount_minor: 10000 },
                { direction: "CREDIT", amount_minor: 10000 },
              ],
              error: null,
            }),
          };
        }
        if (table === "integration_credentials") {
          return {
            select: () => ({
              eq: () => ({
                limit: async () => ({
                  data: [
                    {
                      id: "cred-1",
                      key_id: "outbound-key",
                      secret_ciphertext: "test-secret",
                      status: "ACTIVE",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "integration_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    delivery_enabled: true,
                    ecs_base_url: "http://127.0.0.1:5000",
                    circuit_state: "CLOSED",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "audit_logs") {
          return {
            select: (cols: string, opts?: any) => {
              if (opts?.count === "exact") {
                return { eq: async () => ({ count: 10, error: null }) };
              }
              return createChain();
            },
          };
        }
        return createChain();
      }) as any;

      try {
        const report = await runSelfTest(adminCtx);
        expect(report).toBeDefined();
        expect(report.all_passed).toBe(true);
        expect(report.passed_count).toBe(5);
        expect(report.total_count).toBe(5);
        expect(report.checks).toHaveLength(5);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });

    it("detects ledger imbalance and flags ledger_balanced as FAIL", async () => {
      const originalFrom = supabaseAdmin.from;

      supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
        if (table === "ledger_entries") {
          return {
            select: async () => ({
              data: [
                { direction: "DEBIT", amount_minor: 25000 },
                { direction: "CREDIT", amount_minor: 10000 },
              ],
              error: null,
            }),
          };
        }
        if (table === "security_events") {
          return {
            select: (cols: string, opts?: any) => {
              if (opts?.count === "exact") {
                return { eq: () => ({ lt: async () => ({ count: 0, error: null }) }) };
              }
              return { order: () => ({ limit: async () => ({ data: [], error: null }) }) };
            },
            insert: () => createChain(),
          };
        }
        if (table === "integration_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { delivery_enabled: false }, error: null }),
              }),
            }),
          };
        }
        return createChain();
      }) as any;

      try {
        const report = await runSelfTest(adminCtx);
        const ledgerCheck = report.checks.find((c) => c.id === "ledger_balanced");
        expect(ledgerCheck?.status).toBe("FAIL");
        expect(report.all_passed).toBe(false);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });
  });
});
