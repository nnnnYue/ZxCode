/**
 * 自部署手机远控 relay 的控制面协议（desktop main ↔ relay 服务端）。
 *
 * 数据面是纯字节管道：relay 不解析 RPC 帧，手机与桌面各自用 SocketProtocol 端到端通信。
 * 控制面只承载鉴权、心跳、presence、票据（grant/attach ticket）的签发与调度。
 * 所有 schema 必须 .strict()：控制帧来自网络，未知字段直接拒绝而不是静默吞掉。
 */
import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);

/**
 * grant（手机接入票据）未使用有效期：签发后 10 分钟内没有任何接入即失效。
 * grant 不再一次性消费（产品决策：链接即凭证，刷新与多端复用同一链接）；
 * 一旦有过成功接入，有效期切换为 RELAY_GRANT_ACTIVE_IDLE_TTL_MS 的闲置窗口。
 */
export const RELAY_GRANT_TTL_MS = 10 * 60_000;
/** grant 首次接入后的闲置有效期：每次手机 WS 建立/断开都从当前时刻重算；期间持续使用则一直有效。 */
export const RELAY_GRANT_ACTIVE_IDLE_TTL_MS = 24 * 60 * 60_000;
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
    // Bugfix: 鉴权实际走 HTTP Authorization header；桌面未配置 token 时发送空串，
    // 这里若要求非空，无 token 部署的 relay 会以 hello-required 关闭连接并陷入无限重连。
    relayToken: z.string(),
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
    /** epoch ms；未使用 grant 的失效时间（接入后切换为闲置窗口，见 RELAY_GRANT_ACTIVE_IDLE_TTL_MS）。 */
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
