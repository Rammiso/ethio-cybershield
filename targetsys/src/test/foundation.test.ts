import { describe, expect, it } from "vitest";
import { RegisterInputSchema, LoginInputSchema } from "@/lib/auth.functions";
import { scanInputs, sha256Hex } from "@/lib/telemetry.server";
import { deviceLabel } from "@/lib/auth.server";

describe("Prompt 1 Foundation Unit Tests", () => {
  describe("Zod Validation Schemas", () => {
    it("validates correct login credentials", () => {
      const valid = LoginInputSchema.safeParse({
        email: "amina@shieldbank.test",
        password: "Testbed#2026",
      });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid login emails", () => {
      const invalid = LoginInputSchema.safeParse({
        email: "not-an-email",
        password: "password123",
      });
      expect(invalid.success).toBe(false);
    });

    it("rejects short passwords on register", () => {
      const invalid = RegisterInputSchema.safeParse({
        email: "newuser@shieldbank.test",
        password: "123",
        fullName: "New User",
      });
      expect(invalid.success).toBe(false);
    });

    it("validates correct register inputs", () => {
      const valid = RegisterInputSchema.safeParse({
        email: "newuser@shieldbank.test",
        password: "StrongPassword123!",
        fullName: "Abebe Bikila",
        phone: "+251911223344",
      });
      expect(valid.success).toBe(true);
    });
  });

  describe("Suspicious Parameter Scanning", () => {
    it("detects SQL injection patterns", () => {
      const hits = scanInputs({ query: "' OR 1=1 --" });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.pattern_class).toBe("SQLI");
    });

    it("detects XSS patterns", () => {
      const hits = scanInputs({ comment: "<script>alert('xss')</script>" });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.pattern_class).toBe("XSS");
    });

    it("detects path traversal patterns", () => {
      const hits = scanInputs({ file: "../../etc/passwd" });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.pattern_class).toBe("PATH_TRAVERSAL");
    });

    it("detects command injection patterns", () => {
      const hits = scanInputs({ cmd: "; cat /etc/passwd" });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.pattern_class).toBe("COMMAND_INJECTION");
    });

    it("ignores sensitive fields like password", () => {
      const hits = scanInputs({ password: "' OR 1=1 --" });
      expect(hits.length).toBe(0);
    });
  });

  describe("Device Identification & Crypto", () => {
    it("formats device label from user agent", () => {
      const macChrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 Chrome/121.0.0.0";
      expect(deviceLabel(macChrome)).toBe("Chrome on macOS");

      const androidChrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0";
      expect(deviceLabel(androidChrome)).toBe("Chrome on Android");

      const iosSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
      expect(deviceLabel(iosSafari)).toBe("Safari on iOS");
    });

    it("computes deterministic SHA-256 hex digests with Web Crypto", async () => {
      const hash1 = await sha256Hex("test-device-id|Mozilla/5.0");
      const hash2 = await sha256Hex("test-device-id|Mozilla/5.0");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });
});
