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
