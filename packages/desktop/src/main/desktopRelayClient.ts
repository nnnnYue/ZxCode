// 自部署手机远控 relay 的 desktop main 侧客户端（模块级单例，由 index.ts 装配）。
// 职责：控制连接（鉴权/心跳/presence/签发 grant）与设置驱动的启停重连；
// attach 数据面执行在 desktopRelayAttach.ts。
// relay 客户端不持有任何会话业务状态：workspace 事实来自窗口映射与 remote session
// 管理器的只读快照，attach 校验失败即拒绝，不猜测。
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import {
  RELAY_CONTROL_HEARTBEAT_INTERVAL_MS,
  ZXCODE_RELAY_PROTOCOL_VERSION,
  relayControlServerMessageSchema,
  type MobileRelaySettings,
  type RelayAttachTarget,
  type RelayPresenceWindow,
} from "@zcode/shared";
import {
  controlWsUrl,
  grantPageUrl,
  performRelayAttach,
  type RelayAttachExecutorDeps,
} from "./desktopRelayAttach.js";

export interface RelayWindowWorkspaceSnapshot {
  windowId: number;
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceKey: string;
}

interface DesktopRelayClientDeps extends RelayAttachExecutorDeps {
  /** 设备身份（deviceMid）；同一桌面重启后保持一致，relay 用于顶替旧连接。 */
  deviceId: string;
  now?: () => number;
}

export interface DesktopRelayClientHandle {
  /** 设置变更（启动读一次 + SyncAppSettings 即时推送）。 */
  applySettings(settings: MobileRelaySettings | undefined): void;
  getStatus(): {
    enabled: boolean;
    connected: boolean;
    serverUrl?: string;
    lastError?: string;
  };
  /** workspace 变化时重推 presence；幂等。 */
  pushPresence(): void;
  /** 签发一次性手机远控授权链接。 */
  requestGrant(payload: {
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
  }): Promise<{
    success: boolean;
    url?: string;
    expiresAt?: number;
    error?: string;
  }>;
  dispose(): Promise<void>;
}

const RECONNECT_INITIAL_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
/** grant 签发等待上限：半开连接下 relay 永不回包，必须本地失败结算，否则 UI 永久 loading。 */
const RELAY_GRANT_TIMEOUT_MS = 15_000;
/** hello 后等待 relay-control-ack 的上限；超时说明控制面已不可用，重建连接。 */
const RELAY_HELLO_ACK_TIMEOUT_MS = 10_000;
/** 收到最近一条服务端消息后允许的最大静默窗口；超时判定连接僵尸化（NAT 老化/反代黑洞）。 */
const RELAY_SERVER_SILENCE_LIMIT_MS = RELAY_CONTROL_HEARTBEAT_INTERVAL_MS * 2 + 15_000;

interface PendingGrant {
  requestId: string;
  resolve: (value: { success: boolean; url?: string; expiresAt?: number; error?: string }) => void;
  timeoutTimer: ReturnType<typeof setTimeout>;
}

export function createDesktopRelayClient(deps: DesktopRelayClientDeps): DesktopRelayClientHandle {
  const { logger } = deps;
  const now = deps.now ?? Date.now;
  let settings: MobileRelaySettings | undefined;
  let disposed = false;
  let control: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let helloAckTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
  let connected = false;
  let lastError: string | undefined;
  let lastServerMessageAt = 0;
  let generation = 0;
  const pendingGrants = new Map<string, PendingGrant>();

  const settlePendingGrant = (
    requestId: string,
    value: {
      success: boolean;
      url?: string;
      expiresAt?: number;
      error?: string;
    },
  ): void => {
    const pending = pendingGrants.get(requestId);
    if (!pending) return;
    pendingGrants.delete(requestId);
    clearTimeout(pending.timeoutTimer);
    pending.resolve(value);
  };

  const sendControl = (payload: unknown): boolean => {
    if (!control || control.readyState !== WebSocket.OPEN) return false;
    try {
      control.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      logger.warn("[mobile-relay] send control message failed:", error);
      return false;
    }
  };

  const stopTimers = (): void => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (helloAckTimer) {
      clearTimeout(helloAckTimer);
      helloAckTimer = null;
    }
  };

  const teardownConnection = (reason: string): void => {
    stopTimers();
    if (control) {
      const ws = control;
      control = null;
      try {
        ws.close(1000, reason);
      } catch {
        // 忽略：连接可能已断。
      }
    }
    if (connected) {
      connected = false;
      logger.info(`[mobile-relay] control connection closed (${reason})`);
    }
    for (const pending of pendingGrants.values()) {
      clearTimeout(pending.timeoutTimer);
      pending.resolve({ success: false, error: "relay control connection lost" });
    }
    pendingGrants.clear();
  };

  const scheduleReconnect = (): void => {
    if (disposed || !settings?.enabled || !settings.serverUrl) return;
    if (reconnectTimer) return;
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const pushPresence = (): void => {
    if (!connected) return;
    const windows: RelayPresenceWindow[] = deps.listWindowWorkspaces().map((entry) => ({
      windowId: entry.windowId,
      workspacePath: entry.workspacePath,
      ...(entry.workspaceIdentity ? { workspaceIdentity: entry.workspaceIdentity } : {}),
      workspaceKey: entry.workspaceKey,
    }));
    for (const remote of deps.listRemoteWorkspaceSessions()) {
      if (!remote.attachable) continue;
      windows.push({
        windowId: remote.windowId,
        workspacePath: remote.workspacePath,
        workspaceIdentity: remote.workspaceIdentity,
        workspaceKey: remote.workspaceKey,
        remoteSessionId: remote.remoteSessionId,
      });
    }
    sendControl({ type: "relay-presence-update", windows });
  };

  const connect = (): void => {
    if (disposed || !settings?.enabled || !settings.serverUrl) return;
    const url = controlWsUrl(settings.serverUrl);
    const currentGeneration = ++generation;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, {
        headers: settings.token ? { Authorization: `Bearer ${settings.token}` } : undefined,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn(`[mobile-relay] create control connection failed: ${lastError}`);
      scheduleReconnect();
      return;
    }
    control = ws;
    ws.on("open", () => {
      if (currentGeneration !== generation) {
        ws.close(1000, "stale");
        return;
      }
      sendControl({
        type: "relay-control-hello",
        deviceId: deps.deviceId,
        relayToken: settings?.token ?? "",
        version: ZXCODE_RELAY_PROTOCOL_VERSION,
      });
      // Bugfix: 中间层可能放行 upgrade 后静默吞帧（或 relay 在握手瞬间崩溃），
      // 桌面会停在"已连接 socket 但永远等不到 ack"；超时即重建。
      helloAckTimer = setTimeout(() => {
        if (currentGeneration !== generation || control !== ws || connected) return;
        logger.warn("[mobile-relay] relay-control-ack overdue; rebuilding control connection");
        teardownConnection("hello-ack-timeout");
        scheduleReconnect();
      }, RELAY_HELLO_ACK_TIMEOUT_MS);
    });
    ws.on("message", (raw) => {
      if (currentGeneration !== generation || control !== ws) return;
      lastServerMessageAt = now();
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        logger.warn("[mobile-relay] non-JSON control message; dropping");
        ws.close(1002, "protocol-error");
        return;
      }
      const message = relayControlServerMessageSchema.safeParse(parsed);
      if (!message.success) {
        logger.warn("[mobile-relay] unknown control message; ignoring");
        return;
      }
      if (message.data.type === "relay-control-ack") {
        connected = true;
        lastError = undefined;
        reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
        if (helloAckTimer) {
          clearTimeout(helloAckTimer);
          helloAckTimer = null;
        }
        logger.info(
          `[mobile-relay] control connection established (deviceId=${message.data.deviceId})`,
        );
        pushPresence();
        heartbeatTimer = setInterval(() => {
          sendControl({ type: "relay-heartbeat", at: Date.now() });
          // presence 随心跳重推：远程 session 建立/关闭没有 Main 侧单一回调点，
          // 30s 内最终一致即可（连接建立与 workspace 切换时另有即时推送）。
          pushPresence();
          // Bugfix: 半开 TCP（NAT 老化、relay 主机更换、反代黑洞）下 send 永远"成功"，
          // connected 永真，grant 请求写进黑洞且 UI 永久 loading。
          // 服务端静默超过宽限即判定僵尸连接，主动重建。
          if (now() - lastServerMessageAt > RELAY_SERVER_SILENCE_LIMIT_MS) {
            logger.warn("[mobile-relay] server went silent beyond grace; rebuilding connection");
            teardownConnection("server-silent");
            scheduleReconnect();
          }
        }, RELAY_CONTROL_HEARTBEAT_INTERVAL_MS);
        return;
      }
      if (message.data.type === "relay-heartbeat-ack") return;
      if (message.data.type === "relay-issue-grant-response") {
        settlePendingGrant(
          message.data.requestId,
          message.data.ok && message.data.grantId
            ? {
                success: true,
                url: grantPageUrl(settings?.serverUrl ?? "", message.data.grantId),
                ...(message.data.expiresAt !== undefined
                  ? { expiresAt: message.data.expiresAt }
                  : {}),
              }
            : { success: false, error: message.data.error ?? "relay 签发授权失败" },
        );
        return;
      }
      if (message.data.type === "relay-attach-request") {
        const { ticket, target } = message.data;
        void performRelayAttach({
          deps,
          serverUrl: settings?.serverUrl ?? "",
          ticket,
          target,
          finish: (ok, error) =>
            sendControl({
              type: "relay-attach-result",
              ticket,
              ok,
              ...(error ? { error } : {}),
            }),
        });
      }
    });
    const onDrop = (reason: string): void => {
      if (currentGeneration !== generation || control !== ws) return;
      teardownConnection(reason);
      scheduleReconnect();
    };
    ws.on("close", (code: number, reasonBuffer: Buffer) => {
      // Bugfix: relay 的多数拒绝以 close code 表达（1013 另一桌面已连接、1002 版本/hello
      // 不合法等）；此前 close 不写 lastError，设置页只会永远显示"连接中…"，无从排查。
      if (code !== 1000) {
        const reasonText = reasonBuffer.toString().trim();
        lastError = `relay 连接被关闭（code=${code}${reasonText ? `：${reasonText}` : ""}）`;
      }
      onDrop("closed");
    });
    ws.on("error", (error: Error) => {
      lastError = error.message;
      onDrop("error");
    });
  };

  const buildTarget = (payload: {
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
  }): { target?: RelayAttachTarget; error?: string } => {
    const workspaceKey = payload.workspaceIdentity?.trim() || payload.workspacePath;
    if (payload.remoteSessionId) {
      const remote = deps
        .listRemoteWorkspaceSessions()
        .find((entry) => entry.remoteSessionId === payload.remoteSessionId);
      if (!remote) {
        return { error: "远程 workspace session 不存在或已关闭" };
      }
      if (remote.workspaceKey !== workspaceKey) {
        return { error: "远程 workspace 与请求的 workspace 身份不匹配" };
      }
      return {
        target: {
          kind: "remote",
          windowId: remote.windowId,
          remoteSessionId: remote.remoteSessionId,
          workspacePath: remote.workspacePath,
          workspaceIdentity: remote.workspaceIdentity,
          workspaceKey: remote.workspaceKey,
        },
      };
    }
    const local = deps.listWindowWorkspaces().find((entry) => entry.workspaceKey === workspaceKey);
    if (!local) {
      return { error: "未找到持有该 workspace 的窗口" };
    }
    return {
      target: {
        kind: "local",
        windowId: local.windowId,
        workspacePath: local.workspacePath,
        ...(local.workspaceIdentity ? { workspaceIdentity: local.workspaceIdentity } : {}),
        workspaceKey: local.workspaceKey,
      },
    };
  };

  return {
    applySettings(next) {
      const unchanged =
        settings?.enabled === next?.enabled &&
        settings?.serverUrl === next?.serverUrl &&
        settings?.token === next?.token;
      if (unchanged) return;
      const wasActive = Boolean(settings?.enabled && settings.serverUrl);
      settings = next;
      const isActive = Boolean(next?.enabled && next.serverUrl);
      if (!isActive) {
        if (wasActive) {
          teardownConnection("settings-disabled");
          generation++;
        }
        return;
      }
      // serverUrl/token 变化或首次启用：重建控制连接。
      teardownConnection("settings-changed");
      generation++;
      reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
      connect();
    },
    getStatus() {
      return {
        enabled: Boolean(settings?.enabled && settings.serverUrl),
        connected,
        ...(settings?.serverUrl ? { serverUrl: settings.serverUrl } : {}),
        ...(lastError && !connected ? { lastError } : {}),
      };
    },
    pushPresence,
    requestGrant(payload) {
      if (!settings?.enabled || !settings.serverUrl) {
        return Promise.resolve({ success: false, error: "手机远控 relay 未启用" });
      }
      if (!connected) {
        return Promise.resolve({
          success: false,
          error: lastError ? `relay 未连接：${lastError}` : "relay 未连接",
        });
      }
      const { target, error } = buildTarget(payload);
      if (!target) {
        return Promise.resolve({ success: false, error });
      }
      const requestId = randomUUID();
      return new Promise((resolve) => {
        // Bugfix: 控制连接僵尸化（半开 TCP/反代黑洞）时 relay 永不回包，此前该 Promise
        // 永不结算，设置页"生成链接"永久 loading。超时本地失败结算，让 UI 可重试。
        const timeoutTimer = setTimeout(() => {
          settlePendingGrant(requestId, {
            success: false,
            error: "relay 签发授权超时，请检查 relay 服务端与网络后重试",
          });
        }, RELAY_GRANT_TIMEOUT_MS);
        pendingGrants.set(requestId, { requestId, resolve, timeoutTimer });
        // 回包由 relay-issue-grant-response 结算；控制连接断开时统一失败结算。
        if (!sendControl({ type: "relay-issue-grant-request", requestId, target })) {
          settlePendingGrant(requestId, { success: false, error: "relay 控制连接不可用" });
        }
      });
    },
    async dispose() {
      disposed = true;
      generation++;
      teardownConnection("client-disposed");
    },
  };
}
