import type { WebSocket as NodeWebSocket } from "ws";
import type { RelayAttachTarget } from "@zcode/shared/zcode-relay-protocol";

export interface RelayHttpServerOptions {
  /** 监听地址；公网部署默认 0.0.0.0。 */
  host?: string;
  /** 监听端口；0 表示随机分配（测试用）。 */
  port?: number;
  /** deployment token；设置后 /ws/host-control 必须携带 Bearer token。 */
  token?: string;
  /** 手机静态页面根目录（packages/web 构建产物）；缺省时 GET / 返回引导页。 */
  webRoot?: string;
  grantTtlMs?: number;
  ticketTtlMs?: number;
  attachWaitDesktopTimeoutMs?: number;
  controlReapAfterMs?: number;
  now?: () => number;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export interface RelayHttpServer {
  host: string;
  port: number;
  close: () => Promise<void>;
}

export interface PendingRemote {
  ws: NodeWebSocket;
  /** 桌面回连超时定时器；配对成功或提前失败时清理。 */
  timeout: ReturnType<typeof setTimeout>;
}

export type RelayEnv = {
  Variables: {
    /** upgrade middleware 已消费的票据及其 payload（grant=target / ticket=undefined）。 */
    consumedGrant: RelayAttachTarget;
  };
};
