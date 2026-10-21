// desktopRelayClient 健壮性行为回归：grant 超时结算、close 码可见、
// hello ack 超时与服务端静默的僵尸连接重建。这三类缺陷的共同后果是
// 设置页"生成链接"永久 loading 或状态栏永远"连接中…"（生产反馈 2026-10）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { FakeWebSocket } = vi.hoisted(() => {
  class FakeWebSocket {
    static readonly OPEN = 1;
    static instances: FakeWebSocket[] = [];
    readyState: number = FakeWebSocket.OPEN;
    sent: unknown[] = [];
    closeCalls: Array<{ code?: number; reason?: string }> = [];
    private handlers = new Map<string, Array<(...args: unknown[]) => void>>();

    constructor(
      public url: string,
      _options?: unknown,
    ) {
      FakeWebSocket.instances.push(this);
    }

    on(event: string, cb: (...args: unknown[]) => void): void {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), cb]);
    }

    send(data: string): void {
      this.sent.push(JSON.parse(data));
    }

    close(code?: number, reason?: string): void {
      this.closeCalls.push({ code, reason });
    }

    emit(event: string, ...args: unknown[]): void {
      for (const cb of this.handlers.get(event) ?? []) cb(...args);
    }

    lastSentOf(type: string): unknown | undefined {
      return [...this.sent].reverse().find((m) => (m as { type?: string }).type === type);
    }
  }
  return { FakeWebSocket };
});

vi.mock("ws", () => ({ default: FakeWebSocket }));

import { RELAY_CONTROL_HEARTBEAT_INTERVAL_MS, ZXCODE_RELAY_PROTOCOL_VERSION } from "@zcode/shared";
import { createDesktopRelayClient } from "../src/main/desktopRelayClient.js";

const silentLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

function createClient(overrides?: { listWindowWorkspaces?: () => unknown[]; now?: () => number }) {
  const listWindowWorkspaces =
    overrides?.listWindowWorkspaces ??
    (() => [{ windowId: 1, workspacePath: "/demo", workspaceKey: "/demo" }]);
  return createDesktopRelayClient({
    logger: silentLogger,
    deviceId: "device-test",
    ...(overrides?.now ? { now: overrides.now } : {}),
    listWindowWorkspaces,
    listRemoteWorkspaceSessions: () => [],
    attachLocalWorkspace: () => {
      throw new Error("not used in these tests");
    },
    attachRemoteWorkspace: () => {
      throw new Error("not used in these tests");
    },
  });
}

/** 建立到"已连接"状态：applySettings → open → hello → ack。 */
function establishControl(handle: ReturnType<typeof createClient>): FakeWebSocket {
  handle.applySettings({ enabled: true, serverUrl: "https://relay.example.com", token: "t" });
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error("control websocket not created");
  ws.emit("open");
  expect(ws.lastSentOf("relay-control-hello")).toMatchObject({
    deviceId: "device-test",
    relayToken: "t",
    version: ZXCODE_RELAY_PROTOCOL_VERSION,
  });
  ws.emit("message", Buffer.from(JSON.stringify({ type: "relay-control-ack", deviceId: "d" })));
  return ws;
}

describe("desktopRelayClient 健壮性", () => {
  let fakeNow = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    fakeNow = 0;
    FakeWebSocket.instances = [];
  });

  afterEach(async () => {
    await vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("grant 无回包时按超时失败结算，Promise 不再悬挂", async () => {
    const handle = createClient({ now: () => fakeNow });
    establishControl(handle);

    const grantPromise = handle.requestGrant({ workspacePath: "/demo" });
    const ws = FakeWebSocket.instances.at(-1);
    expect(ws?.lastSentOf("relay-issue-grant-request")).toMatchObject({
      target: { kind: "local" },
    });

    // relay 永不回包（半开连接）：15s 后必须本地失败结算，否则 UI 永久 loading。
    vi.advanceTimersByTime(15_000);
    await expect(grantPromise).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("超时"),
    });
    await handle.dispose();
  });

  it("异常 close 码与原因写入 lastError，不再只显示'连接中…'", async () => {
    const handle = createClient({ now: () => fakeNow });
    const ws = establishControl(handle);

    ws.emit("close", 1013, Buffer.from("another desktop already connected"));
    expect(handle.getStatus().lastError).toContain("1013");
    expect(handle.getStatus().lastError).toContain("another desktop already connected");
    expect(handle.getStatus().connected).toBe(false);
    await handle.dispose();
  });

  it("hello 后 relay 长时间不 ack：重建控制连接", async () => {
    const handle = createClient({ now: () => fakeNow });
    handle.applySettings({ enabled: true, serverUrl: "https://relay.example.com" });
    const first = FakeWebSocket.instances.at(-1);
    first?.emit("open");
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(10_000);
    expect(first?.closeCalls.length).toBeGreaterThan(0);

    // 重连退避到期后必须发起新连接。
    vi.advanceTimersByTime(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await handle.dispose();
  });

  it("服务端静默超过宽限：判定僵尸连接并重建", async () => {
    const handle = createClient({ now: () => fakeNow });
    establishControl(handle);

    const advance = (ms: number): void => {
      fakeNow += ms;
      vi.advanceTimersByTime(ms);
    };
    // 推进超过 RELAY_SERVER_SILENCE_LIMIT_MS（2×心跳间隔 + 15s），期间不回任何消息。
    advance(RELAY_CONTROL_HEARTBEAT_INTERVAL_MS * 2 + 16_000);
    expect(handle.getStatus().connected).toBe(false);

    advance(1_000);
    expect(FakeWebSocket.instances.length).toBeGreaterThan(1);
    await handle.dispose();
  });
});
