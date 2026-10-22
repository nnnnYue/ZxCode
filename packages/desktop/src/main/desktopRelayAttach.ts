// 自部署手机远控 relay 的 attach 执行器：relay 下发 attach request 后，
// 校验 target → 回连数据面 WS → 执行本地/远程 Host attach → 建立 WS ↔ MessagePort 字节桥。
// 从 desktopRelayClient 拆出：控制连接生命周期与 attach 数据面各自独立演进。
import type { MessagePortMain } from "electron";
import WebSocket from "ws";
import { SocketProtocol, VSBuffer, type ISocket } from "@zcode/rpc";
import type { RelayAttachTarget } from "@zcode/shared";
import type { RelayWindowWorkspaceSnapshot } from "./desktopRelayClient.js";

export interface RelayAttachExecutorDeps {
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  /** 本地 attach：对窗口 Host 发 AttachServicePort(web-remote-replayable, local scope)。 */
  attachLocalWorkspace(windowId: number): MessagePortMain;
  /** 远程 attach：委托 remote session 管理器（含三元校验）。 */
  attachRemoteWorkspace(params: {
    windowId: number;
    remoteSessionId: string;
    workspacePath: string;
    workspaceIdentity: string;
    workspaceKey: string;
  }): MessagePortMain;
  listWindowWorkspaces(): RelayWindowWorkspaceSnapshot[];
  listRemoteWorkspaceSessions(): Array<{
    windowId: number;
    remoteSessionId: string;
    workspacePath: string;
    workspaceIdentity: string;
    workspaceKey: string;
    attachable: boolean;
  }>;
}

const ATTACH_CONNECT_TIMEOUT_MS = 10_000;

/** https://host → wss://host/ws/host-control；http 同理。 */
export function controlWsUrl(serverUrl: string): string {
  const normalized = serverUrl.replace(/\/+$/, "");
  const wsBase = normalized.startsWith("https://")
    ? normalized.replace("https://", "wss://")
    : normalized.replace("http://", "ws://");
  return `${wsBase}/ws/host-control`;
}

export function grantPageUrl(serverUrl: string, grantId: string): string {
  return `${serverUrl.replace(/\/+$/, "")}/?remote=${encodeURIComponent(grantId)}`;
}

/** 手机接入后 relay 下发 attach 请求：校验 target → 回连数据面 → attach → 桥接。 */
export async function performRelayAttach(params: {
  deps: RelayAttachExecutorDeps;
  serverUrl: string;
  ticket: string;
  target: RelayAttachTarget;
  finish: (ok: boolean, error?: string) => void;
}): Promise<void> {
  const { deps, serverUrl, ticket, target, finish } = params;
  const { logger } = deps;
  if (!serverUrl) {
    finish(false, "relay server url 未配置");
    return;
  }
  // 陈旧防护：attach 时的实时快照必须与签发 target 一致（窗口切换/远程关闭后拒绝）。
  if (target.kind === "local") {
    const current = deps.listWindowWorkspaces().find((entry) => entry.windowId === target.windowId);
    if (!current || current.workspaceKey !== target.workspaceKey) {
      finish(false, "窗口当前 workspace 与授权目标不一致");
      return;
    }
  } else {
    const remote = deps
      .listRemoteWorkspaceSessions()
      .find((entry) => entry.remoteSessionId === target.remoteSessionId);
    if (!remote || !remote.attachable || remote.workspaceKey !== target.workspaceKey) {
      finish(false, "远程 workspace session 不可用或身份不匹配");
      return;
    }
  }

  const wsBase = controlWsUrl(serverUrl).replace(/\/ws\/host-control$/, "");
  const attachWs = new WebSocket(`${wsBase}/ws/host-attach/${encodeURIComponent(ticket)}`);
  const connectTimeout = setTimeout(() => {
    attachWs.terminate();
  }, ATTACH_CONNECT_TIMEOUT_MS);
  try {
    await new Promise<void>((resolve, reject) => {
      const onOpenError = (error: Error): void => reject(error);
      attachWs.once("open", () => {
        attachWs.off("error", onOpenError);
        resolve();
      });
      attachWs.once("error", onOpenError);
    });
    const port =
      target.kind === "local"
        ? deps.attachLocalWorkspace(target.windowId)
        : deps.attachRemoteWorkspace({
            windowId: target.windowId,
            remoteSessionId: target.remoteSessionId,
            workspacePath: target.workspacePath,
            workspaceIdentity: target.workspaceIdentity ?? target.workspacePath,
            workspaceKey: target.workspaceKey,
          });
    bridgePortToWebSocket(port, attachWs, target.workspaceKey, logger);
    finish(true);
    logger.info(
      `[mobile-relay] attached ${target.kind} workspace=${target.workspaceKey} ticket=${ticket.slice(0, 8)}…`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[mobile-relay] attach failed: ${message}`);
    finish(false, message);
    try {
      attachWs.close();
    } catch {
      // 忽略。
    }
  } finally {
    clearTimeout(connectTimeout);
  }
}

/**
 * MessagePort ↔ WS 字节桥。
 *
 * 两侧协议不同，必须在这里做分帧转换：
 * - Host 侧走 MessagePortProtocol，ChannelServer 的载荷是**裸字节**（无帧头）；
 * - 手机侧走 SocketProtocol，帧头是 13 字节（type/id/ack/length）。
 * 直接把裸载荷丢给手机，手机的 ChunkStream 会一直等满 13 字节头，永远解析不出
 * Initialize，双方就此僵住：手机页连上却一片空白，RPC 一条都发不出去。
 * 因此这里用 SocketProtocol 包装 WS：Host 裸载荷 send() 成帧发给手机，
 * 手机来的帧由 SocketProtocol 拆回裸载荷再 postMessage 给 Host。
 *
 * 流控 sideband 对象（MessagePortFlowControl）不属于数据面字节，直接丢弃。
 */
function bridgePortToWebSocket(
  port: MessagePortMain,
  ws: WebSocket,
  workspaceKey: string,
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
): void {
  let closed = false;
  const closeBoth = (): void => {
    if (closed) return;
    closed = true;
    try {
      port.close();
    } catch {
      // 忽略。
    }
    try {
      ws.close();
    } catch {
      // 忽略。
    }
    logger.info(`[mobile-relay] bridge closed workspace=${workspaceKey}`);
  };

  const socket: ISocket = {
    onData: (listener) => {
      ws.on("message", (raw) => {
        const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
        listener(VSBuffer.wrap(new Uint8Array(buffer)));
      });
      return { dispose: () => undefined };
    },
    onClose: (listener) => {
      ws.on("close", () => listener());
      return { dispose: () => undefined };
    },
    onEnd: (listener) => {
      ws.on("close", () => listener());
      return { dispose: () => undefined };
    },
    write: (buffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(buffer.buffer);
    },
    end: () => {
      try {
        ws.close();
      } catch {
        // 忽略。
      }
    },
    drain: () => Promise.resolve(),
    dispose: () => {
      try {
        ws.close();
      } catch {
        // 忽略。
      }
    },
  };
  const protocol = new SocketProtocol(socket);

  port.on("message", (event: { data: unknown }) => {
    const data = event.data;
    if (data instanceof Uint8Array) {
      // Host 裸载荷 → SocketProtocol 成帧 → 手机端解析。
      protocol.send(VSBuffer.wrap(new Uint8Array(data)));
    } else {
      // MessagePortFlowControl 是 renderer/host 间的流控 sideband，不属于数据面字节。
      logger.info("[mobile-relay] dropped non-byte MessagePort sideband payload");
    }
  });
  port.on("close", closeBoth);
  // 手机端 SocketProtocol 帧 → 拆出裸载荷 → Host 的 MessagePortProtocol。
  protocol.onMessage((buffer) => {
    try {
      port.postMessage(buffer.buffer);
    } catch (error) {
      logger.warn("[mobile-relay] postMessage to host port failed:", error);
      closeBoth();
    }
  });
  ws.on("close", closeBoth);
  ws.on("error", closeBoth);
  port.start();
}
