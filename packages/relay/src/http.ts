import { timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { WebSocket as NodeWebSocket } from "ws";
import {
  RELAY_ATTACH_TICKET_TTL_MS,
  RELAY_ATTACH_WAIT_DESKTOP_TIMEOUT_MS,
  RELAY_CONTROL_HEARTBEAT_REAP_AFTER_MS,
  RELAY_GRANT_ACTIVE_IDLE_TTL_MS,
  RELAY_GRANT_TTL_MS,
  RELAY_REMOTE_CLOSE_REASONS,
  ZXCODE_RELAY_PROTOCOL_VERSION,
  relayControlHelloSchema,
  relayHeartbeatSchema,
  relayIssueGrantRequestSchema,
  relayPresenceUpdateSchema,
  relayAttachResultSchema,
  type RelayAttachTarget,
} from "@zcode/shared/zcode-relay-protocol";
import { SERVER_REMOTE_PROTOCOL_VERSION, type ServerRemoteInfo } from "@zcode/shared";
import { createOneTimeTicketStore } from "./grantStore.js";
import { connectPipedSides, createPendingPipeSide, type PendingPipeSide } from "./pipe.js";
import { registerRelayStaticRoute } from "./staticFiles.js";
import type { PendingRemote, RelayEnv } from "./types.js";
import type { RelayHttpServer, RelayHttpServerOptions } from "./types.js";

export type { RelayHttpServer, RelayHttpServerOptions } from "./types.js";

const WEBSOCKET_DRAIN_TIMEOUT_MS = 250;

function tokenEquals(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function createRelayHttpServer(
  options: RelayHttpServerOptions = {},
): Promise<RelayHttpServer> {
  const logger = options.logger ?? console;
  const now = options.now ?? Date.now;
  const host = options.host ?? "0.0.0.0";
  // grant 的 payload 是签发时桌面声明的 attach target：手机消费 grant 后，
  // relay 必须把同一 target 回传给桌面执行，自己不猜测、不改写。
  const grants = createOneTimeTicketStore<RelayAttachTarget>({
    ttlMs: options.grantTtlMs ?? RELAY_GRANT_TTL_MS,
    now,
  });
  const grantActiveIdleTtlMs = options.grantActiveIdleTtlMs ?? RELAY_GRANT_ACTIVE_IDLE_TTL_MS;
  const tickets = createOneTimeTicketStore<null>({
    ttlMs: options.ticketTtlMs ?? RELAY_ATTACH_TICKET_TTL_MS,
    now,
  });
  const attachWaitTimeoutMs =
    options.attachWaitDesktopTimeoutMs ?? RELAY_ATTACH_WAIT_DESKTOP_TIMEOUT_MS;
  const controlReapAfterMs = options.controlReapAfterMs ?? RELAY_CONTROL_HEARTBEAT_REAP_AFTER_MS;

  const app = new Hono<RelayEnv>();
  const { injectWebSocket, upgradeWebSocket, wss } = createNodeWebSocket({ app });

  /** 桌面控制连接；单部署语义：同 deviceId 的新连接顶替旧连接（桌面重启自愈）。 */
  let control: {
    ws: NodeWebSocket;
    deviceId: string;
    lastSeenAt: number;
    reapTimer: ReturnType<typeof setInterval>;
  } | null = null;
  /** 手机已消费 grant、等待桌面回连的连接（按 attach ticket 索引）。 */
  const pendingRemoteByTicket = new Map<string, PendingRemote>();
  /** 桌面已回连的数据连接；与 pendingRemote 按 ticket 配对。 */
  const desktopSocketByTicket = new Map<string, PendingPipeSide>();

  const closeRemote = (pending: PendingRemote, reason: string): void => {
    clearTimeout(pending.timeout);
    try {
      pending.ws.close(1011, reason);
    } catch {
      // 忽略：连接可能已断。
    }
  };

  const dropControl = (reason: string): void => {
    if (!control) return;
    clearInterval(control.reapTimer);
    const ws = control.ws;
    control = null;
    try {
      ws.close(1001, reason);
    } catch {
      // 忽略：连接可能已断。
    }
    // 控制连接失联后，等待中的手机连接无法被 attach，按桌面离线拒绝。
    for (const [ticket, pending] of pendingRemoteByTicket) {
      pendingRemoteByTicket.delete(ticket);
      closeRemote(pending, RELAY_REMOTE_CLOSE_REASONS.desktopOffline);
    }
  };

  const sendControl = (payload: unknown): boolean => {
    if (!control || control.ws.readyState !== control.ws.OPEN) return false;
    try {
      control.ws.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      logger.warn("[relay] send control message failed:", error);
      return false;
    }
  };

  const pairByTicket = (ticket: string): void => {
    const pending = pendingRemoteByTicket.get(ticket);
    const desktopSide = desktopSocketByTicket.get(ticket);
    if (!pending || !desktopSide) return;
    pendingRemoteByTicket.delete(ticket);
    desktopSocketByTicket.delete(ticket);
    logger.info(`[relay] piping attach ticket=${ticket.slice(0, 8)}…`);
    // 先回放配对前缓存的握手字节，再接直连管道。
    connectPipedSides(pending.side, desktopSide);
  };

  app.get("/api/server-info", (context) => {
    // 手机端 bootstrap 兼容：relay 模式下手机始终带 ?remote=<grant> 直连 WS，
    // 该端点只为对齐 packages/web 的探测协议存在。
    const info: ServerRemoteInfo = {
      serverId: "zxcode-relay",
      version: ZXCODE_RELAY_PROTOCOL_VERSION,
      protocolVersion: SERVER_REMOTE_PROTOCOL_VERSION,
      authRequired: false,
      workspaces: [],
      capabilities: {
        desktopContinuous: true,
        websocketRpc: true,
        processResourceTelemetry: false,
      },
    };
    return context.json(info);
  });

  // 手机端 bootstrap：grant 的 payload 就是桌面签发时声明的 attach target，
  // 手机据此拿到「该显示哪个工作区」，Root 才有 workspace tab 可渲染。
  // 只读不续期：grant 不再被任何端点消费（链接即凭证），失效只由超时决定。
  // 凭据仍是 grant 本身（32 字节随机串），持有者本来就能 attach 到该工作区。
  app.get("/api/remote/bootstrap/:grantId", (context) => {
    const grant = grants.peek(context.req.param("grantId"));
    if (!grant) {
      return context.json({ error: RELAY_REMOTE_CLOSE_REASONS.invalidGrant }, 404);
    }
    const target = grant.payload;
    return context.json({
      workspacePath: target.workspacePath,
      ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
      workspaceKey: target.workspaceKey,
      expiresAt: grant.expiresAt,
    });
  });
  app.use("/ws/host-control", async (context, next) => {
    if (options.token) {
      const header = context.req.header("Authorization") ?? "";
      const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
      // relay 部署在公网：token 比较必须常量时间，避免逐字节计时泄漏。
      if (!presented || !tokenEquals(presented, options.token)) {
        return context.json({ error: "Invalid relay token" }, 401);
      }
    }
    await next();
  });

  app.get(
    "/ws/host-control",
    upgradeWebSocket(() => ({
      onOpen(_event, socket) {
        const ws = socket.raw as NodeWebSocket;
        let helloed = false;
        const reapTimer = setInterval(
          () => {
            if (!control || control.ws !== ws) return;
            if (now() - control.lastSeenAt > controlReapAfterMs) {
              logger.warn("[relay] control connection missed heartbeats; dropping");
              dropControl("heartbeat-timeout");
            }
          },
          Math.ceil(controlReapAfterMs / 2),
        );

        ws.on("message", (raw) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(String(raw));
          } catch {
            logger.warn("[relay] control message is not JSON; dropping");
            ws.close(1002, "protocol-error");
            return;
          }
          const hello = relayControlHelloSchema.safeParse(parsed);
          if (hello.success) {
            if (hello.data.version !== ZXCODE_RELAY_PROTOCOL_VERSION) {
              ws.close(1002, "protocol-version-mismatch");
              return;
            }
            if (control && control.deviceId !== hello.data.deviceId) {
              ws.close(1013, "another desktop already connected");
              return;
            }
            if (control && control.ws === ws) {
              // 同一连接重复 hello（客户端重试等）：按幂等处理，仅刷新注册与心跳；
              // 不能走 superseded 路径，否则会关闭自身连接并把所有 pending attach
              // 误按桌面离线收口，手机端在途授权全部失败。
              control = { ws, deviceId: hello.data.deviceId, lastSeenAt: now(), reapTimer };
              helloed = true;
              ws.send(
                JSON.stringify({
                  type: "relay-control-ack",
                  deviceId: hello.data.deviceId,
                }),
              );
              return;
            }
            if (control) {
              // 同 deviceId 的新连接顶替旧连接：旧连接的 pending attach 一并按离线收口，
              // 手机端需重新生成授权链接（v1 接受该竞态，桌面重启是罕见路径）。
              dropControl("superseded");
            }
            control = { ws, deviceId: hello.data.deviceId, lastSeenAt: now(), reapTimer };
            helloed = true;
            ws.send(
              JSON.stringify({
                type: "relay-control-ack",
                deviceId: hello.data.deviceId,
              }),
            );
            return;
          }
          if (!helloed || !control || control.ws !== ws) {
            ws.close(1002, "hello-required");
            return;
          }
          control.lastSeenAt = now();
          const heartbeat = relayHeartbeatSchema.safeParse(parsed);
          if (heartbeat.success) {
            ws.send(JSON.stringify({ type: "relay-heartbeat-ack", at: heartbeat.data.at }));
            return;
          }
          if (relayPresenceUpdateSchema.safeParse(parsed).success) {
            // presence 只用于桌面→relay 的在线声明；relay 不解析、不存储业务字段。
            return;
          }
          const grantRequest = relayIssueGrantRequestSchema.safeParse(parsed);
          if (grantRequest.success) {
            const grant = grants.issue(grantRequest.data.target);
            ws.send(
              JSON.stringify({
                type: "relay-issue-grant-response",
                requestId: grantRequest.data.requestId,
                ok: true,
                grantId: grant.id,
                expiresAt: grant.expiresAt,
              }),
            );
            return;
          }
          const attachResult = relayAttachResultSchema.safeParse(parsed);
          if (attachResult.success) {
            const pending = pendingRemoteByTicket.get(attachResult.data.ticket);
            // ok=true 时数据面已由 /ws/host-attach 配对，这里只处理失败路径：
            // 桌面明确拒绝 attach（target 校验失败等），立即关闭手机连接。
            if (!attachResult.data.ok && pending) {
              pendingRemoteByTicket.delete(attachResult.data.ticket);
              closeRemote(pending, RELAY_REMOTE_CLOSE_REASONS.desktopAttachFailed);
            }
            return;
          }
          logger.warn("[relay] unknown control message; ignoring");
        });

        ws.on("close", () => {
          clearInterval(reapTimer);
          if (control?.ws === ws) {
            dropControl("control-closed");
          }
        });
        ws.on("error", () => {
          clearInterval(reapTimer);
          if (control?.ws === ws) {
            dropControl("control-error");
          }
        });
      },
    })),
  );

  app.use("/ws/host-attach/:ticket", async (context, next) => {
    const ticket = context.req.param("ticket");
    if (!tickets.consume(ticket)) {
      return context.json({ error: "Invalid or expired attach ticket" }, 401);
    }
    await next();
  });

  app.get(
    "/ws/host-attach/:ticket",
    upgradeWebSocket((context) => {
      // ticket 已在 middleware 一次性消费；从 URL 恢复 id 做配对索引。
      const ticket = new URL(context.req.url).pathname.split("/").pop() ?? "";
      return {
        onOpen(_event, socket) {
          const ws = socket.raw as NodeWebSocket;
          // 桌面可能先于手机配对就发字节（Host 的 ready 帧）：先缓存，配对时回放。
          const side = createPendingPipeSide(ws);
          desktopSocketByTicket.set(ticket, side);
          ws.on("close", () => {
            // 配对前断开：让等待中的手机连接立即失败，不等到超时。
            if (desktopSocketByTicket.get(ticket) === side) {
              desktopSocketByTicket.delete(ticket);
              const pending = pendingRemoteByTicket.get(ticket);
              if (pending) {
                pendingRemoteByTicket.delete(ticket);
                closeRemote(pending, RELAY_REMOTE_CLOSE_REASONS.desktopAttachFailed);
              }
            }
          });
          pairByTicket(ticket);
        },
      };
    }),
  );

  app.use("/ws/remote/:grantId", async (context, next) => {
    // 产品决策「链接即凭证」：grant 只校验不消费，同一链接在失效前可被刷新与
    // 多端复用（多端同时 attach 时输入竞争由桌面 CommandInbox 串行收口）。
    // 安全代价需明示：授权链接在超时前等同长期凭证，泄露窗口与闲置时长一致。
    const grant = grants.peek(context.req.param("grantId"));
    if (!grant) {
      return context.json({ error: RELAY_REMOTE_CLOSE_REASONS.invalidGrant }, 401);
    }
    if (!control || control.ws.readyState !== control.ws.OPEN) {
      return context.json({ error: RELAY_REMOTE_CLOSE_REASONS.desktopOffline }, 503);
    }
    context.set("resolvedGrant", grant.payload);
    await next();
  });

  app.get(
    "/ws/remote/:grantId",
    upgradeWebSocket((context) => ({
      onOpen(_event, socket) {
        const ws = socket.raw as NodeWebSocket;
        // 与 /ws/host-attach 一致：升级回调里从 URL 恢复 id，不依赖 param 绑定。
        const grantId = new URL(context.req.url).pathname.split("/").pop() ?? "";
        const target = context.get("resolvedGrant");
        // 闲置 TTL 每次接入都从当前时刻重算：首次接入即脱离「签发后 10 分钟未用」窗口。
        // close 时再续一次，闲置从最后一次断开起算，避免长连接跨过 TTL 后刷新被拒。
        grants.touch(grantId, grantActiveIdleTtlMs);
        ws.on("close", () => {
          grants.touch(grantId, grantActiveIdleTtlMs);
        });
        const ticket = tickets.issue(null);
        const timeout = setTimeout(() => {
          const pending = pendingRemoteByTicket.get(ticket.id);
          if (!pending) return;
          pendingRemoteByTicket.delete(ticket.id);
          logger.warn("[relay] desktop attach timed out");
          closeRemote(pending, RELAY_REMOTE_CLOSE_REASONS.desktopAttachTimeout);
        }, attachWaitTimeoutMs);
        // 手机 WS open 后可能立刻发握手帧，而桌面回连要等一个往返：先缓存，配对时回放。
        pendingRemoteByTicket.set(ticket.id, { ws, timeout, side: createPendingPipeSide(ws) });
        const delivered = sendControl({
          type: "relay-attach-request",
          ticket: ticket.id,
          target,
        });
        if (!delivered) {
          const pending = pendingRemoteByTicket.get(ticket.id);
          if (pending) {
            pendingRemoteByTicket.delete(ticket.id);
            closeRemote(pending, RELAY_REMOTE_CLOSE_REASONS.desktopOffline);
          }
        }
      },
    })),
  );

  registerRelayStaticRoute(app, options.webRoot, logger);

  let resolveListening: (value: { port: number }) => void = () => undefined;
  const listening = new Promise<{ port: number }>((resolvePromise) => {
    resolveListening = resolvePromise;
  });
  const server = serve({ fetch: app.fetch, hostname: host, port: options.port ?? 0 }, () => {
    const address = server.address();
    resolveListening({
      port: typeof address === "object" && address ? address.port : (options.port ?? 0),
    });
  });
  injectWebSocket(server);
  const { port } = await listening;
  logger.info(`[relay] listening on ${host}:${port}`);

  return {
    host,
    port,
    close: async () => {
      dropControl("relay-shutting-down");
      for (const [ticket, pending] of pendingRemoteByTicket) {
        pendingRemoteByTicket.delete(ticket);
        closeRemote(pending, RELAY_REMOTE_CLOSE_REASONS.relayShuttingDown);
      }
      for (const [ticket, side] of desktopSocketByTicket) {
        desktopSocketByTicket.delete(ticket);
        try {
          side.ws.close(1001, RELAY_REMOTE_CLOSE_REASONS.relayShuttingDown);
        } catch {
          // 忽略。
        }
      }
      // 先给正常客户端短暂排空窗口再 terminate，与 server-core 的关闭语义一致。
      const deadline = Date.now() + WEBSOCKET_DRAIN_TIMEOUT_MS;
      while (wss.clients.size > 0 && Date.now() < deadline) {
        await new Promise<void>((resolveWait) => setTimeout(resolveWait, 10));
      }
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolveClose, rejectClose) =>
        wss.close((error?: Error) => (error ? rejectClose(error) : resolveClose())),
      );
      await new Promise<void>((resolveClose, rejectClose) =>
        server.close((error?: Error) => (error ? rejectClose(error) : resolveClose())),
      );
    },
  };
}
