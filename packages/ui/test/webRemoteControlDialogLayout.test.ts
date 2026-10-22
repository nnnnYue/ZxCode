// @vitest-environment jsdom

import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebRemoteControlDialog } from "@/WebRemoteControlDialog.js";

vi.mock("@/components/ui/button.js", () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement("button", props, children),
}));

vi.mock("@/components/ui/dialog.js", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  DialogContent: ({
    children,
    className,
    showCloseButton: _showCloseButton,
    ...props
  }: {
    children?: ReactNode;
    className?: string;
    showCloseButton?: boolean;
    [key: string]: unknown;
  }) => createElement("section", { className, ...props }, children),
  DialogDescription: ({ children }: { children?: ReactNode }) => createElement("p", null, children),
  DialogHeader: ({ children, className }: { children?: ReactNode; className?: string }) =>
    createElement("header", { className }, children),
  DialogTitle: ({ children }: { children?: ReactNode }) => createElement("h2", null, children),
}));

const feedbackMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/components/ui/toast.js", () => ({ toast: feedbackMocks.toast }));

vi.mock("@/BotsDialog.js", () => ({
  BotsDialog: () => createElement("div", { "data-testid": "bots-dialog" }),
}));

const qrcodeMock = vi.hoisted(() => ({
  toDataURL: vi.fn(async (text: string) => `data:image/png;base64,${encodeURIComponent(text)}`),
}));

vi.mock("qrcode", () => ({ default: qrcodeMock }));

const relayStatusMock = vi.hoisted(() => ({
  current: { supported: true, enabled: true, connected: true, serverUrl: "http://127.0.0.1:8787" },
}));

vi.mock("@/hooks/useMobileRelayStatus.js", () => ({
  useMobileRelayStatus: () => relayStatusMock.current,
}));

const platformMock = vi.hoisted(() => ({
  requestMobileRelayGrant: vi.fn(),
}));

vi.mock("@/hooks/usePlatform.js", () => ({
  usePlatform: () => platformMock,
}));

const clipboardMock = vi.hoisted(() => ({ writeText: vi.fn(async () => undefined) }));

// 必须返回稳定引用：intl 对象若每次渲染新建，弹层内 useCallback 依赖变化会让
// 自动生成的 effect 反复重跑（实测一次 render 触发 3 次 grant 请求）。
const intlRef = {
  intl: {
    formatMessage: ({ id }: { id: string }) => id,
  },
};
vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => intlRef,
}));

vi.mock("@/logger.js", () => ({
  logger: {
    error: feedbackMocks.error,
    info: feedbackMocks.info,
    warn: feedbackMocks.warn,
  },
}));

function renderDialog(props?: { workspaceIdentity?: string; remoteSessionId?: string }) {
  return render(
    createElement(WebRemoteControlDialog, {
      open: true,
      onOpenChange: vi.fn(),
      workspacePath: "/tmp/project",
      ...props,
    }),
  );
}

describe("WebRemoteControlDialog（relay 授权链接版）", () => {
  afterEach(() => {
    cleanup();
    platformMock.requestMobileRelayGrant.mockReset();
    qrcodeMock.toDataURL.mockClear();
    feedbackMocks.error.mockClear();
    feedbackMocks.info.mockClear();
    feedbackMocks.warn.mockClear();
    feedbackMocks.toast.mockClear();
    relayStatusMock.current = {
      supported: true,
      enabled: true,
      connected: true,
      serverUrl: "http://127.0.0.1:8787",
    };
  });

  it("打开弹层即自动请求 relay 授权链接并渲染二维码", async () => {
    platformMock.requestMobileRelayGrant.mockResolvedValueOnce({
      success: true,
      url: "http://127.0.0.1:8787/?remote=grant-1",
      expiresAt: Date.now() + 10 * 60_000,
    });

    const view = renderDialog();

    await waitFor(() => expect(platformMock.requestMobileRelayGrant).toHaveBeenCalledOnce());
    expect(platformMock.requestMobileRelayGrant).toHaveBeenCalledWith({
      workspacePath: "/tmp/project",
    });
    await waitFor(() =>
      expect(qrcodeMock.toDataURL).toHaveBeenCalledWith(
        "http://127.0.0.1:8787/?remote=grant-1",
        expect.anything(),
      ),
    );
    const img = await view.findByRole("img");
    expect(img.getAttribute("src")).toContain("grant-1");
    expect(view.container.textContent).toContain("webRemoteControl.relay.expiresIn");
    expect(view.container.textContent).toContain("webRemoteControl.relay.status.connected");
  });

  it("生成失败时展示错误并允许重新生成重试", async () => {
    platformMock.requestMobileRelayGrant
      .mockResolvedValueOnce({ success: false, error: "relay control connection lost" })
      .mockResolvedValueOnce({
        success: true,
        url: "http://127.0.0.1:8787/?remote=grant-2",
        expiresAt: Date.now() + 10 * 60_000,
      });

    const view = renderDialog();

    await waitFor(() =>
      expect(view.container.textContent).toContain("relay control connection lost"),
    );
    expect(view.queryByRole("img")).toBeNull();

    // 重新生成直接重试，不做确认弹窗（旧链接在闲置窗口内不受影响）。
    const regenerate = await view.findByRole("button", {
      name: /webRemoteControl.relay.regenerate/,
    });
    fireEvent.click(regenerate);
    await waitFor(() => expect(platformMock.requestMobileRelayGrant).toHaveBeenCalledTimes(2));
    const img = await view.findByRole("img");
    expect(img.getAttribute("src")).toContain("grant-2");
  });

  it("复制链接写入剪贴板", async () => {
    platformMock.requestMobileRelayGrant.mockResolvedValueOnce({
      success: true,
      url: "http://127.0.0.1:8787/?remote=grant-copy",
      expiresAt: Date.now() + 10 * 60_000,
    });
    Object.assign(navigator, { clipboard: clipboardMock });

    const view = renderDialog();
    const copy = await view.findByRole("button", { name: /webRemoteControl.copyLink$/ });
    fireEvent.click(copy);

    await waitFor(() =>
      expect(clipboardMock.writeText).toHaveBeenCalledWith(
        "http://127.0.0.1:8787/?remote=grant-copy",
      ),
    );
  });

  it("扫码卡在前、Bot Channel 在后，四个 Bot 入口齐全", async () => {
    platformMock.requestMobileRelayGrant.mockResolvedValueOnce({
      success: true,
      url: "http://127.0.0.1:8787/?remote=grant-3",
      expiresAt: Date.now() + 10 * 60_000,
    });

    const view = renderDialog();
    await view.findByRole("img");
    const html = view.container.innerHTML;

    const scanCardIndex = html.indexOf('data-testid="web-remote-control-scan-card"');
    const copyLinkIndex = html.indexOf('data-testid="web-remote-control-copy-link-row"');
    const botChannelIndex = html.indexOf("webRemoteControl.botChannel.title");
    expect(scanCardIndex).toBeGreaterThan(-1);
    expect(copyLinkIndex).toBeGreaterThan(scanCardIndex);
    expect(botChannelIndex).toBeGreaterThan(copyLinkIndex);

    expect(html).toContain("webRemoteControl.botChannel.weixin.title");
    expect(html).toContain("webRemoteControl.botChannel.feishu.title");
    expect(html).toContain("webRemoteControl.botChannel.lark.title");
    expect(html).toContain("webRemoteControl.botChannel.telegram.title");
    expect(html).toContain('data-testid="web-remote-control-open-bots"');
  });

  it("relay 控制连接失败时状态行展示错误", async () => {
    relayStatusMock.current = {
      supported: true,
      enabled: true,
      connected: false,
      serverUrl: "http://127.0.0.1:8787",
      lastError: "connection refused",
    };
    platformMock.requestMobileRelayGrant.mockResolvedValueOnce({
      success: true,
      url: "http://127.0.0.1:8787/?remote=grant-4",
      expiresAt: Date.now() + 10 * 60_000,
    });

    const view = renderDialog();
    await view.findByRole("img");
    expect(view.container.textContent).toContain("webRemoteControl.relay.status.error");
  });
});
