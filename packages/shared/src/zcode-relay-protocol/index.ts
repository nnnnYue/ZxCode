/**
 * 自部署手机远控 relay 的控制面协议（desktop main ↔ relay 服务端）。
 *
 * 数据面是纯字节管道：relay 不解析 RPC 帧，手机与桌面各自用 SocketProtocol 端到端通信。
 * 控制面只承载鉴权、心跳、presence、一次性票据的签发与消费调度。
 * 所有 schema 必须 .strict()：控制帧来自网络，未知字段直接拒绝而不是静默吞掉。
 */
import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);

/** grant（手机接入票据）默认有效期：一次性消费，10 分钟内打开有效。 */
export const RELAY_GRANT_TTL_MS = 10 * 60_000;
/** attach ticket（桌面回连接票）有效期：一次性消费，须在手机接入后 30s 内回连。 */
export const RELAY_ATTACH_TICKET_TTL_MS = 30_000;
/** 控制连接心跳间隔；relay 侧按 2 倍间隔收割失联设备。 */
export const RELAY_CONTROL_HEARTBEAT_INTERVAL_MS = 30_000;
/** relay 收割无心跳控制连接的宽限。 */
export const RELAY_CONTROL_HEARTBEAT_REAP_AFTER_MS = 60_000;
/** 手机接入后等待桌面回连 /ws/host-attach 的超时。 */
export const RELAY_ATTACH_WAIT_DESKTOP_TIMEOUT_MS = 15_000;
/** relay 协议版本；不匹配时控制连接拒绝建立。 */
export const ZXCODE_RELAY_PROTOCOL_VERSION = "1";

export const relayPresenceWindowSchema = z
  .object({
    windowId: z.number().int().nonnegative(),
    workspacePath: nonEmptyStringSchema,
    workspaceIdentity: nonEmptyStringSchema.optional(),
    workspaceKey: nonEmptyStringSchema,
    /** 远程 workspace 的 logical session；本地工作区留空。 */
    remoteSessionId: nonEmptyStringSchema.optional(),
  })
  .strict();
export type RelayPresenceWindow = z.infer<typeof relayPresenceWindowSchema>;

/** attach 目标：本地窗口 Host 或该窗口内已建立的远程 workspace session。 */
export const relayAttachTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("local"),
      windowId: z.number().int().nonnegative(),
      workspacePath: nonEmptyStringSchema,
      workspaceIdentity: nonEmptyStringSchema.optional(),
      workspaceKey: nonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("remote"),
      windowId: z.number().int().nonnegative(),
      remoteSessionId: nonEmptyStringSchema,
      workspacePath: nonEmptyStringSchema,
      workspaceIdentity: nonEmptyStringSchema.optional(),
      workspaceKey: nonEmptyStringSchema,
    })
    .strict(),
]);
export type RelayAttachTarget = z.infer<typeof relayAttachTargetSchema>;

export const relayControlHelloSchema = z
  .object({
    type: z.literal("relay-control-hello"),
    deviceId: nonEmptyStringSchema,
    /** deployment token；relay 用常量时间比较校验，失败即断开。 */
    relayToken: nonEmptyStringSchema,
    version: nonEmptyStringSchema,
  })
  .strict();

export const relayControlAckSchema = z
  .object({
    type: z.literal("relay-control-ack"),
    deviceId: nonEmptyStringSchema,
  })
  .strict();

export const relayHeartbeatSchema = z
  .object({
    type: z.literal("relay-heartbeat"),
    at: z.number().int().nonnegative(),
  })
  .strict();

export const relayHeartbeatAckSchema = z
  .object({
    type: z.literal("relay-heartbeat-ack"),
    at: z.number().int().nonnegative(),
  })
  .strict();

export const relayPresenceUpdateSchema = z
  .object({
    type: z.literal("relay-presence-update"),
    windows: z.array(relayPresenceWindowSchema),
  })
  .strict();

export const relayIssueGrantRequestSchema = z
  .object({
    type: z.literal("relay-issue-grant-request"),
    requestId: nonEmptyStringSchema,
    target: relayAttachTargetSchema,
  })
  .strict();

export const relayIssueGrantResponseSchema = z
  .object({
    type: z.literal("relay-issue-grant-response"),
    requestId: nonEmptyStringSchema,
    ok: z.boolean(),
    grantId: nonEmptyStringSchema.optional(),
    /** epoch ms；到期后 grant 一次性失效。 */
    expiresAt: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
  })
  .strict();

/** relay → 桌面：手机已消费 grant 接入，桌面须在 ticket TTL 内回连数据面。 */
export const relayAttachRequestSchema = z
  .object({
    type: z.literal("relay-attach-request"),
    ticket: nonEmptyStringSchema,
    target: relayAttachTargetSchema,
  })
  .strict();

/** 桌面 → relay：数据面回连结果；失败时 relay 立即关闭手机连接。 */
export const relayAttachResultSchema = z
  .object({
    type: z.literal("relay-attach-result"),
    ticket: nonEmptyStringSchema,
    ok: z.boolean(),
    error: z.string().optional(),
  })
  .strict();

export const relayControlServerMessageSchema = z.discriminatedUnion("type", [
  relayControlAckSchema,
  relayHeartbeatAckSchema,
  relayAttachRequestSchema,
  relayIssueGrantResponseSchema,
]);
export type RelayControlServerMessage = z.infer<typeof relayControlServerMessageSchema>;

export const relayControlClientMessageSchema = z.discriminatedUnion("type", [
  relayControlHelloSchema,
  relayHeartbeatSchema,
  relayPresenceUpdateSchema,
  relayIssueGrantRequestSchema,
  relayAttachResultSchema,
]);
export type RelayControlClientMessage = z.infer<typeof relayControlClientMessageSchema>;

/** 手机端 WS 关闭时 relay 回给手机的正文字案码；UI 只展示，不解析。 */
export const RELAY_REMOTE_CLOSE_REASONS = {
  invalidGrant: "Invalid or expired relay grant",
  desktopOffline: "Desktop is not connected to relay",
  desktopAttachFailed: "Desktop failed to attach the requested workspace",
  desktopAttachTimeout: "Desktop did not attach in time",
  relayShuttingDown: "Relay is shutting down",
} as const;
