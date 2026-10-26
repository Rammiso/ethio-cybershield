import { describe, expect, it } from "vitest";
import { registerCustomer } from "@/lib/auth.server";
import { createTransfer } from "@/lib/transfer.server";
import { depositCustomerFunds, listRegisteredCustomers } from "@/lib/employee.server";
import { lookupRegisteredRecipient } from "@/lib/customer.server";
import { type RequestContext } from "@/lib/telemetry.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function createMockContext(user?: { id: string; publicId: string; email: string }, roles: string[] = []): RequestContext {
  return {
    user: user ?? null,
    roles,
    device: null,
    session: null,
    ip: "127.0.0.1",
    userAgent: "HonorPayTest/1.0",
    fingerprintHash: "fp-test",
    requestId: "req-test-1",
  };
}

describe("HonorPay Mobile Banking & Teller Deposit Engine Tests", () => {
  it("registers a customer with 0.00 ETB initial balance", async () => {
    const ctx = createMockContext();
    const regResult = await registerCustomer(ctx, {
      fullName: "Almaz Ayana",
      email: `almaz.${Date.now()}@honorpay.test`,
      password: "Testbed#2026",
      phone: "+251911223344",
    });

    expect(regResult.ok).toBe(true);
    expect(ctx.user).toBeDefined();

    const { data: acc } = await supabaseAdmin
      .from("accounts")
      .select("balance_minor, currency, status, account_number")
      .eq("user_id", ctx.user!.id)
      .single();

    expect(acc).toBeDefined();
    expect(acc?.balance_minor).toBe(0);
    expect(acc?.currency).toBe("ETB");
    expect(acc?.status).toBe("ACTIVE");
    expect(acc?.account_number).toMatch(/^1000\d{6}$/);
  });

  it("blocks customer transfer when deposit balance is 0 ETB", async () => {
    const ctx = createMockContext();
    await registerCustomer(ctx, {
      fullName: "Kenenisa Bekele",
      email: `kenenisa.${Date.now()}@honorpay.test`,
      password: "Testbed#2026",
    });

    // Attempt to transfer 100 ETB with 0 deposit
    await expect(
      createTransfer(ctx, {
        recipientAccountNumber: "1000999999",
        amountEtb: 100,
      }),
    ).rejects.toThrow();
  });

  it("allows employee teller to deposit cash into registered customer account", async () => {
    const customerCtx = createMockContext();
    await registerCustomer(customerCtx, {
      fullName: "Derartu Tulu",
      email: `derartu.${Date.now()}@honorpay.test`,
      password: "Testbed#2026",
      phone: "+251922334455",
    });

    const { data: custAcc } = await supabaseAdmin
      .from("accounts")
      .select("id, account_number, balance_minor")
      .eq("user_id", customerCtx.user!.id)
      .single();

    expect(custAcc?.balance_minor).toBe(0);

    // Teller context
    const tellerCtx = createMockContext(
      { id: "u-teller-01", publicId: "U_TELLER_01", email: "teller@honorpay.et" },
      ["employee"],
    );

    // Process 5,000 ETB cash deposit
    const depRes = await depositCustomerFunds(tellerCtx, {
      customerAccountId: custAcc!.id,
      amountEtb: 5000,
      channel: "BRANCH_CASH",
      reference: "OTC-TEST-001",
      note: "Test branch cash credit",
    });

    expect(depRes.success).toBe(true);
    expect(depRes.depositAmountEtb).toBe(5000);
    expect(depRes.balanceAfterEtb).toBe(5000);

    // Check customer account in DB
    const { data: updatedAcc } = await supabaseAdmin
      .from("accounts")
      .select("balance_minor")
      .eq("id", custAcc!.id)
      .single();

    expect(updatedAcc?.balance_minor).toBe(500000); // 500,000 santim
  });

  it("rejects transfer to unregistered recipient account", async () => {
    const senderCtx = createMockContext();
    await registerCustomer(senderCtx, {
      fullName: "Haile Gebrselassie",
      email: `haile.${Date.now()}@honorpay.test`,
      password: "Testbed#2026",
    });

    // Credit sender with 2,000 ETB
    const { data: senderAcc } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", senderCtx.user!.id)
      .single();

    const tellerCtx = createMockContext(
      { id: "u-teller-01", publicId: "U_TELLER_01", email: "teller@honorpay.et" },
      ["employee"],
    );

    await depositCustomerFunds(tellerCtx, {
      customerAccountId: senderAcc!.id,
      amountEtb: 2000,
    });

    // Attempt transfer to fake unregistered account
    await expect(
      createTransfer(senderCtx, {
        recipientAccountNumber: "1000000000", // Nonexistent
        amountEtb: 500,
      }),
    ).rejects.toThrow(/not a registered HonorPay/);
  });

  it("executes transfer between registered customers and updates balances atomically", async () => {
    // 1. Create Sender
    const senderCtx = createMockContext();
    await registerCustomer(senderCtx, {
      fullName: "Tirunesh Dibaba",
      email: `tirunesh.${Date.now()}@honorpay.test`,
      password: "Testbed#2026",
    });

    // 2. Create Recipient
    const recipientCtx = createMockContext();
    await registerCustomer(recipientCtx, {
      fullName: "Sileshi Sihine",
      email: `sileshi.${Date.now()}@honorpay.test`,
      password: "Testbed#2026",
    });

    const { data: senderAcc } = await supabaseAdmin
      .from("accounts")
      .select("id, account_number")
      .eq("user_id", senderCtx.user!.id)
      .single();

    const { data: recipientAcc } = await supabaseAdmin
      .from("accounts")
      .select("id, account_number")
      .eq("user_id", recipientCtx.user!.id)
      .single();

    // 3. Teller credits sender with 10,000 ETB
    const tellerCtx = createMockContext(
      { id: "u-teller-01", publicId: "U_TELLER_01", email: "teller@honorpay.et" },
      ["employee"],
    );

    await depositCustomerFunds(tellerCtx, {
      customerAccountId: senderAcc!.id,
      amountEtb: 10000,
    });

    // 4. Verify lookup of recipient by account number
    const lookup = await lookupRegisteredRecipient(senderCtx, recipientAcc!.account_number);
    expect(lookup.found).toBe(true);
    expect(lookup.fullName).toBe("Sileshi Sihine");

    // 5. Transfer 3,500 ETB from Tirunesh to Sileshi
    const txRes = await createTransfer(senderCtx, {
      recipientAccountNumber: recipientAcc!.account_number,
      amountEtb: 3500,
      note: "Family allowance",
    });

    expect(txRes.transaction).toBeDefined();
    expect(txRes.transaction.status).toBe("COMPLETED");

    // 6. Verify sender balance: 10,000 - 3,500 = 6,500 ETB
    const { data: senderAfter } = await supabaseAdmin
      .from("accounts")
      .select("balance_minor")
      .eq("id", senderAcc!.id)
      .single();
    expect(senderAfter?.balance_minor).toBe(650000);

    // 7. Verify recipient balance: 0 + 3,500 = 3,500 ETB
    const { data: recipientAfter } = await supabaseAdmin
      .from("accounts")
      .select("balance_minor")
      .eq("id", recipientAcc!.id)
      .single();
    expect(recipientAfter?.balance_minor).toBe(350000);
  });

  it("blocks overdraft transfer exceeding available deposit balance", async () => {
    const senderCtx = createMockContext();
    await registerCustomer(senderCtx, {
      fullName: "Gudaf Tsegay",
      email: `gudaf.${Date.now()}@honorpay.test`,
      password: "Testbed#2026",
    });

    const recipientCtx = createMockContext();
    await registerCustomer(recipientCtx, {
      fullName: "Letesenbet Gidey",
      email: `letesenbet.${Date.now()}@honorpay.test`,
      password: "Testbed#2026",
    });

    const { data: senderAcc } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", senderCtx.user!.id)
      .single();

    const { data: recipientAcc } = await supabaseAdmin
      .from("accounts")
      .select("account_number")
      .eq("user_id", recipientCtx.user!.id)
      .single();

    // Teller deposits 500 ETB
    const tellerCtx = createMockContext(
      { id: "u-teller-01", publicId: "U_TELLER_01", email: "teller@honorpay.et" },
      ["employee"],
    );
    await depositCustomerFunds(tellerCtx, {
      customerAccountId: senderAcc!.id,
      amountEtb: 500,
    });

    // Attempt to transfer 600 ETB (exceeds 500 deposit)
    await expect(
      createTransfer(senderCtx, {
        recipientAccountNumber: recipientAcc!.account_number,
        amountEtb: 600,
      }),
    ).rejects.toThrow(/Insufficient/);
  });

  it("allows teller to list registered customers and fetch recent branch deposits without error", async () => {
    const tellerCtx = createMockContext(
      { id: "u-teller-01", publicId: "U_TELLER_01", email: "teller@honorpay.et" },
      ["employee"],
    );

    const customers = await listRegisteredCustomers(tellerCtx);
    expect(Array.isArray(customers)).toBe(true);
    expect(customers.length).toBeGreaterThan(0);

    const first = customers[0]!;
    expect(first.accountId).toBeDefined();
    expect(first.accountNumber).toMatch(/^1000\d{6}$/);
    expect(typeof first.balanceEtb).toBe("number");

    const { getRecentDeposits } = await import("@/lib/employee.server");
    const deposits = await getRecentDeposits(tellerCtx, 10);
    expect(Array.isArray(deposits)).toBe(true);
  });

  it("registers customer by teller with must_change_password flag, enables search autocomplete, and enforces first-login password change", async () => {
    const tellerCtx = createMockContext(
      { id: "u-teller-01", publicId: "U_TELLER_01", email: "teller@honorpay.et" },
      ["employee"],
    );

    const { registerCustomerByTeller, searchRegisteredCustomer } = await import("@/lib/employee.server");
    const { performLogin } = await import("@/lib/auth.server");
    const { forceChangePassword } = await import("@/lib/customer.server");

    const email = `kumsa.${Date.now()}@honorpay.test`;
    const regRes = await registerCustomerByTeller(tellerCtx, {
      fullName: "Kumsa Abera",
      email,
      phone: "+251912345678",
      initialPassword: "TempPassword#2026",
    });

    expect(regRes.accountId).toBeDefined();
    expect(regRes.accountNumber).toMatch(/^1000\d{6}$/);
    expect(regRes.fullName).toBe("Kumsa Abera");
    expect(regRes.mustChangePassword).toBe(true);
    expect(regRes.initialPassword).toBe("TempPassword#2026");

    // Test live search autocomplete matching letters
    const matchByName = await searchRegisteredCustomer(tellerCtx, "kumsa");
    expect(matchByName).toBeDefined();
    expect(matchByName?.email).toBe(email);

    const matchByAcc = await searchRegisteredCustomer(tellerCtx, regRes.accountNumber.slice(4, 9));
    expect(matchByAcc).toBeDefined();
    expect(matchByAcc?.accountId).toBe(regRes.accountId);

    // Test search matching Ethiopian phone starting with 09 (even though stored as +2519...)
    const matchBy09Phone = await searchRegisteredCustomer(tellerCtx, "0912345678");
    expect(matchBy09Phone).toBeDefined();
    expect(matchBy09Phone?.email).toBe(email);

    // Test transfer recipient lookup matching phone starting with 09
    const recipientLookup = await lookupRegisteredRecipient(tellerCtx, "0912345678");
    expect(recipientLookup.found).toBe(true);
    expect(recipientLookup.accountNumber).toBe(regRes.accountNumber);

    // Customer logs in for the first time using their mobile phone number (0912345678)
    const loginCtx = createMockContext();
    const loginRes = await performLogin(loginCtx, "0912345678", "TempPassword#2026");
    expect(loginRes.ok).toBe(true);
    if (loginRes.ok) {
      expect(loginRes.mustChangePassword).toBe(true);
    }

    // Customer transfer is blocked because password change is required
    await expect(
      createTransfer(loginCtx, {
        recipientAccountNumber: "1000999999",
        amountEtb: 50,
      }),
    ).rejects.toThrow(/password/i);

    // Customer changes password
    const changeRes = await forceChangePassword(loginCtx, {
      currentPassword: "TempPassword#2026",
      newPassword: "NewSecretPassword#2026",
    });
    expect(changeRes.ok).toBe(true);
    expect(changeRes.mustChangePassword).toBe(false);
    expect(changeRes.access_token).toBeDefined();
    expect(changeRes.sessionPublicId).toBeDefined();

    // Profile now has must_change_password = false
    const { data: profAfter } = await supabaseAdmin
      .from("profiles")
      .select("must_change_password")
      .eq("user_id", loginCtx.user!.id)
      .single();
    expect(profAfter?.must_change_password).toBe(false);

    // Login with new password succeeds and mustChangePassword is false
    const reloginCtx = createMockContext();
    const reloginRes = await performLogin(reloginCtx, email, "NewSecretPassword#2026");
    expect(reloginRes.ok).toBe(true);
    if (reloginRes.ok) {
      expect(reloginRes.mustChangePassword).toBe(false);
    }

    // Subsequent logout and third relogin still has mustChangePassword === false
    const thirdLoginCtx = createMockContext();
    const thirdLoginRes = await performLogin(thirdLoginCtx, "0912345678", "NewSecretPassword#2026");
    expect(thirdLoginRes.ok).toBe(true);
    if (thirdLoginRes.ok) {
      expect(thirdLoginRes.mustChangePassword).toBe(false);
    }
  });

  it("allows customer login with default registration password Welcome@2026 and phone number starting with 09", async () => {
    const tellerCtx = createMockContext(
      { id: "u-teller-01", publicId: "U_TELLER_01", email: "teller@honorpay.et" },
      ["employee"],
    );
    const { registerCustomerByTeller } = await import("@/lib/employee.server");
    const { performLogin } = await import("@/lib/auth.server");
    const { forceChangePassword } = await import("@/lib/customer.server");

    const email = `defaultpass.${Date.now()}@honorpay.test`;
    const reg = await registerCustomerByTeller(tellerCtx, {
      fullName: "Girma Benti",
      email,
      phone: "+251988776655",
      initialPassword: "Welcome@2026",
    });

    expect(reg.initialPassword).toBe("Welcome@2026");

    // Login using phone starting with 09 and default password Welcome@2026
    const loginCtx = createMockContext();
    const loginRes = await performLogin(loginCtx, "0988776655", "Welcome@2026");
    expect(loginRes.ok).toBe(true);
    if (loginRes.ok) {
      expect(loginRes.mustChangePassword).toBe(true);
    }

    // Changing password with Welcome@2026 succeeds
    const changeRes = await forceChangePassword(loginCtx, {
      currentPassword: "Welcome@2026",
      newPassword: "PersonalSecret@2026",
    });
    expect(changeRes.ok).toBe(true);

    // Relogin with new password succeeds
    const relogin = await performLogin(createMockContext(), "0988776655", "PersonalSecret@2026");
    expect(relogin.ok).toBe(true);
  });

  it("validates phone numbers and SQL injection attacks in LoginInputSchema and triggers SQLI telemetry", async () => {
    const { LoginInputSchema } = await import("@/lib/auth.functions");
    const { scanInputs } = await import("@/lib/telemetry.server");

    // 1. Phone number starting with 09 parses cleanly without error
    const phoneValid = LoginInputSchema.safeParse({
      email: "0911223344",
      password: "Welcome@2026",
    });
    expect(phoneValid.success).toBe(true);

    // 2. 10-digit account number parses cleanly
    const accValid = LoginInputSchema.safeParse({
      email: "1000112233",
      password: "Testbed#2026",
    });
    expect(accValid.success).toBe(true);

    // 3. Various SQL injection attempts parse through schema to reach telemetry
    const sqliPayloads = [
      "' OR 1=1 --",
      "' OR '1'='1",
      "admin' --",
      "chaltu@honorpay.et' OR 1=1 --",
      "1' UNION SELECT 1,2,3 --",
    ];

    for (const payload of sqliPayloads) {
      const parsed = LoginInputSchema.safeParse({
        email: payload,
        password: "any-password",
      });
      expect(parsed.success).toBe(true);

      const hits = scanInputs({ email: payload });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.some((h) => h.pattern_class === "SQLI")).toBe(true);
    }
  });
});
