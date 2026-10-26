import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTelemetry } from "./telemetry.middleware";

export const SaveOutboundConfigSchema = z.object({
  ecs_base_url: z.string().url("Must be a valid URL").or(z.literal("")).optional().nullable(),
  delivery_enabled: z.boolean().default(false),
  key_id: z.string().optional().nullable(),
  secret: z.string().optional().nullable(),
});

export const CreateInboundKeySchema = z.object({
  label: z.string().trim().min(2, "Label required").max(100),
  scopes: z.array(z.string()).min(1, "Select at least one scope"),
  ip_allowlist: z.array(z.string()).optional().nullable(),
});

export const RevokeInboundKeySchema = z.object({
  keyId: z.string(),
});

export const RotateInboundKeySchema = z.object({
  keyId: z.string(),
});

export const RevertActionSchema = z.object({
  controlActionId: z.string().uuid(),
  reason: z.string().optional(),
});

// Outbound Config RPCs
export const getOutboundConfigFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getOutboundConfig")])
  .handler(async ({ context }) => {
    const { getOutboundConfig } = await import("./admin.server");
    return await getOutboundConfig(context.tctx);
  });

export const saveOutboundConfigFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => SaveOutboundConfigSchema.parse(data))
  .middleware([withTelemetry("saveOutboundConfig", { sensitive: true })])
  .handler(async ({ data, context }) => {
    const { saveOutboundConfig } = await import("./admin.server");
    return await saveOutboundConfig(context.tctx, data);
  });

export const sendTestEventFn = createServerFn({ method: "POST" })
  .middleware([withTelemetry("sendTestEvent")])
  .handler(async ({ context }) => {
    const { sendTestEvent } = await import("./admin.server");
    return await sendTestEvent(context.tctx);
  });

export const checkEcsHealthFn = createServerFn({ method: "POST" })
  .middleware([withTelemetry("checkEcsHealth")])
  .handler(async ({ context }) => {
    const { checkEcsHealth } = await import("./admin.server");
    return await checkEcsHealth(context.tctx);
  });

export const retryOutboxEventsFn = createServerFn({ method: "POST" })
  .middleware([withTelemetry("retryOutboxEvents")])
  .handler(async ({ context }) => {
    const { retryOutboxEvents } = await import("./admin.server");
    return await retryOutboxEvents(context.tctx);
  });

// Inbound Keys RPCs
export const getInboundKeysFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getInboundKeys")])
  .handler(async ({ context }) => {
    const { getInboundKeys } = await import("./admin.server");
    return await getInboundKeys(context.tctx);
  });

export const createInboundKeyFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => CreateInboundKeySchema.parse(data))
  .middleware([withTelemetry("createInboundKey", { sensitive: true })])
  .handler(async ({ data, context }) => {
    const { createInboundKey } = await import("./admin.server");
    return await createInboundKey(context.tctx, data);
  });

export const revokeInboundKeyFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => RevokeInboundKeySchema.parse(data))
  .middleware([withTelemetry("revokeInboundKey")])
  .handler(async ({ data, context }) => {
    const { revokeInboundKey } = await import("./admin.server");
    return await revokeInboundKey(context.tctx, data.keyId);
  });

export const rotateInboundKeyFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => RotateInboundKeySchema.parse(data))
  .middleware([withTelemetry("rotateInboundKey", { sensitive: true })])
  .handler(async ({ data, context }) => {
    const { rotateInboundKey } = await import("./admin.server");
    return await rotateInboundKey(context.tctx, data.keyId);
  });

// Control Actions RPCs
export const getControlActionsFn = createServerFn({ method: "GET" })
  .validator((params: unknown) =>
    z
      .object({
        limit: z.number().optional(),
        offset: z.number().optional(),
      })
      .parse(params ?? {}),
  )
  .middleware([withTelemetry("getControlActions")])
  .handler(async ({ data, context }) => {
    const { getControlActions } = await import("./admin.server");
    return await getControlActions(context.tctx, data);
  });

export const revertActionAdminFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => RevertActionSchema.parse(data))
  .middleware([withTelemetry("revertActionAdmin")])
  .handler(async ({ data, context }) => {
    const { revertActionAdmin } = await import("./admin.server");
    return await revertActionAdmin(context.tctx, data.controlActionId, data.reason);
  });

// ===== Prompt 5 Dashboard Server Functions =====

export const getAdminOverviewFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getAdminOverview")])
  .handler(async ({ context }) => {
    const { getAdminOverview } = await import("./admin.server");
    return await getAdminOverview(context.tctx);
  });

export const getLiveSecurityEventsFn = createServerFn({ method: "GET" })
  .validator((params: unknown) =>
    z.object({ limit: z.number().optional() }).parse(params ?? {}),
  )
  .middleware([withTelemetry("getLiveSecurityEvents")])
  .handler(async ({ data, context }) => {
    const { getLiveSecurityEvents } = await import("./admin.server");
    return await getLiveSecurityEvents(context.tctx, data.limit);
  });

export const getAdminCustomersFn = createServerFn({ method: "GET" })
  .validator((params: unknown) =>
    z.object({ search: z.string().optional() }).parse(params ?? {}),
  )
  .middleware([withTelemetry("getAdminCustomers")])
  .handler(async ({ data, context }) => {
    const { getAdminCustomers } = await import("./admin.server");
    return await getAdminCustomers(context.tctx, data.search);
  });

export const getCustomerDetailFn = createServerFn({ method: "GET" })
  .validator((params: unknown) =>
    z.object({ userPublicId: z.string() }).parse(params),
  )
  .middleware([withTelemetry("getCustomerDetail")])
  .handler(async ({ data, context }) => {
    const { getCustomerDetail } = await import("./admin.server");
    return await getCustomerDetail(context.tctx, data.userPublicId);
  });

export const adminLockUnlockAccountFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        accountOrUserPublicId: z.string(),
        lock: z.boolean(),
        reason: z.string().optional(),
      })
      .parse(data),
  )
  .middleware([withTelemetry("adminLockUnlockAccount")])
  .handler(async ({ data, context }) => {
    const { adminLockUnlockAccount } = await import("./admin.server");
    return await adminLockUnlockAccount(
      context.tctx,
      data.accountOrUserPublicId,
      data.lock,
      data.reason,
    );
  });

export const adminRevokeUserSessionsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ userPublicId: z.string() }).parse(data),
  )
  .middleware([withTelemetry("adminRevokeUserSessions")])
  .handler(async ({ data, context }) => {
    const { adminRevokeUserSessions } = await import("./admin.server");
    return await adminRevokeUserSessions(context.tctx, data.userPublicId);
  });

export const getAdminTransactionsFn = createServerFn({ method: "GET" })
  .validator((params: unknown) =>
    z
      .object({
        status: z.string().optional(),
        minAmountEtb: z.number().optional(),
        maxAmountEtb: z.number().optional(),
        search: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      })
      .parse(params ?? {}),
  )
  .middleware([withTelemetry("getAdminTransactions")])
  .handler(async ({ data, context }) => {
    const { getAdminTransactions } = await import("./admin.server");
    return await getAdminTransactions(context.tctx, data);
  });

export const getTransactionDetailFn = createServerFn({ method: "GET" })
  .validator((params: unknown) =>
    z.object({ txPublicId: z.string() }).parse(params),
  )
  .middleware([withTelemetry("getTransactionDetail")])
  .handler(async ({ data, context }) => {
    const { getTransactionDetail } = await import("./admin.server");
    return await getTransactionDetail(context.tctx, data.txPublicId);
  });

export const adminFreezeTransactionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ txPublicId: z.string(), reason: z.string().optional() }).parse(data),
  )
  .middleware([withTelemetry("adminFreezeTransaction")])
  .handler(async ({ data, context }) => {
    const { adminFreezeTransaction } = await import("./admin.server");
    return await adminFreezeTransaction(context.tctx, data.txPublicId, data.reason);
  });

export const adminReleaseTransactionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ txPublicId: z.string() }).parse(data),
  )
  .middleware([withTelemetry("adminReleaseTransaction")])
  .handler(async ({ data, context }) => {
    const { adminReleaseTransaction } = await import("./admin.server");
    return await adminReleaseTransaction(context.tctx, data.txPublicId);
  });

export const getAdminSecurityEventsFn = createServerFn({ method: "GET" })
  .validator((params: unknown) =>
    z
      .object({
        eventType: z.string().optional(),
        result: z.string().optional(),
        sourceIp: z.string().optional(),
        userIdPub: z.string().optional(),
        deliveryStatus: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      })
      .parse(params ?? {}),
  )
  .middleware([withTelemetry("getAdminSecurityEvents")])
  .handler(async ({ data, context }) => {
    const { getAdminSecurityEvents } = await import("./admin.server");
    return await getAdminSecurityEvents(context.tctx, data);
  });

export const adminRetrySingleEventFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ eventId: z.string() }).parse(data),
  )
  .middleware([withTelemetry("adminRetrySingleEvent")])
  .handler(async ({ data, context }) => {
    const { adminRetrySingleEvent } = await import("./admin.server");
    return await adminRetrySingleEvent(context.tctx, data.eventId);
  });

export const getAdminSessionsDevicesFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getAdminSessionsDevices")])
  .handler(async ({ context }) => {
    const { getAdminSessionsDevices } = await import("./admin.server");
    return await getAdminSessionsDevices(context.tctx);
  });

export const adminRevokeSingleSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ sessionId: z.string() }).parse(data),
  )
  .middleware([withTelemetry("adminRevokeSingleSession")])
  .handler(async ({ data, context }) => {
    const { adminRevokeSingleSession } = await import("./admin.server");
    return await adminRevokeSingleSession(context.tctx, data.sessionId);
  });

export const getAdminIpBlocklistFn = createServerFn({ method: "GET" })
  .middleware([withTelemetry("getAdminIpBlocklist")])
  .handler(async ({ context }) => {
    const { getAdminIpBlocklist } = await import("./admin.server");
    return await getAdminIpBlocklist(context.tctx);
  });

export const adminAddBlockedIpFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        ip: z.string().trim().min(3),
        reason: z.string().default("Manual administrator block"),
        durationMinutes: z.number().default(1440),
      })
      .parse(data),
  )
  .middleware([withTelemetry("adminAddBlockedIp")])
  .handler(async ({ data, context }) => {
    const { adminAddBlockedIp } = await import("./admin.server");
    return await adminAddBlockedIp(
      context.tctx,
      data.ip,
      data.reason,
      data.durationMinutes,
    );
  });

export const adminRemoveBlockedIpFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ ip: z.string().trim() }).parse(data),
  )
  .middleware([withTelemetry("adminRemoveBlockedIp")])
  .handler(async ({ data, context }) => {
    const { adminRemoveBlockedIp } = await import("./admin.server");
    return await adminRemoveBlockedIp(context.tctx, data.ip);
  });

export const getAdminAuditLogsFn = createServerFn({ method: "GET" })
  .validator((params: unknown) =>
    z
      .object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        actorType: z.string().optional(),
        action: z.string().optional(),
      })
      .parse(params ?? {}),
  )
  .middleware([withTelemetry("getAdminAuditLogs")])
  .handler(async ({ data, context }) => {
    const { getAdminAuditLogs } = await import("./admin.server");
    return await getAdminAuditLogs(context.tctx, data);
  });

export const updateSecurityPostureFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.record(z.unknown()).parse(data))
  .middleware([withTelemetry("updateSecurityPosture")])
  .handler(async ({ data, context }) => {
    const { updateSecurityPosture } = await import("./admin.server");
    return await updateSecurityPosture(context.tctx, data);
  });

export const runAdminSelfTestFn = createServerFn({ method: "POST" })
  .middleware([withTelemetry("runAdminSelfTest")])
  .handler(async ({ context }) => {
    const { runAdminSelfTest } = await import("./admin.server");
    return await runAdminSelfTest(context.tctx);
  });

