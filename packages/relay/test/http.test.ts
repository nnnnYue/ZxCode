import { describe, expect, it } from "vitest";
import { once } from "node:events";
import WebSocket from "ws";
import { createRelayHttpServer, type RelayHttpServer } from "../src/http.js";
import {
  ZXCODE_RELAY_PROTOCOL_VERSION,
  type RelayAttachRequest,
  type RelayIssueGrantResponse,
} from "@zcode/shared/zcode-relay-protocol";

// fork 原 node:test 用例，vitest 全量接管后转为 vitest 断言，语义不变。

const DEVICE_TOKEN = "test-relay-token";
const TARGET = {
  kind: "local",
  windowId: 7,
  workspacePath: "/tmp/demo",
  workspaceKey: "key-demo",
} as const;

interface ControlHarness {
  ws: WebSocket;
  next<T>(predicate: (message: unknown) => boolean): Promise<T>;
  requestGrant(requestId: string): Promise<RelayIssueGrantResponse>;
}

async function openControl(relay: RelayHttpServer, token?: string): Promise<ControlHarness> {
  const ws = new WebSocket(
    `ws://127.0.0.1:${relay.port}/ws/host-control`,
    token === undefined ? {} : { headers: { Authorization: `Bearer ${token}` } },
  );
  const inbox: unknown[] = [];
  ws.on("message", (raw) => inbox.push(JSON.parse(String(raw))));
  await once(ws, "open");
  const next = <T>(predicate: (message: unknown) => boolean): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const startedAt = Date.now();
      const poll = (): void => {
        const index = inbox.findIndex(predicate);
        if (index >= 0) {
          resolve(inbox.splice(index, 1)[0] as T);
          return;
        }
        if (Date.now() - startedAt > 5_000) {
          reject(new Error("control message wait timeout"));
          return;
        }
        setTimeout(poll, 25);
      };
      poll();
    });
  const send = (payload: unknown): void => ws.send(JSON.stringify(payload));
  send({
    type: "relay-control-hello",
    deviceId: "device-test",
    relayToken: DEVICE_TOKEN,
    version: ZXCODE_RELAY_PROTOCOL_VERSION,
  });
  await next((m) => (m as { type?: string }).type === "relay-control-ack");
  const requestGrant = (requestId: string): Promise<RelayIssueGrantResponse> => {
    send({ type: "relay-issue-grant-request", requestId, target: TARGET });
    return next<RelayIssueGrantResponse>(
      (m) => (m as { type?: string; requestId?: string }).requestId === requestId,
    );
  };
  return { ws, next, requestGrant };
}

const silentLogger: Pick<Console, "info" | "warn" | "error"> = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const poll = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("waitFor timeout"));
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
  });
}

describe("relay http server", () => {
  it("host-control 鉴权：错误 token 拒绝升级", async () => {
    const relay = await createRelayHttpServer({
      host: "127.0.0.1",
      port: 0,
      token: DEVICE_TOKEN,
      logger: silentLogger,
    });
    try {
      const response = await fetch(`http://127.0.0.1:${relay.port}/ws/host-control`, {
        headers: { Authorization: "Bearer wrong-token" },
      });
      expect(response.status).toBe(401);
    } finally {
      await relay.close();
    }
  });

  it("手机 bootstrap 端点返回 grant 的工作区事实且不消费 grant", async () => {
    const relay = await createRelayHttpServer({
      host: "127.0.0.1",
      port: 0,
      logger: silentLogger,
    });
    try {
      const control = await openControl(relay);
      const grant = await control.requestGrant("req-bootstrap");
      expect(grant.ok).toBe(true);

      const response = await fetch(
        `http://127.0.0.1:${relay.port}/api/remote/bootstrap/${grant.grantId}`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        workspacePath: TARGET.workspacePath,
        workspaceKey: TARGET.workspaceKey,
      });

      // 只读语义：bootstrap 之后 grant 仍可被手机接入。
      const phone = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      await once(phone, "open");
      const attachRequest = await control.next<RelayAttachRequest>(
        (m) => (m as { type?: string }).type === "relay-attach-request",
      );
      expect(attachRequest.target).toEqual(TARGET);
      phone.close();
      control.ws.close();
    } finally {
      await relay.close();
    }
  });

  it("手机 bootstrap 端点对未知 grant 返回 404", async () => {
    const relay = await createRelayHttpServer({
      host: "127.0.0.1",
      port: 0,
      logger: silentLogger,
    });
    try {
      const response = await fetch(
        `http://127.0.0.1:${relay.port}/api/remote/bootstrap/not-a-grant`,
      );
      expect(response.status).toBe(404);
    } finally {
      await relay.close();
    }
  });

  it("配对前先到的握手字节不丢失（手机先发与桌面先发都要送达）", async () => {
    const relay = await createRelayHttpServer({
      host: "127.0.0.1",
      port: 0,
      logger: silentLogger,
    });
    try {
      const control = await openControl(relay);
      const grant = await control.requestGrant("req-early-bytes");
      const phone = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      const phoneReceived: Buffer[] = [];
      phone.on("message", (raw) => phoneReceived.push(raw as Buffer));
      await once(phone, "open");
      // 桌面还没回连，手机先把握手帧发出去。
      phone.send(Buffer.from("early-phone"));

      const attachRequest = await control.next<RelayAttachRequest>(
        (m) => (m as { type?: string }).type === "relay-attach-request",
      );
      const desktop = new WebSocket(
        `ws://127.0.0.1:${relay.port}/ws/host-attach/${attachRequest.ticket}`,
      );
      const desktopReceived: Buffer[] = [];
      desktop.on("message", (raw) => desktopReceived.push(raw as Buffer));
      await once(desktop, "open");
      // 桌面同样先发一帧（Host 的 ready 帧就是这个时序）。
      desktop.send(Buffer.from("early-desktop"));

      await waitFor(() => desktopReceived.length > 0 && phoneReceived.length > 0);
      expect(Buffer.concat(desktopReceived).toString()).toContain("early-phone");
      expect(Buffer.concat(phoneReceived).toString()).toContain("early-desktop");

      phone.close();
      desktop.close();
      control.ws.close();
    } finally {
      await relay.close();
    }
  });

  it("完整链路：签发 grant → 手机接入 → 桌面回连 → 字节管道双向透传", async () => {
    const relay = await createRelayHttpServer({
      host: "127.0.0.1",
      port: 0,
      logger: silentLogger,
    });
    try {
      const control = await openControl(relay);
      const grant = await control.requestGrant("req-1");
      expect(grant.ok).toBe(true);
      expect(grant.grantId).toBeTruthy();
      expect(grant.expiresAt!).toBeGreaterThan(Date.now());

      const phone = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      const phoneReceived: Buffer[] = [];
      phone.on("message", (raw) => phoneReceived.push(raw as Buffer));
      await once(phone, "open");

      const attachRequest = await control.next<RelayAttachRequest>(
        (m) => (m as { type?: string }).type === "relay-attach-request",
      );
      expect(attachRequest.target).toEqual(TARGET);

      const desktop = new WebSocket(
        `ws://127.0.0.1:${relay.port}/ws/host-attach/${attachRequest.ticket}`,
      );
      const desktopReceived: Buffer[] = [];
      desktop.on("message", (raw) => desktopReceived.push(raw as Buffer));
      await once(desktop, "open");
      // 配对是异步的；等待两端都能收到对端数据再断言。
      desktop.send(Buffer.from("hello-phone"));
      phone.send(Buffer.from("hello-desktop"));
      await waitFor(() => phoneReceived.length > 0 && desktopReceived.length > 0);
      expect(Buffer.concat(phoneReceived).toString()).toBe("hello-phone");
      expect(Buffer.concat(desktopReceived).toString()).toBe("hello-desktop");

      control.ws.send(
        JSON.stringify({ type: "relay-attach-result", ticket: attachRequest.ticket, ok: true }),
      );
      phone.close();
      desktop.close();
      control.ws.close();
    } finally {
      await relay.close();
    }
  });

  it("链接即凭证：刷新与多端重复接入同一 grant 均有效", async () => {
    const relay = await createRelayHttpServer({ host: "127.0.0.1", port: 0, logger: silentLogger });
    try {
      const control = await openControl(relay);
      const grant = await control.requestGrant("req-2");

      // 第一端接入后关闭（模拟页面刷新前的连接被断开）。
      const first = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      await once(first, "open");
      const firstAttach = await control.next<RelayAttachRequest>(
        (m) => (m as { type?: string }).type === "relay-attach-request",
      );
      first.close();

      // 刷新/第二台浏览器用同一链接再接入：不再消费 grant，拿到新的 attach 调度。
      const second = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      await once(second, "open");
      const secondAttach = await control.next<RelayAttachRequest>(
        (m) => (m as { type?: string }).type === "relay-attach-request",
      );
      expect(secondAttach.ticket).not.toBe(firstAttach.ticket);
      expect(secondAttach.target).toEqual(TARGET);

      // 多端并存：第一端重新连接也仍然有效。
      const third = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      await once(third, "open");
      third.close();
      second.close();
      control.ws.close();
    } finally {
      await relay.close();
    }
  });

  it("桌面回连超时：手机被关闭", async () => {
    const relay = await createRelayHttpServer({
      host: "127.0.0.1",
      port: 0,
      attachWaitDesktopTimeoutMs: 120,
      logger: silentLogger,
    });
    try {
      const control = await openControl(relay);
      const grant = await control.requestGrant("req-3");
      const phone = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      await once(phone, "open");
      const [closeCode, closeReason] = (await once(phone, "close")) as [number, Buffer];
      expect(closeCode).toBe(1011);
      expect(closeReason.toString()).toBe("Desktop did not attach in time");
      control.ws.close();
    } finally {
      await relay.close();
    }
  });

  it("手机接入时桌面离线：拒绝连接但 grant 保留，桌面恢复后同一链接可继续接入", async () => {
    const relay = await createRelayHttpServer({ host: "127.0.0.1", port: 0, logger: silentLogger });
    try {
      const control = await openControl(relay);
      const grant = await control.requestGrant("req-4");
      control.ws.close();
      // 等控制连接 close 事件落地（dropControl 同步执行）。
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      const response = await fetch(`http://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      expect(response.status).toBe(503);

      // 桌面恢复：grant 未被消费，同一链接重新接入成功。
      const restored = await openControl(relay);
      const phone = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      await once(phone, "open");
      const attachRequest = await restored.next<RelayAttachRequest>(
        (m) => (m as { type?: string }).type === "relay-attach-request",
      );
      expect(attachRequest.target).toEqual(TARGET);
      phone.close();
      restored.ws.close();
    } finally {
      await relay.close();
    }
  });

  it("grant 未使用超时失效：签发后超过 TTL 无接入即拒绝", async () => {
    let current = Date.now();
    const relay = await createRelayHttpServer({
      host: "127.0.0.1",
      port: 0,
      now: () => current,
      logger: silentLogger,
    });
    try {
      const control = await openControl(relay);
      const grant = await control.requestGrant("req-expire-unused");
      current += 11 * 60_000;
      const bootstrap = await fetch(
        `http://127.0.0.1:${relay.port}/api/remote/bootstrap/${grant.grantId}`,
      );
      expect(bootstrap.status).toBe(404);
      const response = await fetch(`http://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      expect(response.status).toBe(401);
      control.ws.close();
    } finally {
      await relay.close();
    }
  });

  it("接入后切换为闲置窗口：超出签发 TTL 仍有效，闲置超过窗口才失效", async () => {
    let current = Date.now();
    // 闲置窗口取 15min：足够跨越「签发后 10 分钟未使用」的默认窗口，便于断言切换语义。
    const idleTtlMs = 15 * 60_000;
    const relay = await createRelayHttpServer({
      host: "127.0.0.1",
      port: 0,
      grantActiveIdleTtlMs: idleTtlMs,
      now: () => current,
      logger: silentLogger,
    });
    try {
      const control = await openControl(relay);
      const grant = await control.requestGrant("req-expire-idle");

      // 首次接入即 touch（闲置窗口从接入重算），随后断开再 touch（从断开重算）。
      const phone = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      await once(phone, "open");
      await control.next<RelayAttachRequest>(
        (m) => (m as { type?: string }).type === "relay-attach-request",
      );
      phone.close();
      await waitFor(() => phone.readyState === WebSocket.CLOSED);
      current += 11 * 60_000;

      // 已远超「签发后 10 分钟未使用」窗口，但闲置窗口（接入时重算）内 bootstrap 仍可读。
      const bootstrap = await fetch(
        `http://127.0.0.1:${relay.port}/api/remote/bootstrap/${grant.grantId}`,
      );
      expect(bootstrap.status).toBe(200);

      // 闲置超过窗口：拒绝且不允许复活。
      current += idleTtlMs + 60_000;
      const expired = await fetch(
        `http://127.0.0.1:${relay.port}/api/remote/bootstrap/${grant.grantId}`,
      );
      expect(expired.status).toBe(404);
      const reconnect = await fetch(`http://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
      expect(reconnect.status).toBe(401);
      control.ws.close();
    } finally {
      await relay.close();
    }
  });

  it("同连接重复 hello：幂等处理，不触发 superseded 断连", async () => {
    const relay = await createRelayHttpServer({ host: "127.0.0.1", port: 0, logger: silentLogger });
    try {
      const control = await openControl(relay);
      // 同一连接重发 hello（客户端重试逻辑等）：修复前会走 superseded 路径，
      // 关闭自身连接并按桌面离线收口所有 pending attach。
      control.ws.send(
        JSON.stringify({
          type: "relay-control-hello",
          deviceId: "device-test",
          relayToken: DEVICE_TOKEN,
          version: ZXCODE_RELAY_PROTOCOL_VERSION,
        }),
      );
      const ack = await control.next((m) => (m as { type?: string }).type === "relay-control-ack");
      expect((ack as { deviceId?: string }).deviceId).toBe("device-test");

      // 连接仍然存活且控制注册未被拆掉：还能正常签发 grant。
      const grant = await control.requestGrant("req-dup-hello");
      expect(grant.ok).toBe(true);

      control.ws.close();
    } finally {
      await relay.close();
    }
  });

  it("无 token 部署：桌面 hello 携带空 relayToken 也能建立控制连接", async () => {
    const relay = await createRelayHttpServer({ host: "127.0.0.1", port: 0, logger: silentLogger });
    try {
      // 桌面端未配置 token 时 relayToken 发送空串；修复前 schema 要求非空，
      // hello 解析失败被当作未握手关闭（1002 hello-required），桌面陷入无限重连。
      const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/host-control`);
      const inbox: unknown[] = [];
      ws.on("message", (raw) => inbox.push(JSON.parse(String(raw))));
      await once(ws, "open");
      ws.send(
        JSON.stringify({
          type: "relay-control-hello",
          deviceId: "device-no-token",
          relayToken: "",
          version: ZXCODE_RELAY_PROTOCOL_VERSION,
        }),
      );
      await waitFor(() => inbox.some((m) => (m as { type?: string }).type === "relay-control-ack"));
      const ack = inbox.find((m) => (m as { type?: string }).type === "relay-control-ack") as {
        deviceId?: string;
      };
      expect(ack.deviceId).toBe("device-no-token");
      ws.close();
    } finally {
      await relay.close();
    }
  });

  it("静态托管：未配置 webRoot 返回引导页", async () => {
    const relay = await createRelayHttpServer({ host: "127.0.0.1", port: 0, logger: silentLogger });
    try {
      const response = await fetch(`http://127.0.0.1:${relay.port}/`);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toMatch(/ZxCode Relay/);
    } finally {
      await relay.close();
    }
  });
});
