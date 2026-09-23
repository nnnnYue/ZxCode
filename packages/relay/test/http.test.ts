import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import WebSocket from "ws";
import { createRelayHttpServer, type RelayHttpServer } from "../src/http.js";
import {
  ZXCODE_RELAY_PROTOCOL_VERSION,
  type RelayAttachRequest,
  type RelayIssueGrantResponse,
} from "@zcode/shared/zcode-relay-protocol";

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

test("host-control 鉴权：错误 token 拒绝升级", async () => {
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
    assert.equal(response.status, 401);
  } finally {
    await relay.close();
  }
});

test("完整链路：签发 grant → 手机接入 → 桌面回连 → 字节管道双向透传", async () => {
  const relay = await createRelayHttpServer({
    host: "127.0.0.1",
    port: 0,
    logger: silentLogger,
  });
  try {
    const control = await openControl(relay);
    const grant = await control.requestGrant("req-1");
    assert.equal(grant.ok, true);
    assert.ok(grant.grantId);
    assert.ok(grant.expiresAt! > Date.now());

    const phone = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
    const phoneReceived: Buffer[] = [];
    phone.on("message", (raw) => phoneReceived.push(raw as Buffer));
    await once(phone, "open");

    const attachRequest = await control.next<RelayAttachRequest>(
      (m) => (m as { type?: string }).type === "relay-attach-request",
    );
    assert.deepEqual(attachRequest.target, TARGET);

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
    assert.equal(Buffer.concat(phoneReceived).toString(), "hello-phone");
    assert.equal(Buffer.concat(desktopReceived).toString(), "hello-desktop");

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

test("grant 一次性：手机重放被拒绝", async () => {
  const relay = await createRelayHttpServer({ host: "127.0.0.1", port: 0, logger: silentLogger });
  try {
    const control = await openControl(relay);
    const grant = await control.requestGrant("req-2");
    const first = new WebSocket(`ws://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
    await once(first, "open");
    const attachRequest = await control.next<RelayAttachRequest>(
      (m) => (m as { type?: string }).type === "relay-attach-request",
    );
    const desktop = new WebSocket(
      `ws://127.0.0.1:${relay.port}/ws/host-attach/${attachRequest.ticket}`,
    );
    await once(desktop, "open");
    first.close();
    desktop.close();

    const response = await fetch(`http://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
    assert.equal(response.status, 401);
    control.ws.close();
  } finally {
    await relay.close();
  }
});

test("桌面回连超时：手机被关闭", async () => {
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
    assert.equal(closeCode, 1011);
    assert.equal(closeReason.toString(), "Desktop did not attach in time");
    control.ws.close();
  } finally {
    await relay.close();
  }
});

test("手机接入时桌面离线：grant 已消费仍拒绝连接", async () => {
  const relay = await createRelayHttpServer({ host: "127.0.0.1", port: 0, logger: silentLogger });
  try {
    const control = await openControl(relay);
    const grant = await control.requestGrant("req-4");
    control.ws.close();
    await control.next(() => false).catch(() => undefined);
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const response = await fetch(`http://127.0.0.1:${relay.port}/ws/remote/${grant.grantId}`);
    assert.equal(response.status, 503);
  } finally {
    await relay.close();
  }
});

test("同连接重复 hello：幂等处理，不触发 superseded 断连", async () => {
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
    const ack = await control.next(
      (m) => (m as { type?: string }).type === "relay-control-ack",
    );
    assert.equal((ack as { deviceId?: string }).deviceId, "device-test");

    // 连接仍然存活且控制注册未被拆掉：还能正常签发 grant。
    const grant = await control.requestGrant("req-dup-hello");
    assert.equal(grant.ok, true);

    control.ws.close();
  } finally {
    await relay.close();
  }
});

test("静态托管：未配置 webRoot 返回引导页", async () => {
  const relay = await createRelayHttpServer({ host: "127.0.0.1", port: 0, logger: silentLogger });
  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /ZxCode Relay/);
  } finally {
    await relay.close();
  }
});

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
