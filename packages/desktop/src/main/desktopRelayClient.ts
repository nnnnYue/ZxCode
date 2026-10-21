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

interface PendingGrant {
  requestId: string;
  resolve: (value: { success: boolean; url?: string; expiresAt?: number; error?: string }) => void;
}

export function createDesktopRelayClient(deps: DesktopRelayClientDeps): DesktopRelayClientHandle {
  const { logger } = deps;
  let settings: MobileRelaySettings | undefined;
  let disposed = false;
  let control: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS;
  let connected = false;
  let lastError: string | undefined;
  let generation = 0;
  const pendingGrants = new Map<string, PendingGrant>();

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
    });
    ws.on("message", (raw) => {
      if (currentGeneration !== generation || control !== ws) return;
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
        logger.info(
          `[mobile-relay] control connection established (deviceId=${message.data.deviceId})`,
        );
        pushPresence();
        heartbeatTimer = setInterval(() => {
          sendControl({ type: "relay-heartbeat", at: Date.now() });
          // presence 随心跳重推：远程 session 建立/关闭没有 Main 侧单一回调点，
          // 30s 内最终一致即可（连接建立与 workspace 切换时另有即时推送）。
          pushPresence();
        }, RELAY_CONTROL_HEARTBEAT_INTERVAL_MS);
        return;
      }
      if (message.data.type === "relay-heartbeat-ack") return;
      if (message.data.type === "relay-issue-grant-response") {
        const pending = pendingGrants.get(message.data.requestId);
        if (!pending) return;
        pendingGrants.delete(message.data.requestId);
        pending.resolve(
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
    ws.on("close", () => onDrop("closed"));
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
        pendingGrants.set(requestId, { requestId, resolve });
        // 回包由 relay-issue-grant-response 结算；控制连接断开时统一失败结算。
        if (!sendControl({ type: "relay-issue-grant-request", requestId, target })) {
          pendingGrants.delete(requestId);
          resolve({ success: false, error: "relay 控制连接不可用" });
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
