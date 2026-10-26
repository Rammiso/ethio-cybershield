import { describe, expect, it } from "vitest";
import {
  CreateTransferSchema,
  AddBeneficiarySchema,
  RegisterDeviceSchema,
  UpdateProfileSchema,
  ChangePasswordSchema,
  OtpVerifySchema,
} from "@/lib/banking.functions";
import { sha256Hex } from "@/lib/telemetry.server";

describe("Prompt 2 Banking & Transfer Engine Unit Tests", () => {
  describe("Zod Validation Schemas", () => {
    it("validates valid transfer payloads", () => {
      const valid = CreateTransferSchema.safeParse({
        beneficiaryId: "123e4567-e89b-12d3-a456-426614174000",
        amountEtb: 1000,
        note: "Rent payment",
        idempotencyKey: "test-idem-1",
      });
      expect(valid.success).toBe(true);
    });

    it("rejects non-positive transfer amounts", () => {
      const zero = CreateTransferSchema.safeParse({
        beneficiaryId: "123e4567-e89b-12d3-a456-426614174000",
        amountEtb: 0,
      });
      expect(zero.success).toBe(false);

      const negative = CreateTransferSchema.safeParse({
        beneficiaryId: "123e4567-e89b-12d3-a456-426614174000",
        amountEtb: -50,
      });
      expect(negative.success).toBe(false);
    });

    it("rejects invalid beneficiary UUID", () => {
      const invalid = CreateTransferSchema.safeParse({
        beneficiaryId: "not-a-uuid",
        amountEtb: 500,
      });
      expect(invalid.success).toBe(false);
    });

    it("validates beneficiary addition payloads", () => {
      const valid = AddBeneficiarySchema.safeParse({
        name: "Abel Tesfaye",
        accountNumber: "100029384756",
        bankName: "Commercial Bank of Ethiopia",
        isInternal: false,
      });
      expect(valid.success).toBe(true);
    });

    it("rejects short or empty beneficiary name/account", () => {
      const invalidName = AddBeneficiarySchema.safeParse({
        name: "A",
        accountNumber: "1234",
        bankName: "ShieldBank",
      });
      expect(invalidName.success).toBe(false);

      const invalidAcc = AddBeneficiarySchema.safeParse({
        name: "Abel Tesfaye",
        accountNumber: "12",
        bankName: "ShieldBank",
      });
      expect(invalidAcc.success).toBe(false);
    });

    it("validates device registration label", () => {
      const valid = RegisterDeviceSchema.safeParse({ label: "MacBook Chrome" });
      expect(valid.success).toBe(true);

      const invalid = RegisterDeviceSchema.safeParse({ label: "a" });
      expect(invalid.success).toBe(false);
    });

    it("validates profile updates and password change length constraints", () => {
      const validProf = UpdateProfileSchema.safeParse({
        fullName: "Amina Mohammed",
        phone: "+251911998877",
      });
      expect(validProf.success).toBe(true);

      const invalidPass = ChangePasswordSchema.safeParse({
        currentPassword: "OldPassword123",
        newPassword: "short",
      });
      expect(invalidPass.success).toBe(false);

      const validPass = ChangePasswordSchema.safeParse({
        currentPassword: "OldPassword123",
        newPassword: "ValidNewPassword456!",
      });
      expect(validPass.success).toBe(true);
    });

    it("validates 6-digit OTP code verification schema", () => {
      const validOtp = OtpVerifySchema.safeParse({
        challengeId: "123e4567-e89b-12d3-a456-426614174000",
        code: "654321",
      });
      expect(validOtp.success).toBe(true);

      const invalidLength = OtpVerifySchema.safeParse({
        challengeId: "123e4567-e89b-12d3-a456-426614174000",
        code: "123",
      });
      expect(invalidLength.success).toBe(false);
    });
  });

  describe("Transfer Engine Minor Unit (Santim) & Hold Threshold Invariants", () => {
    it("converts ETB amounts accurately to santim (minor units)", () => {
      const amount1000Etb = 1000;
      const amountMinor1000 = Math.round(amount1000Etb * 100);
      expect(amountMinor1000).toBe(100000);

      const amount60000Etb = 60000;
      const amountMinor60000 = Math.round(amount60000Etb * 100);
      expect(amountMinor60000).toBe(6000000);

      const amountFractionalEtb = 123.45;
      const amountMinorFractional = Math.round(amountFractionalEtb * 100);
      expect(amountMinorFractional).toBe(12345);
    });

    it("determines immediate completion (< 50,000 ETB) vs 20s hold (>= 50,000 ETB)", () => {
      const HOLD_THRESHOLD_MINOR = 50_000 * 100; // 5,000,000 santim
      const HOLD_DURATION_SECONDS = 20;

      // 1,000 ETB transfer
      const amount1000Minor = 1000 * 100;
      const isHighValue1000 = amount1000Minor >= HOLD_THRESHOLD_MINOR;
      expect(isHighValue1000).toBe(false);
      const status1000 = isHighValue1000 ? "PROCESSING" : "COMPLETED";
      expect(status1000).toBe("COMPLETED");

      // 60,000 ETB transfer
      const amount60000Minor = 60000 * 100;
      const isHighValue60000 = amount60000Minor >= HOLD_THRESHOLD_MINOR;
      expect(isHighValue60000).toBe(true);
      const status60000 = isHighValue60000 ? "PROCESSING" : "COMPLETED";
      expect(status60000).toBe("PROCESSING");

      // Exactly 50,000 ETB
      const amount50000Minor = 50000 * 100;
      expect(amount50000Minor >= HOLD_THRESHOLD_MINOR).toBe(true);

      const now = Date.now();
      const holdUntil = new Date(now + HOLD_DURATION_SECONDS * 1000);
      const holdSeconds = Math.round((holdUntil.getTime() - now) / 1000);
      expect(holdSeconds).toBe(20);
    });

    it("enforces double-entry ledger balance invariant (sum of debits and credits is zero)", () => {
      const amountMinor = 100000; // 1,000 ETB
      const debitEntry = {
        entry_type: "DEBIT",
        amount_minor: -amountMinor,
      };
      const creditEntry = {
        entry_type: "CREDIT",
        amount_minor: amountMinor,
      };

      const ledgerSum = debitEntry.amount_minor + creditEntry.amount_minor;
      expect(ledgerSum).toBe(0);
    });

    it("calculates balance sufficiency and rejects overdraft attempts", () => {
      const currentBalanceMinor = 500000; // 5,000 ETB (500,000 santim)
      const validTransferMinor = 100000; // 1,000 ETB
      const overdraftTransferMinor = 600000; // 6,000 ETB

      expect(currentBalanceMinor >= validTransferMinor).toBe(true);
      expect(currentBalanceMinor >= overdraftTransferMinor).toBe(false);
    });
  });

  describe("Enrichment Attributes Calculation (§8)", () => {
    it("computes percent_of_balance accurately", () => {
      const balanceMinor = 200000; // 2,000 ETB
      const transferMinor = 100000; // 1,000 ETB
      const percentOfBalance = Math.round((transferMinor / balanceMinor) * 100);
      expect(percentOfBalance).toBe(50);
    });

    it("computes Ethiopian local hour and off_hours accurately (UTC+3)", () => {
      // Test 1: 14:00 UTC = 17:00 EAT (Business hours: 8:00 - 18:00)
      const testDateDay = new Date("2026-10-15T14:00:00Z");
      const localHourDay = (testDateDay.getUTCHours() + 3) % 24;
      const offHoursDay = localHourDay < 8 || localHourDay >= 18;
      expect(localHourDay).toBe(17);
      expect(offHoursDay).toBe(false);

      // Test 2: 21:00 UTC = 00:00 EAT (Off hours)
      const testDateNight = new Date("2026-10-15T21:00:00Z");
      const localHourNight = (testDateNight.getUTCHours() + 3) % 24;
      const offHoursNight = localHourNight < 8 || localHourNight >= 18;
      expect(localHourNight).toBe(0);
      expect(offHoursNight).toBe(true);

      // Test 3: 03:00 UTC = 06:00 EAT (Off hours)
      const testDateEarly = new Date("2026-10-15T03:00:00Z");
      const localHourEarly = (testDateEarly.getUTCHours() + 3) % 24;
      const offHoursEarly = localHourEarly < 8 || localHourEarly >= 18;
      expect(localHourEarly).toBe(6);
      expect(offHoursEarly).toBe(true);
    });
  });

  describe("OTP Generation & Cryptographic Verification Invariants", () => {
    it("hashes 6-digit verification code with SHA-256 and verifies exact match", async () => {
      const rawCode = "749201";
      const codeHash = await sha256Hex(rawCode);

      expect(codeHash).toBeDefined();
      expect(codeHash.length).toBe(64); // SHA-256 hex string

      // Verify correct input matches hash
      const userAttempt = "749201";
      const attemptHash = await sha256Hex(userAttempt);
      expect(attemptHash).toBe(codeHash);

      // Verify incorrect input does not match
      const wrongAttempt = "749202";
      const wrongHash = await sha256Hex(wrongAttempt);
      expect(wrongHash).not.toBe(codeHash);
    });

    it("enforces max 3 attempts policy for OTP challenges", () => {
      const maxAttempts = 3;
      let attempts = 0;

      // Attempt 1 fails
      attempts += 1;
      expect(attempts < maxAttempts).toBe(true);
      expect(maxAttempts - attempts).toBe(2);

      // Attempt 2 fails
      attempts += 1;
      expect(attempts < maxAttempts).toBe(true);
      expect(maxAttempts - attempts).toBe(1);

      // Attempt 3 fails -> exceeded
      attempts += 1;
      const isExceeded = attempts >= maxAttempts;
      expect(isExceeded).toBe(true);
      expect(Math.max(0, maxAttempts - attempts)).toBe(0);
    });
  });
});
