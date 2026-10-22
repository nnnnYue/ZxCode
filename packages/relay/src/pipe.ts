import type { WebSocket as NodeWebSocket } from "ws";

/**
 * 数据面字节管道：把手机 WS 与桌面 WS 的消息负载原样双向转发。
 * relay 不解析 RPC 帧、不持业务状态；任一侧关闭/出错即关闭另一侧，
 * 端到端的 close 语义由两侧各自的 SocketProtocol/ChannelServer 自行收敛。
 */
export function pipeWebSockets(a: NodeWebSocket, b: NodeWebSocket): void {
  const forward = (from: NodeWebSocket, to: NodeWebSocket): void => {
    from.on("message", (data) => {
      if (to.readyState === to.OPEN) {
        to.send(data as Buffer);
      }
    });
    const closePeer = (): void => {
      try {
        to.close();
      } catch {
        // 忽略：对端可能已关闭。
      }
    };
    from.on("close", closePeer);
    from.on("error", closePeer);
  };
  forward(a, b);
  forward(b, a);
}

/** 配对前缓存上限：握手帧极小，超过该值说明对端在灌数据，直接断开而不是无限占内存。 */
const MAX_PENDING_PIPE_BYTES = 4 * 1024 * 1024;

/** 配对前的一侧连接：先缓存早到的字节，配对成功后按序回放再直连。 */
export interface PendingPipeSide {
  ws: NodeWebSocket;
  buffered: Buffer[];
  bufferedBytes: number;
  onMessage: (data: unknown) => void;
}

/**
 * 手机/桌面任一侧都可能先于管道建立就发出握手字节（手机 WS open 即可发帧，
 * 桌面回连后 Host 立刻发 ready 帧）。如果这些字节没有监听者就会直接丢失，
 * 双方永远等不到握手 —— 表现为手机页连上但界面空白、RPC 一条都发不出去。
 * 因此配对前先缓存，配对时按序回放。
 */
export function createPendingPipeSide(ws: NodeWebSocket): PendingPipeSide {
  const side: PendingPipeSide = {
    ws,
    buffered: [],
    bufferedBytes: 0,
    onMessage: () => undefined,
  };
  side.onMessage = (data: unknown): void => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    side.bufferedBytes += buffer.byteLength;
    if (side.bufferedBytes > MAX_PENDING_PIPE_BYTES) {
      // 缓存超限：说明对端在管道外狂发数据，断开这一侧而不是继续占用内存。
      side.buffered = [];
      side.bufferedBytes = 0;
      try {
        ws.close(1009, "relay-pipe-buffer-overflow");
      } catch {
        // 忽略。
      }
      return;
    }
    side.buffered.push(buffer);
  };
  ws.on("message", side.onMessage);
  return side;
}

/**
 * 配对成功：先摘掉缓存监听（避免与管道监听重复转发），再按序回放两侧缓存，
 * 最后接成直连管道。回放顺序保持各自方向内的先后关系。
 */
export function connectPipedSides(a: PendingPipeSide, b: PendingPipeSide): void {
  a.ws.off("message", a.onMessage);
  b.ws.off("message", b.onMessage);
  for (const chunk of a.buffered) {
    if (b.ws.readyState === b.ws.OPEN) b.ws.send(chunk);
  }
  for (const chunk of b.buffered) {
    if (a.ws.readyState === a.ws.OPEN) a.ws.send(chunk);
  }
  a.buffered = [];
  a.bufferedBytes = 0;
  b.buffered = [];
  b.bufferedBytes = 0;
  pipeWebSockets(a.ws, b.ws);
}
