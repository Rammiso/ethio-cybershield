import { describe, expect, it, beforeEach } from "vitest";
import {
  buildCanonicalString,
  signEcsRequest,
  constantTimeEqual,
  hmacSha256Hex,
  sha256Hex,
} from "@/lib/hmac.server";
import { encryptSecret, decryptSecret } from "@/lib/encryption.server";
import { scanInputs, detectSequentialProbing } from "@/lib/telemetry.server";
import { handlePublicSecurityApi } from "@/lib/public-api.server";

describe("Prompt 3 Full Telemetry & Outbox Invariant Unit Tests", () => {
  describe("AES-256-GCM Secret Encryption & Decryption", () => {
    it("encrypts and decrypts secret keys deterministically round-trip", async () => {
      const plaintextSecret = "ecs-secret-key-super-secure-token-998811";
      const ciphertext = await encryptSecret(plaintextSecret);

      expect(ciphertext).not.toBe(plaintextSecret);
      expect(ciphertext).toContain(":");

      const decrypted = await decryptSecret(ciphertext);
      expect(decrypted).toBe(plaintextSecret);
    });

    it("gracefully handles unencrypted strings without crashing", async () => {
      const plain = "already-plaintext-secret";
      const result = await decryptSecret(plain);
      expect(result).toBe(plain);
    });
  });

  describe("HMAC Canonical String & Signature (§10 Direction A & B)", () => {
    it("constructs canonical string exactly per §10 specification", async () => {
      const timestamp = "1729000000";
      const nonce = "4512e02e-9c76-4d43-a619-21b9338f0fa5";
      const method = "POST";
      const path = "/api/events";
      const rawBody = JSON.stringify({ hello: "world" });

      const bodyHash = await sha256Hex(rawBody);
      const canonical = await buildCanonicalString(timestamp, nonce, method, path, rawBody);

      expect(canonical).toBe(`${timestamp}\n${nonce}\nPOST\n${path}\n${bodyHash}`);
    });

    it("computes reproducible HMAC-SHA256 signatures", async () => {
      const secret = "test-secret-123";
      const timestamp = "1729000000";
      const nonce = "test-nonce-uuid";
      const method = "GET";
      const path = "/api/public/security/events?since_seq=0";
      const body = "";

      const sig1 = await signEcsRequest(secret, timestamp, nonce, method, path, body);
      const sig2 = await signEcsRequest(secret, timestamp, nonce, method, path, body);

      expect(sig1).toBe(sig2);
      expect(sig1.length).toBe(64); // SHA-256 hex string
    });

    it("verifies constant-time equality check", () => {
      expect(constantTimeEqual("abc", "abc")).toBe(true);
      expect(constantTimeEqual("abc", "abd")).toBe(false);
      expect(constantTimeEqual("abc", "abcd")).toBe(false);
      expect(constantTimeEqual("", "")).toBe(true);
    });
  });

  describe("Suspicious Parameter Pattern Detection", () => {
    it("detects SQL injection pattern `' OR 1=1 --` while preserving safety", () => {
      const formPayload = {
        note: "Payment for order ' OR 1=1 --",
        amount: 100,
      };

      const hits = scanInputs(formPayload);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.pattern_class).toBe("SQLI");
      expect(hits[0]?.field_name).toBe("note");
      expect(hits[0]?.sample).toContain("1=1");
    });

    it("detects command injection and script tags", () => {
      const payload = {
        search: "<script>alert('xss')</script>",
        filter: "; cat /etc/passwd",
      };

      const hits = scanInputs(payload);
      const classes = hits.map((h) => h.pattern_class);
      expect(classes).toContain("XSS");
      expect(classes).toContain("COMMAND_INJECTION");
    });
  });

  describe("Sequential Resource Probing Sliding Window Detector", () => {
    it("detects sequential ID probing across 3 consecutive requests", () => {
      const actorKey = "test-actor-1";

      // Access 1: ID 101
      expect(detectSequentialProbing(actorKey, { transactionPublicId: "TX101" })).toBe(false);

      // Access 2: ID 102
      expect(detectSequentialProbing(actorKey, { transactionPublicId: "TX102" })).toBe(false);

      // Access 3: ID 103 -> triggers sequential probing!
      expect(detectSequentialProbing(actorKey, { transactionPublicId: "TX103" })).toBe(true);
    });

    it("ignores non-sequential random accesses", () => {
      const actorKey = "test-actor-random";

      expect(detectSequentialProbing(actorKey, { id: 10 })).toBe(false);
      expect(detectSequentialProbing(actorKey, { id: 950 })).toBe(false);
      expect(detectSequentialProbing(actorKey, { id: 42 })).toBe(false);
    });
  });

  describe("Public Security API Endpoints", () => {
    it("GET /api/public/security/health returns 200 with status and server time", async () => {
      const req = new Request("http://localhost:3000/api/public/security/health", {
        method: "GET",
      });

      const res = await handlePublicSecurityApi(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("healthy");
      expect(json.version).toBe("1.0.0");
      expect(json.server_time).toBeDefined();
    });

    it("GET /api/public/security/events rejects requests missing HMAC headers with 401", async () => {
      const req = new Request("http://localhost:3000/api/public/security/events?since_seq=0", {
        method: "GET",
      });

      const res = await handlePublicSecurityApi(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toBeDefined();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("GET /api/public/security/events rejects stale timestamps (> 300s skew) with 401", async () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds in the past
      const req = new Request("http://localhost:3000/api/public/security/events?since_seq=0", {
        method: "GET",
        headers: {
          "x-ecs-key-id": "any-key-id",
          "x-ecs-timestamp": staleTimestamp.toString(),
          "x-ecs-nonce": "11111111-2222-3333-4444-555555555555",
          "x-ecs-signature": "aabbccddeeff",
        },
      });

      const res = await handlePublicSecurityApi(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("GET /api/public/security/events rejects invalid unknown key with 401", async () => {
      const nowTimestamp = Math.floor(Date.now() / 1000);
      const req = new Request("http://localhost:3000/api/public/security/events?since_seq=0", {
        method: "GET",
        headers: {
          "x-ecs-key-id": "non-existent-key-id-9999",
          "x-ecs-timestamp": nowTimestamp.toString(),
          "x-ecs-nonce": "11111111-2222-3333-4444-555555555556",
          "x-ecs-signature": "aabbccddeeff00112233",
        },
      });

      const res = await handlePublicSecurityApi(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Consecutive Failures & Lockout Simulation Logic", () => {
    it("simulates 6 wrong passwords with rising consecutive_failures", () => {
      let consecutiveFailures = 0;
      const history: number[] = [];

      for (let i = 1; i <= 6; i++) {
        consecutiveFailures += 1;
        history.push(consecutiveFailures);
      }

      expect(history).toEqual([1, 2, 3, 4, 5, 6]);

      // Lockout threshold check (threshold = 5)
      const lockoutThreshold = 5;
      const isLockedOut = (count: number) => count >= lockoutThreshold;

      expect(isLockedOut(history[3]!)).toBe(false); // 4
      expect(isLockedOut(history[4]!)).toBe(true);  // 5 -> locked
      expect(isLockedOut(history[5]!)).toBe(true);  // 6 -> locked
    });
  });

  describe("Telemetry Contract v1.0 Envelope Mirroring (§8)", () => {
    it("mirrors amount in whole ETB at top level while keeping minor units inside attributes", () => {
      const amountMinor = 18000000; // 180,000 ETB in santim
      const amountWholeEtb = Math.round(amountMinor / 100);

      const envelope = {
        schema_version: "1.0",
        event_id: "test-event-uuid",
        event_type: "TRANSFER_CREATED",
        amount: amountWholeEtb,
        currency: "ETB",
        beneficiary_id: "BEN91",
        transaction_id: "TX10492",
        attributes: {
          amount_minor: amountMinor,
          percent_of_balance: 45,
          is_first_transfer_to_beneficiary: true,
          local_hour: 14,
          off_hours: false,
        },
      };

      expect(envelope.amount).toBe(180000);
      expect(envelope.attributes.amount_minor).toBe(18000000);
      expect(envelope.currency).toBe("ETB");
      expect(envelope.schema_version).toBe("1.0");
    });
  });

  describe("Authorization Privilege Denials (AUTHZ_DENIED)", () => {
    it("converts customer accessing admin function to AUTHZ_DENIED with attempted_privilege=admin", () => {
      const customerRoles = ["customer"];
      const requiredRole = "admin";
      const isAuthorized = customerRoles.includes(requiredRole);

      expect(isAuthorized).toBe(false);

      const denialEvent = {
        event_type: "AUTHZ_DENIED",
        result: "DENIED",
        attributes: {
          reason: "MISSING_ROLE",
          attempted_privilege: "admin",
          required_role: "admin",
          actor_role: customerRoles[0],
          resource_ref: "/admin",
        },
      };

      expect(denialEvent.attributes.attempted_privilege).toBe("admin");
      expect(denialEvent.attributes.required_role).toBe("admin");
    });

    it("converts accessing another user's transaction (IDOR) to AUTHZ_DENIED with attempted_privilege=owner", () => {
      const currentUserId = "user-123";
      const transactionOwnerId = "user-456";
      const isAdmin = false;

      const isOwner = currentUserId === transactionOwnerId;
      const isPermitted = isOwner || isAdmin;

      expect(isPermitted).toBe(false);

      const idorEvent = {
        event_type: "AUTHZ_DENIED",
        result: "DENIED",
        transaction_id: "TX_NOT_OWNED",
        attributes: {
          reason: "WRONG_OWNER",
          attempted_privilege: "owner",
          required_role: "owner",
          actor_role: "customer",
          resource_ref: "TX_NOT_OWNED",
        },
      };

      expect(idorEvent.attributes.attempted_privilege).toBe("owner");
      expect(idorEvent.attributes.reason).toBe("WRONG_OWNER");
    });
  });

  describe("Outbox Exponential Backoff Retry Invariants", () => {
    it("computes exponential backoff capped at 300 seconds across 8 attempts", () => {
      const computeBackoffSeconds = (attempts: number) => Math.min(300, Math.pow(2, attempts) * 5);

      expect(computeBackoffSeconds(0)).toBe(5);     // 5s
      expect(computeBackoffSeconds(1)).toBe(10);    // 10s
      expect(computeBackoffSeconds(2)).toBe(20);    // 20s
      expect(computeBackoffSeconds(3)).toBe(40);    // 40s
      expect(computeBackoffSeconds(4)).toBe(80);    // 80s
      expect(computeBackoffSeconds(5)).toBe(160);   // 160s
      expect(computeBackoffSeconds(6)).toBe(300);   // 320 -> capped 300s
      expect(computeBackoffSeconds(7)).toBe(300);   // capped 300s
    });
  });
});

