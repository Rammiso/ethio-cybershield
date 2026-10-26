import "@/test/setup";
import { describe, expect, it, vi } from "vitest";
import {
  SaveOutboundConfigSchema,
  CreateInboundKeySchema,
  RevokeInboundKeySchema,
  RotateInboundKeySchema,
  RevertActionSchema,
} from "@/lib/admin.functions";
import {
  buildCanonicalString,
  signEcsRequest,
  verifyEcsSignature,
} from "@/lib/hmac.server";
import { encryptSecret, decryptSecret } from "@/lib/encryption.server";
import { handlePublicSecurityApi } from "@/lib/public-api.server";
import {
  freezeTransaction,
  revokeSessionControl,
  blockIpControl,
  lockAccountControl,
  disableBeneficiaryControl,
  requireStepUpControl,
  revertControlAction,
} from "@/lib/controls.server";

describe("Prompt 4 ECS Integration & Control Enforcement Tests", () => {
  describe("Admin Schema Validations (§10 Inbound & Outbound)", () => {
    it("validates outbound ECS config payload", () => {
      const valid = SaveOutboundConfigSchema.safeParse({
        ecs_base_url: "https://ecs.cybershield.et",
        delivery_enabled: true,
        key_id: "ecs_live_992211",
        secret: "super-secret-key-32b",
      });
      expect(valid.success).toBe(true);
    });

    it("accepts empty or null ecs_base_url when delivery is disabled", () => {
      const valid = SaveOutboundConfigSchema.safeParse({
        ecs_base_url: "",
        delivery_enabled: false,
      });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid ecs_base_url format", () => {
      const invalid = SaveOutboundConfigSchema.safeParse({
        ecs_base_url: "not-a-valid-url",
        delivery_enabled: true,
      });
      expect(invalid.success).toBe(false);
    });

    it("validates inbound key creation schema", () => {
      const valid = CreateInboundKeySchema.safeParse({
        label: "ECS Production Mitigation Key",
        scopes: ["read:investigation", "control:freeze-transaction", "control:block-ip"],
        ip_allowlist: ["197.156.10.22", "197.156.10.23"],
      });
      expect(valid.success).toBe(true);
    });

    it("requires at least one scope when creating an inbound key", () => {
      const invalid = CreateInboundKeySchema.safeParse({
        label: "Empty Scope Key",
        scopes: [],
      });
      expect(invalid.success).toBe(false);
    });

    it("validates revert control action schema", () => {
      const valid = RevertActionSchema.safeParse({
        controlActionId: "123e4567-e89b-12d3-a456-426614174000",
        reason: "SOC confirmed false positive",
      });
      expect(valid.success).toBe(true);
    });

    it("requires valid UUID for revert controlActionId", () => {
      const invalid = RevertActionSchema.safeParse({
        controlActionId: "not-a-uuid",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("AES-256-GCM Secret Security at Rest (§10)", () => {
    it("encrypts secrets and includes IV delimiter", async () => {
      const rawSecret = "9a7f3e82d1c4b5a60123456789abcdef9a7f3e82d1c4b5a60123456789abcdef";
      const cipher = await encryptSecret(rawSecret);

      expect(cipher).not.toBe(rawSecret);
      expect(cipher.includes(":")).toBe(true);

      const decrypted = await decryptSecret(cipher);
      expect(decrypted).toBe(rawSecret);
    });
  });

  describe("ECS Inbound Canonical Signing & Authentication (§10 Direction B)", () => {
    it("generates correct canonical string with method, path, and sha256 body hash", async () => {
      const timestamp = "1729005000";
      const nonce = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      const method = "POST";
      const path = "/api/public/security/controls/freeze-transaction";
      const body = JSON.stringify({
        transaction_id: "TX_1001",
        reason: "High velocity transfer detected",
        alert_id: "ALT_99",
      });

      const canonical = await buildCanonicalString(timestamp, nonce, method, path, body);
      expect(canonical.startsWith(`${timestamp}\n${nonce}\nPOST\n${path}\n`)).toBe(true);
      expect(canonical.split("\n")).toHaveLength(5);
    });

    it("rejects unauthorized request with missing headers -> 401 UNAUTHORIZED", async () => {
      const req = new Request("http://localhost:3000/api/public/security/controls/freeze-transaction", {
        method: "POST",
        body: JSON.stringify({ transaction_id: "TX_1" }),
      });

      const res = await handlePublicSecurityApi(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects requests with timestamp skew > 300 seconds -> 401 UNAUTHORIZED", async () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 360; // 6 minutes ago
      const req = new Request("http://localhost:3000/api/public/security/controls/freeze-transaction", {
        method: "POST",
        headers: {
          "x-ecs-key-id": "ecs_key_123",
          "x-ecs-timestamp": String(staleTimestamp),
          "x-ecs-nonce": "nonce-skew-test",
          "x-ecs-signature": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          "content-type": "application/json",
        },
        body: JSON.stringify({ transaction_id: "TX_1" }),
      });

      const res = await handlePublicSecurityApi(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Control Action Invariants & Safety Refusals (§10 & §11)", () => {
    describe("BLOCK_IP Safety Check", () => {
      it("refuses loopback IP 127.0.0.1 -> REJECTED", async () => {
        const result = await blockIpControl(null, "test-ecs-key", {
          ip: "127.0.0.1",
          reason: "Attacking endpoint",
          alert_id: "ALT-IP-1",
        });

        expect(result.status).toBe("REJECTED");
        expect(result.message).toContain("loopback or private");
      });

      it("refuses IPv6 loopback ::1 -> REJECTED", async () => {
        const result = await blockIpControl(null, "test-ecs-key", {
          ip: "::1",
          reason: "IPv6 attack",
          alert_id: "ALT-IP-2",
        });

        expect(result.status).toBe("REJECTED");
        expect(result.message).toContain("loopback or private");
      });

      it("refuses RFC1918 private ranges (10.x, 192.168.x, 172.16.x) -> REJECTED", async () => {
        const privateIps = ["10.0.0.1", "192.168.1.100", "172.16.0.5", "169.254.1.1"];
        for (const ip of privateIps) {
          const result = await blockIpControl(null, "test-ecs-key", {
            ip,
            reason: "Private IP test",
            alert_id: "ALT-IP-PRIV",
          });
          expect(result.status).toBe("REJECTED");
          expect(result.message).toContain("loopback or private");
        }
      });
    });

    describe("FREEZE_TRANSACTION Invariants", () => {
      it("returns 409 / ALREADY_COMPLETED when transaction is already COMPLETED", async () => {
        // Mock transaction lookup returning COMPLETED status
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "transactions") {
            return {
              select: () => ({
                or: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "tx-completed-123",
                      public_id: "TX_COMPLETED_1",
                      status: "COMPLETED",
                      amount_minor: 6000000,
                      from_account_id: "acc-1",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "control_actions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: { id: "ca-1" }, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: "audit-1" }, error: null }),
              }),
            }),
          };
        }) as any;

        try {
          const result = await freezeTransaction(null, "test-ecs-key", {
            transaction_id: "TX_COMPLETED_1",
            reason: "Suspected fraud",
            alert_id: "ALT-FREEZE-1",
          });

          expect(result.status).toBe("REJECTED");
          expect(result.code).toBe("ALREADY_COMPLETED");
          expect(result.actual_state?.status).toBe("COMPLETED");
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });

      it("freezes PROCESSING transfer, restores funds, and records target state", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        let txStatus = "PROCESSING";
        let senderBalance = 5000000; // 50,000 ETB
        let ledgerInserted = false;
        let controlActionInserted = false;

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "transactions") {
            return {
              select: () => ({
                or: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "tx-processing-99",
                      public_id: "TX_PROCESSING_99",
                      status: txStatus,
                      amount_minor: 6000000, // 60,000 ETB
                      from_account: {
                        id: "acc-sender-1",
                        balance_minor: senderBalance,
                        public_id: "ACC_SENDER_1",
                      },
                    },
                    error: null,
                  }),
                }),
                eq: () => ({
                  single: async () => ({
                    data: { status: txStatus },
                    error: null,
                  }),
                }),
              }),
              update: (updates: { status: string }) => {
                txStatus = updates.status;
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          }
          if (table === "accounts") {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: "acc-sender-1", balance_minor: senderBalance },
                    error: null,
                  }),
                }),
              }),
              update: (updates: { balance_minor: number }) => {
                senderBalance = updates.balance_minor;
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          }
          if (table === "ledger_entries") {
            return {
              insert: async () => {
                ledgerInserted = true;
                return { error: null };
              },
            };
          }
          if (table === "control_actions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
              insert: () => {
                controlActionInserted = true;
                return {
                  select: () => ({
                    single: async () => ({
                      data: { id: "ca-freeze-success" },
                      error: null,
                    }),
                  }),
                };
              },
            };
          }
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { event_id: "ev-1" }, error: null }),
              }),
            }),
          };
        }) as any;

        try {
          const result = await freezeTransaction(null, "test-ecs-key", {
            transaction_id: "TX_PROCESSING_99",
            reason: "Account takeover velocity trigger",
            alert_id: "ALT-ATO-99",
            idempotency_key: "idem-freeze-1",
          });

          expect(result.status).toBe("CONFIRMED");
          expect(txStatus).toBe("FROZEN");
          expect(senderBalance).toBe(11000000); // 50,000 + 60,000 = 110,000 ETB restored!
          expect(ledgerInserted).toBe(true);
          expect(controlActionInserted).toBe(true);
          expect(result.target_state?.status).toBe("FROZEN");
          expect(result.target_state?.funds_restored).toBe(true);
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });
    });

    describe("Idempotency Invariant", () => {
      it("returns cached result when idempotency_key was previously executed", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "control_actions") {
            return {
              select: () => ({
                eq: (col: string, val: string) => {
                  if (col === "idempotency_key" && val === "cached-key-1") {
                    return {
                      maybeSingle: async () => ({
                        data: {
                          id: "ca-cached-1",
                          status: "CONFIRMED",
                          target_state: { status: "FROZEN", cached: true },
                          created_at: new Date().toISOString(),
                        },
                        error: null,
                      }),
                    };
                  }
                  return {
                    maybeSingle: async () => ({ data: null, error: null }),
                  };
                },
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }) as any;

        try {
          const result = await freezeTransaction(null, "test-ecs-key", {
            transaction_id: "TX_ANY",
            reason: "Any reason",
            alert_id: "ALT-1",
            idempotency_key: "cached-key-1",
          });

          expect(result.status).toBe("CONFIRMED");
          expect(result.control_action_id).toBe("ca-cached-1");
          expect(result.target_state?.cached).toBe(true);
          expect(result.message.toLowerCase()).toContain("idempotent replay");
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });
    });

    describe("Revert Action Operator Overrides", () => {
      it("reverts reversible control actions and updates state", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        let blocklistDeleted = false;
        let actionStatus = "CONFIRMED";

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "control_actions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "ca-block-ip-1",
                      action: "BLOCK_IP",
                      status: actionStatus,
                      target_public_id: "197.156.10.99",
                    },
                    error: null,
                  }),
                }),
              }),
              update: (updates: { status: string }) => {
                actionStatus = updates.status;
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          }
          if (table === "ip_blocklist") {
            return {
              delete: () => ({
                eq: async () => {
                  blocklistDeleted = true;
                  return { error: null };
                },
              }),
            };
          }
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { event_id: "ev-revert" }, error: null }),
              }),
            }),
          };
        }) as any;

        try {
          const result = await revertControlAction(null, "admin-console", {
            control_action_id: "ca-block-ip-1",
            reason: "False positive unblock",
          });

          expect(result.status).toBe("CONFIRMED");
          expect(blocklistDeleted).toBe(true);
          expect(actionStatus).toBe("REVERTED");
          expect(result.target_state?.status).toBe("REVERTED");
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });

      it("handles already reverted action idempotently", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "control_actions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "ca-already-reverted",
                      action: "LOCK_ACCOUNT",
                      status: "REVERTED",
                      target_public_id: "ACC_1",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }) as any;

        try {
          const result = await revertControlAction(null, "admin-console", {
            control_action_id: "ca-already-reverted",
          });

          expect(result.status).toBe("CONFIRMED");
          expect(result.message).toContain("already reverted");
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });
    });

    describe("Additional Mitigation Controls (§10)", () => {
      it("REVOKE_SESSION terminates active session -> CONFIRMED", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        let sessionStatus = "ACTIVE";

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "target_sessions") {
            return {
              select: () => ({
                or: () => ({
                  maybeSingle: async () => ({
                    data: { id: "sess-1", public_id: "SESS_1", status: sessionStatus },
                    error: null,
                  }),
                }),
              }),
              update: (updates: { status: string }) => {
                sessionStatus = updates.status;
                return { eq: async () => ({ error: null }) };
              },
            };
          }
          if (table === "control_actions") {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: () => ({ select: () => ({ single: async () => ({ data: { id: "ca-sess-1" }, error: null }) }) }),
            };
          }
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: { event_id: "ev-sess" }, error: null }) }) }),
          };
        }) as any;

        try {
          const result = await revokeSessionControl(null, "test-key", {
            session_id: "SESS_1",
            reason: "Session hijacking indicator",
            alert_id: "ALT-SESS-1",
          });

          expect(result.status).toBe("CONFIRMED");
          expect(sessionStatus).toBe("REVOKED");
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });

      it("REQUIRE_STEP_UP sets step_up_until in the future -> CONFIRMED", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        let stepUpDate: string | null = null;

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "profiles") {
            return {
              select: () => ({
                or: () => ({
                  maybeSingle: async () => ({
                    data: { user_id: "u-1", public_id: "USR_1", step_up_until: null },
                    error: null,
                  }),
                }),
                eq: () => ({
                  single: async () => ({
                    data: { step_up_until: stepUpDate },
                    error: null,
                  }),
                }),
              }),
              update: (updates: { step_up_until: string }) => {
                stepUpDate = updates.step_up_until;
                return { eq: async () => ({ error: null }) };
              },
            };
          }
          if (table === "control_actions") {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: () => ({ select: () => ({ single: async () => ({ data: { id: "ca-step-1" }, error: null }) }) }),
            };
          }
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: { event_id: "ev-step" }, error: null }) }) }),
          };
        }) as any;

        try {
          const result = await requireStepUpControl(null, "test-key", {
            user_id: "USR_1",
            duration_minutes: 30,
            reason: "Anomalous device profile",
            alert_id: "ALT-STEP-1",
          });

          expect(result.status).toBe("CONFIRMED");
          expect(stepUpDate).not.toBeNull();
          expect(new Date(stepUpDate!).getTime()).toBeGreaterThan(Date.now());
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });

      it("DISABLE_BENEFICIARY blocks new transfers to target beneficiary -> CONFIRMED", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        let benStatus = "ACTIVE";

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "beneficiaries") {
            return {
              select: () => ({
                or: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "ben-1",
                      public_id: "BEN_1",
                      name: "Mule Account",
                      status: benStatus,
                      account: { public_id: "ACC_1" },
                    },
                    error: null,
                  }),
                }),
                eq: () => ({
                  single: async () => ({
                    data: { status: benStatus, disabled_reason: "Mule network link" },
                    error: null,
                  }),
                }),
              }),
              update: (updates: { status: string }) => {
                benStatus = updates.status;
                return { eq: async () => ({ error: null }) };
              },
            };
          }
          if (table === "control_actions") {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: () => ({ select: () => ({ single: async () => ({ data: { id: "ca-ben-1" }, error: null }) }) }),
            };
          }
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: { event_id: "ev-ben" }, error: null }) }) }),
          };
        }) as any;

        try {
          const result = await disableBeneficiaryControl(null, "test-key", {
            beneficiary_id: "BEN_1",
            reason: "Mule network link",
            alert_id: "ALT-BEN-1",
          });

          expect(result.status).toBe("CONFIRMED");
          expect(benStatus).toBe("DISABLED");
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });

      it("LOCK_ACCOUNT sets account status to LOCKED -> CONFIRMED", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        let accStatus = "ACTIVE";

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "accounts") {
            return {
              select: () => ({
                or: () => ({
                  maybeSingle: async () => ({
                    data: { id: "acc-1", public_id: "ACC_1", status: accStatus, user_id: "u-1" },
                    error: null,
                  }),
                }),
                eq: () => ({
                  single: async () => ({
                    data: { status: accStatus, public_id: "ACC_1" },
                    error: null,
                  }),
                }),
              }),
              update: (updates: { status: string }) => {
                accStatus = updates.status;
                return { eq: async () => ({ error: null }) };
              },
            };
          }
          if (table === "control_actions") {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: () => ({ select: () => ({ single: async () => ({ data: { id: "ca-acc-1" }, error: null }) }) }),
            };
          }
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: { event_id: "ev-acc" }, error: null }) }) }),
          };
        }) as any;

        try {
          const result = await lockAccountControl(null, "test-key", {
            account_id: "ACC_1",
            reason: "Confirmed account takeover in progress",
            alert_id: "ALT-ACC-1",
          });

          expect(result.status).toBe("CONFIRMED");
          expect(accStatus).toBe("LOCKED");
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });
    });

    describe("Scope & Nonce Replay Enforcements (§10 & §11 Acceptance)", () => {
      it("rejects request when key lacks required scope -> 403 FORBIDDEN", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        const testKeyId = "ecs_key_read_only";
        const testSecret = "test-secret-key-for-scope-check-32b";
        const now = Math.floor(Date.now() / 1000);
        const nonce = "nonce-scope-test-1";
        const method = "POST";
        const path = "/api/public/security/controls/freeze-transaction";
        const body = JSON.stringify({
          transaction_id: "TX_1",
          reason: "Test reason",
          alert_id: "ALT-1",
        });

        const sig = await signEcsRequest(testSecret, String(now), nonce, method, path, body);

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "integration_credentials") {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "cred-1",
                        key_id: testKeyId,
                        secret_ciphertext: testSecret,
                        scopes: ["read:investigation"], // Missing control:freeze-transaction!
                        status: "ACTIVE",
                        ip_allowlist: null,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
          };
        }) as any;

        try {
          const req = new Request(`http://localhost:3000${path}`, {
            method,
            headers: {
              "x-ecs-key-id": testKeyId,
              "x-ecs-timestamp": String(now),
              "x-ecs-nonce": nonce,
              "x-ecs-signature": sig,
              "content-type": "application/json",
            },
            body,
          });

          const res = await handlePublicSecurityApi(req);
          expect(res.status).toBe(403);
          const json = await res.json();
          expect(json.error.code).toBe("FORBIDDEN");
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });

      it("rejects replayed nonce -> 401 UNAUTHORIZED", async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const originalFrom = supabaseAdmin.from;

        const testKeyId = "ecs_key_valid";
        const testSecret = "test-secret-key-for-replay-check-32";
        const now = Math.floor(Date.now() / 1000);
        const replayedNonce = "nonce-already-used-uuid";
        const method = "POST";
        const path = "/api/public/security/controls/freeze-transaction";
        const body = JSON.stringify({
          transaction_id: "TX_1",
          reason: "Test reason",
          alert_id: "ALT-1",
        });

        const sig = await signEcsRequest(testSecret, String(now), replayedNonce, method, path, body);

        supabaseAdmin.from = vi.fn().mockImplementation((table: string) => {
          if (table === "integration_credentials") {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "cred-1",
                        key_id: testKeyId,
                        secret_ciphertext: testSecret,
                        scopes: ["control:freeze-transaction"],
                        status: "ACTIVE",
                        ip_allowlist: null,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "api_nonces") {
            return {
              select: () => ({
                eq: (col1: string, val1: string) => ({
                  eq: (col2: string, val2: string) => ({
                    maybeSingle: async () => ({
                      data: { nonce: replayedNonce }, // NONCE ALREADY EXISTS!
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            insert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
          };
        }) as any;

        try {
          const req = new Request(`http://localhost:3000${path}`, {
            method,
            headers: {
              "x-ecs-key-id": testKeyId,
              "x-ecs-timestamp": String(now),
              "x-ecs-nonce": replayedNonce,
              "x-ecs-signature": sig,
              "content-type": "application/json",
            },
            body,
          });

          const res = await handlePublicSecurityApi(req);
          expect(res.status).toBe(401);
          const json = await res.json();
          expect(json.error.code).toBe("UNAUTHORIZED");
        } finally {
          supabaseAdmin.from = originalFrom;
        }
      });
    });
  });
});

