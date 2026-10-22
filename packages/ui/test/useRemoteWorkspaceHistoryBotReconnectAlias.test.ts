// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { Event, ProxyChannel } from "@zcode/rpc";
import type { IServiceAccessor } from "@zcode/services";
import type { IPlatformService } from "@zcode/shared";
import { describe, expect, it, vi } from "vitest";
import { useRemoteWorkspaceHistory } from "@/root/useRemoteWorkspaceHistory.js";
import { createTabStore } from "@/store/tabStore.js";

/**
 * fork：IPlatformService 把 Bot 重连事件声明为可选别名（onRemoteSessionReconnected 别名），
 * 而 UI 此前用非空断言直接调用，平台一旦没实现别名（Web 手机远控页面即是），
 * 挂载阶段就抛 "onBotRemoteWorkspaceReconnected is not a function" 并把整个 App 打成错误页。
 */
function createServices(): IServiceAccessor {
  const credential = () =>
    ProxyChannel.toService<IServiceAccessor["credentialService"]>({
      call: vi.fn(async () => null) as never,
      listen: () => Event.None,
    });
  return { credentialService: credential(), settingService: {} } as IServiceAccessor;
}

function renderWithPlatform(platform: IPlatformService) {
  const services = createServices();
  const tabStoreApi = createTabStore();
  return renderHook(
    ({ services: injected }) =>
      useRemoteWorkspaceHistory({
        intl: { formatMessage: ({ id }: { id: string }) => id } as never,
        platform,
        services: injected,
        supportsSettings: false,
        allowRemoteWorkspace: false,
        tabStoreApi,
        activateTabByPath: tabStoreApi.getState().activateTabByPath,
        addTab: tabStoreApi.getState().addTab,
      }),
    { initialProps: { services } },
  );
}

describe("useRemoteWorkspaceHistory Bot 重连别名", () => {
  it("平台未实现 onBotRemoteWorkspaceReconnected 时挂载不抛错", () => {
    const platform = {
      onRemoteConnectionLog: () => () => {},
      onRemoteSessionClosed: () => () => {},
      onRemoteSessionReconnected: () => () => {},
    } as unknown as IPlatformService;

    const { unmount } = renderWithPlatform(platform);
    expect(() => unmount()).not.toThrow();
  });

  it("平台实现别名时订阅并在卸载时释放", () => {
    const disposer = vi.fn();
    const subscribe = vi.fn(() => disposer);
    const platform = {
      onRemoteConnectionLog: () => () => {},
      onRemoteSessionClosed: () => () => {},
      onRemoteSessionReconnected: () => () => {},
      onBotRemoteWorkspaceReconnected: subscribe,
    } as unknown as IPlatformService;

    const { unmount } = renderWithPlatform(platform);
    expect(subscribe).toHaveBeenCalledTimes(1);
    unmount();
    expect(disposer).toHaveBeenCalledTimes(1);
  });
});
