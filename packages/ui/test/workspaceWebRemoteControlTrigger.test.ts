import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { relayStatusMock, resolvedRemoteSessionIdMock } = vi.hoisted(() => ({
  relayStatusMock: vi.fn<
    () =>
      | {
          supported: boolean;
          enabled: boolean;
          connected: boolean;
          serverUrl?: string;
          lastError?: string;
        }
      | undefined
  >(),
  resolvedRemoteSessionIdMock: vi.fn<() => string | null>(),
}));

vi.mock("@/ControlHintTooltip.js", () => ({
  ControlHintTooltip: ({
    children,
    title,
    description,
    side,
  }: {
    children: unknown;
    title: string;
    description?: string;
    side?: string;
  }) =>
    createElement(
      "span",
      {
        "data-tooltip-title": title,
        "data-tooltip-description": description ?? "",
        "data-tooltip-side": side ?? "",
      },
      children,
    ),
}));

vi.mock("@/components/ui/button.js", () => ({
  Button: ({ children, ...props }: { children: unknown; [key: string]: unknown }) =>
    createElement("button", props, children),
}));

vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    intl: {
      formatMessage: ({ id }: { id: string }) => id,
    },
  }),
}));

vi.mock("@/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/hooks/useMobileRelayStatus.js", () => ({
  useMobileRelayStatus: relayStatusMock,
}));

vi.mock("@/hooks/useResolvedRemoteWorkspaceSessionId.js", () => ({
  useResolvedRemoteWorkspaceSessionId: resolvedRemoteSessionIdMock,
}));

vi.mock("@/WebRemoteControlDialog.js", () => ({
  WebRemoteControlDialog: ({ remoteSessionId }: { remoteSessionId?: string }) =>
    createElement("div", {
      "data-testid": "web-remote-control-dialog",
      "data-remote-session-id": remoteSessionId ?? "",
    }),
}));

const RELAY_READY = {
  supported: true,
  enabled: true,
  connected: true,
  serverUrl: "http://127.0.0.1:8787",
} as const;

afterEach(() => {
  relayStatusMock.mockReset();
  resolvedRemoteSessionIdMock.mockReset();
  vi.resetModules();
});

describe("WorkspaceWebRemoteControlTrigger（relay-only 入口）", () => {
  it("relay 已开启并配置时展示入口，tooltip 为 relay 连接态", async () => {
    const { WorkspaceWebRemoteControlTrigger } =
      await import("../src/WorkspaceWebRemoteControlTrigger.js");
    relayStatusMock.mockReturnValue(RELAY_READY);
    const html = renderToStaticMarkup(
      createElement(WorkspaceWebRemoteControlTrigger, { workspacePath: "/tmp/project" }),
    );

    expect(html).toContain("webRemoteControl.trigger");
    expect(html).toContain(
      'data-tooltip-description="webRemoteControl.triggerStatus.relayConnected"',
    );
    expect(html).toContain("text-success");
  });

  it("relay 未开启或未配置时不渲染入口（removes 规范：无 relay 无入口）", async () => {
    const { WorkspaceWebRemoteControlTrigger } =
      await import("../src/WorkspaceWebRemoteControlTrigger.js");
    for (const relayStatus of [
      undefined,
      { supported: true, enabled: false, connected: false },
      { supported: true, enabled: true, connected: false },
      { supported: false, enabled: true, connected: true },
    ]) {
      relayStatusMock.mockReturnValue(relayStatus);
      const html = renderToStaticMarkup(
        createElement(WorkspaceWebRemoteControlTrigger, { workspacePath: "/tmp/project" }),
      );
      expect(html).not.toContain("webRemoteControl.trigger");
    }
  });

  it("relay 连接失败时入口保留且图标为红色错误态", async () => {
    const { WorkspaceWebRemoteControlTrigger } =
      await import("../src/WorkspaceWebRemoteControlTrigger.js");
    relayStatusMock.mockReturnValue({
      ...RELAY_READY,
      connected: false,
      lastError: "connection refused",
    });
    const html = renderToStaticMarkup(
      createElement(WorkspaceWebRemoteControlTrigger, { workspacePath: "/tmp/project" }),
    );

    expect(html).toContain("webRemoteControl.trigger");
    expect(html).toContain("text-destructive");
    expect(html).toContain('data-tooltip-description="webRemoteControl.triggerStatus.relayError"');
  });

  it("用 workspaceIdentity 精确解析远控 session，并只向弹层传递已验证结果", async () => {
    const { WorkspaceWebRemoteControlTrigger } =
      await import("../src/WorkspaceWebRemoteControlTrigger.js");
    relayStatusMock.mockReturnValue(RELAY_READY);
    resolvedRemoteSessionIdMock.mockReturnValue(null);

    const html = renderToStaticMarkup(
      createElement(WorkspaceWebRemoteControlTrigger, {
        workspacePath: "/tmp/project",
        workspaceIdentity: "remote:ssh:localhost:2222:root:/tmp/project",
        remoteSessionId: "stale-session",
      }),
    );

    expect(resolvedRemoteSessionIdMock).toHaveBeenCalledWith(
      "/tmp/project",
      "stale-session",
      "remote:ssh:localhost:2222:root:/tmp/project",
    );
    expect(html).toContain('data-remote-session-id=""');
    expect(html).not.toContain('data-remote-session-id="stale-session"');
  });
});
