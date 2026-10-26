import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTelemetry } from "./telemetry.middleware";

export const CreateTransferSchema = z
  .object({
    beneficiaryId: z.string().uuid("Invalid beneficiary ID").optional().nullable(),
    recipientAccountNumber: z.string().trim().min(3).max(50).optional().nullable(),
    amountEtb: z.number().positive("Amount must be greater than zero"),
    note: z.string().max(200).optional().nullable(),
    idempotencyKey: z.string().max(100).optional().nullable(),
    otpChallengeId: z.string().uuid().optional().nullable(),
  })
  .refine((data) => !!data.beneficiaryId || !!data.recipientAccountNumber, {
    message: "Either a beneficiaryId or recipientAccountNumber is required",
  });

export const DepositFundsSchema = z.object({
  customerAccountId: z.string().trim().min(1, "Customer account identifier is required"),
  amountEtb: z.number().positive("Deposit amount must be greater than zero"),
  channel: z.string().trim().max(50).optional(),
  reference: z.string().trim().max(50).optional(),
  note: z.string().trim().max(200).optional().nullable(),
});

export const AddBeneficiarySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  accountNumber: z.string().trim().min(4, "Account number must be at least 4 digits").max(50),
  bankName: z.string().trim().min(2, "Bank name is required").max(100),
  isInternal: z.boolean().default(false),
  otpChallengeId: z.string().uuid().optional().nullable(),
});

export const RegisterDeviceSchema = z.object({
  label: z.string().trim().min(2, "Device label required").max(100),
});

export const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  otpChallengeId: z.string().uuid().optional().nullable(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  otpChallengeId: z.string().uuid().optional().nullable(),
});

export const ForceChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current temporary password required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const RegisterCustomerByTellerSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  email: z.string().trim().email("Valid email address is required"),
  phone: z.string().trim().max(30).optional().nullable(),
  initialPassword: z.string().min(8, "Initial password must be at least 8 characters").optional(),
});

export const OtpRequestSchema = z.object({
  purpose: z.enum(["LOGIN_NEW_DEVICE", "STEP_UP", "TRANSFER"]),
});

export const OtpVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(6).max(6),
});

/**
 * createTransferFn: creates and executes transfer (instant or PROCESSING hold countdown).
 */
export const createTransferFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => CreateTransferSchema.parse(data))
  .middleware([withTelemetry("createTransfer", { sensitive: true })])
  .handler(async ({ data, context }) => {
    const { createTransfer } = await import("./transfer.server");
    return await createTransfer(context.tctx, data);
  });

/**
 * getCustomerTransactionsFn: retrieves transaction history with filters.
 */
export const getCustomerTransactionsFn = createServerFn({ method: "GET" })
  .validator((params: unknown) =>
    z
      .object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
      })
      .parse(params ?? {}),
  )
  .middleware([withTelemetry("getCustomerTransactions")])
  .handler(async ({ data, context }) => {
    const { getCustomerTransactions } = await import("./transfer.server");
    return await getCustomerTransactions(context.tctx, data);
  });

/**
 * getTransactionDetailFn: retrieves transaction detail, status timeline, and ledger entries.
 */
export const getTransactionDetailFn = createServerFn({ method: "GET" })
  .validator((params: unknown) => z.object({ transactionPublicId: z.string() }).parse(params))
  .middleware([withTelemetry("getTransactionDetail")])
  .handler(async ({ data, context }) => {
    const { getTransactionDetail } = await import("./transfer.server");
    return await getTransactionDetail(context.tctx, data.transactionPublicId);
  });

/**
 * pollTransferStatusFn: polls status for a processing transfer and lazily triggers settlement.
 */
export const pollTransferStatusFn = createServerFn({ method: "GET" })
  .validator((params: unknown) => z.object({ transactionPublicId: z.string() }).parse(params))
  .middleware([withTelemetry("pollTransferStatus")])
  .handler(async ({ data, context }) => {
    const { getTransactionDetail } = await import("./transfer.server");
    return await getTransactionDetail(context.tctx, data.transactionPublicId);
  });

/**
 * Beneficiaries RPCs
 */
export const getBeneficiariesFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getBeneficiaries")])
  .handler(async ({ context }) => {
    const { getBeneficiaries } = await import("./customer.server");
    return await getBeneficiaries(context.tctx);
  });

export const addBeneficiaryFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => AddBeneficiarySchema.parse(data))
  .middleware([withTelemetry("addBeneficiary")])
  .handler(async ({ data, context }) => {
    const { addBeneficiary } = await import("./customer.server");
    return await addBeneficiary(context.tctx, data);
  });

export const removeBeneficiaryFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ beneficiaryPublicId: z.string() }).parse(data))
  .middleware([withTelemetry("removeBeneficiary")])
  .handler(async ({ data, context }) => {
    const { removeBeneficiary } = await import("./customer.server");
    return await removeBeneficiary(context.tctx, data.beneficiaryPublicId);
  });

/**
 * Devices RPCs
 */
export const getDevicesFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getDevices")])
  .handler(async ({ context }) => {
    const { getDevices } = await import("./customer.server");
    return await getDevices(context.tctx);
  });

export const registerDeviceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => RegisterDeviceSchema.parse(data))
  .middleware([withTelemetry("registerDevice")])
  .handler(async ({ data, context }) => {
    const { registerDevice } = await import("./customer.server");
    return await registerDevice(context.tctx, data.label);
  });

export const removeDeviceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ devicePublicId: z.string() }).parse(data))
  .middleware([withTelemetry("removeDevice")])
  .handler(async ({ data, context }) => {
    const { removeDevice } = await import("./customer.server");
    return await removeDevice(context.tctx, data.devicePublicId);
  });

/**
 * Sessions RPCs
 */
export const getSessionsFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getSessions")])
  .handler(async ({ context }) => {
    const { getSessions } = await import("./customer.server");
    return await getSessions(context.tctx);
  });

export const revokeSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ sessionPublicId: z.string() }).parse(data))
  .middleware([withTelemetry("revokeSession")])
  .handler(async ({ data, context }) => {
    const { revokeCustomerSession } = await import("./customer.server");
    return await revokeCustomerSession(context.tctx, data.sessionPublicId);
  });

/**
 * Profile & Password RPCs
 */
export const getProfileDetailsFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getProfileDetails")])
  .handler(async ({ context }) => {
    const { getProfileDetails } = await import("./customer.server");
    return await getProfileDetails(context.tctx);
  });

export const updateCustomerProfileFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => UpdateProfileSchema.parse(data))
  .middleware([withTelemetry("updateCustomerProfile")])
  .handler(async ({ data, context }) => {
    const { updateCustomerProfile } = await import("./customer.server");
    return await updateCustomerProfile(context.tctx, data);
  });

export const changeCustomerPasswordFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ChangePasswordSchema.parse(data))
  .middleware([withTelemetry("changeCustomerPassword", { sensitive: true })])
  .handler(async ({ data, context }) => {
    const { changeCustomerPassword } = await import("./customer.server");
    return await changeCustomerPassword(context.tctx, data);
  });

export const forceChangePasswordFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => ForceChangePasswordSchema.parse(data))
  .middleware([withTelemetry("forceChangePassword", { sensitive: true })])
  .handler(async ({ data, context }) => {
    const { forceChangePassword } = await import("./customer.server");
    return await forceChangePassword(context.tctx, data);
  });

/**
 * OTP Challenges & Simulated SMS
 */
export const requestOtpChallengeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => OtpRequestSchema.parse(data))
  .middleware([withTelemetry("requestOtpChallenge")])
  .handler(async ({ data, context }) => {
    const { createOtpChallenge } = await import("./otp.server");
    return await createOtpChallenge(context.tctx, data.purpose);
  });

export const verifyOtpChallengeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => OtpVerifySchema.parse(data))
  .middleware([withTelemetry("verifyOtpChallenge")])
  .handler(async ({ data, context }) => {
    const { verifyOtpChallenge } = await import("./otp.server");
    return await verifyOtpChallenge(context.tctx, data.challengeId, data.code);
  });

export const getSimulatedSmsInboxFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getSimulatedSmsInbox")])
  .handler(async ({ context }) => {
    const { getSimulatedSmsInbox } = await import("./otp.server");
    return await getSimulatedSmsInbox(context.tctx);
  });

/**
 * Recipient Lookup for Mobile Banking Transfer Verification
 */
export const lookupRegisteredRecipientFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ query: z.string().trim().min(1) }).parse(data))
  .middleware([withTelemetry("lookupRecipient")])
  .handler(async ({ data, context }) => {
    const { lookupRegisteredRecipient } = await import("./customer.server");
    return await lookupRegisteredRecipient(context.tctx, data.query);
  });

/**
 * Employee & Teller Deposit Portal RPCs
 */
export const listRegisteredCustomersFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("listRegisteredCustomers")])
  .handler(async ({ context }) => {
    const { listRegisteredCustomers } = await import("./employee.server");
    return await listRegisteredCustomers(context.tctx);
  });

export const depositCustomerFundsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => DepositFundsSchema.parse(data))
  .middleware([withTelemetry("depositCustomerFunds", { sensitive: true })])
  .handler(async ({ data, context }) => {
    const { depositCustomerFunds } = await import("./employee.server");
    return await depositCustomerFunds(context.tctx, data);
  });

export const getRecentDepositsFn = createServerFn({ method: "GET" })
  .validator((params: unknown) => z.object({ limit: z.number().optional() }).parse(params ?? {}))
  .middleware([withTelemetry("getRecentDeposits")])
  .handler(async ({ data, context }) => {
    const { getRecentDeposits } = await import("./employee.server");
    return await getRecentDeposits(context.tctx, data.limit ?? 20);
  });

export const registerCustomerByTellerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => RegisterCustomerByTellerSchema.parse(data))
  .middleware([withTelemetry("registerCustomerByTeller", { sensitive: true })])
  .handler(async ({ data, context }) => {
    const { registerCustomerByTeller } = await import("./employee.server");
    return await registerCustomerByTeller(context.tctx, data);
  });
