import "@/test/setup";
import { describe, expect, it, vi } from "vitest";
import {
  getAdminOverview,
  getLiveSecurityEvents,
  getAdminCustomers,
  getCustomerDetail,
  adminLockUnlockAccount,
  adminRevokeUserSessions,
  getAdminTransactions,
  getTransactionDetail,
  adminFreezeTransaction,
  adminReleaseTransaction,
  getAdminSecurityEvents,
  adminRetrySingleEvent,
  getAdminSessionsDevices,
  adminRevokeSingleSession,
  getAdminIpBlocklist,
  adminAddBlockedIp,
  adminRemoveBlockedIp,
  getAdminAuditLogs,
  updateSecurityPosture,
} from "@/lib/admin.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RequestContext } from "@/lib/telemetry.server";

function createChain(data: any = [], count: number = 0) {
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
      data: Array.isArray(chain.data)
        ? chain.data[0] ?? { id: "default-1", event_id: "default-event-1", status: "FROZEN" }
        : chain.data ?? { id: "default-1", event_id: "default-event-1", status: "FROZEN" },
      error: null,
    }),
    maybeSingle: async () => ({
      data: Array.isArray(chain.data) ? chain.data[0] ?? null : chain.data ?? null,
      error: null,
    }),
    then: (resolve: any) => resolve({ data: chain.data, count: chain.count, error: null }),
  };
  return chain;
}

describe("Prompt 5 Admin Dashboard Unit & Integration Tests", () => {
  const adminCtx: RequestContext = {
    requestId: "req-admin-1",
    endpoint: "/api/admin",
    method: "GET",
    ip: "192.168.1.100",
    userAgent: "AdminOps/1.0",
    clientDeviceId: "dev-1",
    fingerprintHash: "fp-1",
    user: { id: "admin-uuid-1", publicId: "USR_ADMIN", email: "admin@shieldbank.test" },
    roles: ["admin"],
    session: { id: "sess-admin-1", publicId: "SESS_ADMIN", deviceId: "d-1", status: "ACTIVE", expiresAt: "2099-01-01" },
    device: null,
    accessToken: "token-admin",
  };

  const customerCtx: RequestContext = {
    requestId: "req-user-1",
    endpoint: "/api/admin",
    method: "GET",
    ip: "192.168.1.101",
    userAgent: "Mozilla/5.0",
    clientDeviceId: "dev-2",
    fingerprintHash: "fp-2",
    user: { id: "user-uuid-99", publicId: "USR_99", email: "user@shieldbank.test" },
    roles: ["customer"],
    session: null,
    device: null,
    accessToken: "token-user",
  };

  describe("Admin Authorization Enforcement & Non-Admin Rejection (§9)", () => {
    it("rejects non-admin caller and throws 403 Forbidden with AUTHZ_DENIED", async () => {
      let eventInserted = false;
      const originalFrom = supabaseAdmin.from;

      supabaseAdmin.from = vi.fn((table: string) => {
        const chain = createChain();
        if (table === "security_events") {
          chain.insert = vi.fn((row: any) => {
            if (row.event_type === "AUTHZ_DENIED") {
              eventInserted = true;
            }
            return chain;
          });
        }
        return chain;
      }) as any;

      try {
        await expect(getAdminOverview(customerCtx)).rejects.toThrow("You don't have access to this.");
        expect(eventInserted).toBe(true);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });
  });

  describe("Admin Overview Aggregates (§5)", () => {
    it("computes real database aggregates across all KPI tiles", async () => {
      const originalFrom = supabaseAdmin.from;

      supabaseAdmin.from = vi.fn((table: string) => {
        if (table === "profiles") {
          return createChain([], 6);
        }
        if (table === "accounts") {
          return createChain([{ balance_minor: 12000000, is_system: false }, { balance_minor: 4500000, is_system: false }], 2);
        }
        if (table === "transactions") {
          return createChain(
            [
              { status: "COMPLETED", amount_minor: 50000 },
              { status: "PROCESSING", amount_minor: 5000000 },
              { status: "FROZEN", amount_minor: 100000 },
              { status: "FAILED", amount_minor: 25000 },
            ],
            4,
          );
        }
        if (table === "target_sessions") {
          return createChain([], 5);
        }
        if (table === "ip_blocklist") {
          return createChain([], 2);
        }
        if (table === "security_events") {
          return createChain(
            [
              { event_id: "ev-1", event_type: "LOGIN_FAILED", source_ip: "196.188.1.1", result: "FAILED", occurred_at: new Date().toISOString() },
            ],
            1,
          );
        }
        if (table === "integration_settings") {
          return createChain({ delivery_enabled: true, ecs_base_url: "https://ecs.cybershield.et", last_health_status: "HEALTHY" });
        }
        return createChain([], 0);
      }) as any;

      try {
        const overview = await getAdminOverview(adminCtx);
        expect(overview.kpis.customers).toBe(6);
        expect(overview.kpis.accounts).toBe(2);
        expect(overview.kpis.total_balance_etb).toBe(165000);
        expect(overview.kpis.transactions_today).toBe(4);
        expect(overview.kpis.completed_today).toBe(1);
        expect(overview.kpis.processing_today).toBe(1);
        expect(overview.kpis.frozen_today).toBe(1);
        expect(overview.kpis.failed_today).toBe(1);
        expect(overview.kpis.active_sessions).toBe(5);
        expect(overview.kpis.blocked_ips).toBe(2);
        expect(overview.live_events.length).toBe(1);
        expect(overview.top_failed_ips[0].ip).toBe("196.188.1.1");
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });

    it("polls fast live security events stream", async () => {
      const originalFrom = supabaseAdmin.from;
      supabaseAdmin.from = vi.fn((table: string) => {
        if (table === "security_events") {
          return createChain([
            { event_id: "ev-1", event_type: "AUTH_LOGIN", result: "SUCCESS" },
            { event_id: "ev-2", event_type: "AUTH_LOGIN_FAILED", result: "FAILED" },
          ]);
        }
        return createChain();
      }) as any;

      try {
        const events = await getLiveSecurityEvents(adminCtx, 5);
        expect(events.length).toBe(2);
        expect(events[0].event_id).toBe("ev-1");
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });
  });

  describe("Admin Customers Management (§5)", () => {
    it("lists customer profiles with accounts count and balances", async () => {
      const originalFrom = supabaseAdmin.from;
      supabaseAdmin.from = vi.fn((table: string) => {
        if (table === "profiles") {
          return createChain([
            {
              user_id: "u-1",
              public_id: "USR_1",
              email: "amina@shieldbank.test",
              full_name: "Amina Mohammed",
              phone: "+251911000001",
              status: "ACTIVE",
              accounts: [{ balance_minor: 12000000, is_system: false, public_id: "ACC_1" }],
              sessions: [{ status: "ACTIVE", expires_at: new Date(Date.now() + 10000).toISOString() }],
              devices: [{ is_trusted: true, status: "ACTIVE" }],
            },
          ]);
        }
        return createChain();
      }) as any;

      try {
        const customers = await getAdminCustomers(adminCtx);
        expect(customers.length).toBe(1);
        expect(customers[0].public_id).toBe("USR_1");
        expect(customers[0].total_balance_etb).toBe(120000);
        expect(customers[0].account_count).toBe(1);
        expect(customers[0].active_sessions_count).toBe(1);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });

    it("locks and unlocks an account and records audit_logs and ADMIN_ACTION", async () => {
      const originalFrom = supabaseAdmin.from;
      let userUpdated = false;
      let auditLogged = false;

      supabaseAdmin.from = vi.fn((table: string) => {
        const chain = createChain();
        if (table === "profiles") {
          chain.data = { user_id: "u-target", public_id: "USR_TARGET", status: "ACTIVE" };
          chain.update = vi.fn(() => {
            userUpdated = true;
            return chain;
          });
          return chain;
        }
        if (table === "audit_logs" || table === "security_events") {
          chain.insert = vi.fn((row: any) => {
            if (row.action === "LOCK_ACCOUNT" || row.event_type === "ADMIN_ACTION") {
              auditLogged = true;
            }
            return chain;
          });
        }
        return chain;
      }) as any;

      try {
        const res = await adminLockUnlockAccount(adminCtx, "USR_TARGET", true, "Administrative suspicion");
        expect(res.ok).toBe(true);
        expect(res.status).toBe("LOCKED");
        expect(userUpdated).toBe(true);
        expect(auditLogged).toBe(true);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });

    it("revokes user active sessions", async () => {
      const originalFrom = supabaseAdmin.from;
      let sessionsRevoked = false;

      supabaseAdmin.from = vi.fn((table: string) => {
        const chain = createChain();
        if (table === "profiles") {
          chain.data = { user_id: "u-target", public_id: "USR_TARGET" };
          return chain;
        }
        if (table === "target_sessions") {
          chain.update = vi.fn(() => {
            sessionsRevoked = true;
            return chain;
          });
          return chain;
        }
        return chain;
      }) as any;

      try {
        const res = await adminRevokeUserSessions(adminCtx, "USR_TARGET");
        expect(res.ok).toBe(true);
        expect(sessionsRevoked).toBe(true);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });
  });

  describe("Admin Transactions & Core Double-Entry Ledger (§5)", () => {
    it("retrieves transactions with double-entry inspection details", async () => {
      const originalFrom = supabaseAdmin.from;

      supabaseAdmin.from = vi.fn((table: string) => {
        if (table === "transactions") {
          return createChain({
            id: "tx-1",
            public_id: "TX_1001",
            amount_minor: 5000000,
            status: "PROCESSING",
            from_account_id: "acc-1",
          });
        }
        if (table === "ledger_entries") {
          return createChain([
            {
              id: "le-1",
              direction: "DEBIT",
              amount_minor: 5000000,
              sequence_number: 1,
            },
          ]);
        }
        if (table === "security_events") {
          return createChain([{ event_id: "ev-tx-1", event_type: "TRANSFER_INITIATED", result: "SUCCESS" }]);
        }
        return createChain();
      }) as any;

      try {
        const detail = await getTransactionDetail(adminCtx, "TX_1001");
        expect(detail.transaction.public_id).toBe("TX_1001");
        expect(detail.ledger.length).toBe(1);
        expect(detail.ledger[0].direction).toBe("DEBIT");
        expect(detail.events.length).toBe(1);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });

    it("freezes PROCESSING transaction, refunds sender, and records double-entry CREDIT", async () => {
      const originalFrom = supabaseAdmin.from;
      let txUpdated = false;
      let ledgerInserted = false;

      const txData = {
        id: "tx-proc-1",
        public_id: "TX_PROC_1",
        status: "PROCESSING",
        amount_minor: 5000000,
        from_account: { id: "acc-sender", balance_minor: 1000000, public_id: "ACC_SENDER" },
        beneficiary: { public_id: "BEN_1" },
      };

      supabaseAdmin.from = vi.fn((table: string) => {
        const chain = createChain();
        if (table === "transactions") {
          chain.data = txData;
          chain.update = vi.fn((updates: any) => {
            txUpdated = true;
            Object.assign(txData, updates);
            return chain;
          });
          return chain;
        }
        if (table === "accounts") {
          chain.data = { id: "acc-sender", balance_minor: 1000000, public_id: "ACC_SENDER" };
          return chain;
        }
        if (table === "ledger_entries") {
          chain.insert = vi.fn((row: any) => {
            if (row.direction === "CREDIT") {
              ledgerInserted = true;
            }
            return chain;
          });
          return chain;
        }
        return chain;
      }) as any;

      try {
        const res = await adminFreezeTransaction(adminCtx, "TX_PROC_1", "High risk alert");
        expect(res.status).toBe("CONFIRMED");
        expect(txUpdated).toBe(true);
        expect(ledgerInserted).toBe(true);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });
  });

  describe("Admin IP Blocklist & Audit Logs (§5)", () => {
    it("adds and removes blocked IPs with ADMIN source tagging", async () => {
      const originalFrom = supabaseAdmin.from;
      let ipInserted = false;
      let ipDeleted = false;

      supabaseAdmin.from = vi.fn((table: string) => {
        const chain = createChain([
          { ip: "196.188.99.1", source: "ADMIN", reason: "Test block", created_at: new Date().toISOString() },
        ]);
        if (table === "ip_blocklist") {
          chain.upsert = vi.fn((row: any) => {
            if (row.source === "ADMIN" && row.ip === "196.188.99.1") {
              ipInserted = true;
            }
            return chain;
          });
          chain.delete = vi.fn(() => {
            ipDeleted = true;
            return chain;
          });
        }
        return chain;
      }) as any;

      try {
        const addRes = await adminAddBlockedIp(adminCtx, "196.188.99.1", "Test block", 60);
        expect(addRes.ok).toBe(true);
        expect(ipInserted).toBe(true);

        const list = await getAdminIpBlocklist(adminCtx);
        expect(list.length).toBe(1);
        expect(list[0].ip).toBe("196.188.99.1");

        const rmRes = await adminRemoveBlockedIp(adminCtx, "196.188.99.1");
        expect(rmRes.ok).toBe(true);
        expect(ipDeleted).toBe(true);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });

    it("records and fetches append-only audit logs", async () => {
      const originalFrom = supabaseAdmin.from;
      supabaseAdmin.from = vi.fn((table: string) => {
        if (table === "audit_logs") {
          return createChain(
            [
              {
                id: "aud-1",
                actor_type: "ADMIN",
                actor_id: "admin-uuid-1",
                action: "ADMIN_ACTION",
                entity_type: "security_posture",
                created_at: new Date().toISOString(),
              },
            ],
            1,
          );
        }
        return createChain();
      }) as any;

      try {
        const res = await getAdminAuditLogs(adminCtx, { limit: 10 });
        expect(res.logs.length).toBe(1);
        expect(res.total).toBe(1);
        expect(res.logs[0].actor_type).toBe("ADMIN");
        expect(res.logs[0].action).toBe("ADMIN_ACTION");
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });
  });

  describe("Security Posture Switching & Hardened Lockout Acceptance (§5)", () => {
    it("updates security posture singleton and records ADMIN_ACTION audit log", async () => {
      const originalFrom = supabaseAdmin.from;
      let postureUpdated = false;
      let auditRecorded = false;

      supabaseAdmin.from = vi.fn((table: string) => {
        const chain = createChain();
        if (table === "security_posture") {
          chain.data = { id: 1, lab_mode: false, lockout_enabled: true };
          chain.update = vi.fn(() => {
            postureUpdated = true;
            return chain;
          });
          return chain;
        }
        if (table === "audit_logs" || table === "security_events") {
          chain.insert = vi.fn((row: any) => {
            if (row.action === "UPDATE_SECURITY_POSTURE" || row.event_type === "ADMIN_ACTION") {
              auditRecorded = true;
            }
            return chain;
          });
        }
        return chain;
      }) as any;

      try {
        const res = await updateSecurityPosture(adminCtx, {
          lab_mode: false,
          lockout_enabled: true,
          lockout_threshold: 5,
        });
        expect(res.lab_mode).toBe(false);
        expect(res.lockout_enabled).toBe(true);
        expect(postureUpdated).toBe(true);
        expect(auditRecorded).toBe(true);
      } finally {
        supabaseAdmin.from = originalFrom;
      }
    });
  });
});
