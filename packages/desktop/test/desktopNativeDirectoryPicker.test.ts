import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformChannels } from "@zcode/shared";

/**
 * 回归防线：桌面本地项目「选择文件夹」必须走系统原生多选目录框。
 *
 * 缺陷根因：v3.17.2 合并时 desktop/src 整体回退到 fork 版本，main handler、preload 桥接与
 * renderer 平台方法三段接线一起丢失，只剩 shared 侧的 SelectDirectories 频道与
 * ProjectEditor 的调用方。ProjectEditor 判定平台没有 selectDirectories 时退化为应用内
 * DirectoryBrowser（顶部只能手动输入路径），于是「选择文件夹」不再弹系统框。
 *
 * 本用例覆盖三段接线：main 注册 handler、preload 转发频道、renderer 平台委托 window.zxcode。
 * 任一段被合并覆盖掉都会在此失败。
 */

type IpcHandler = (...args: unknown[]) => unknown;

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, IpcHandler>();
  const exposed = new Map<string, unknown>();
  return {
    handlers,
    exposed,
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(async () => ({ response: 1 })),
    ipcInvoke: vi.fn(async () => []),
    ipcOn: vi.fn(),
    ipcSend: vi.fn(),
    ipcHandle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }),
    exposeInMainWorld: vi.fn((key: string, value: unknown) => {
      exposed.set(key, value);
    }),
    browserWindowFromWebContents: vi.fn(() => null),
  };
});

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: electronMocks.browserWindowFromWebContents,
  },
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  dialog: {
    showOpenDialog: electronMocks.showOpenDialog,
    showMessageBox: electronMocks.showMessageBox,
  },
  ipcMain: {
    handle: electronMocks.ipcHandle,
    on: electronMocks.ipcOn,
  },
  ipcRenderer: {
    invoke: electronMocks.ipcInvoke,
    on: vi.fn(),
    removeListener: vi.fn(),
    send: electronMocks.ipcSend,
  },
  nativeImage: {},
  nativeTheme: {
    themeSource: "system",
  },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn(),
  },
  webFrame: {
    getZoomFactor: vi.fn(() => 1),
    getZoomLevel: vi.fn(() => 0),
    setZoomLevel: vi.fn(),
  },
  webUtils: {
    getPathForFile: vi.fn(() => ""),
  },
}));

vi.mock("@zcode/services/node", () => ({
  readZCodeStdioTapDevState: vi.fn(() => null),
}));

// main 模块的本地依赖在导入期就会摸 electron / 系统目录，逐个隔离，保持本用例只覆盖平台 IPC 注册。
vi.mock("../src/main/editors.js", () => ({
  getAppIconDataUrl: vi.fn(async () => ""),
  getInstalledEditors: vi.fn(() => []),
}));
vi.mock("../src/main/file-open-apps/index.js", () => ({
  createFileApplicationService: vi.fn(() => ({})),
}));
vi.mock("../src/main/customEditors.js", () => ({
  addCustomEditor: vi.fn(),
  listCustomEditors: vi.fn(() => []),
  removeCustomEditor: vi.fn(),
}));
vi.mock("../src/main/applicationIcons.js", () => ({
  getApplicationIcon: vi.fn(),
}));
vi.mock("../src/main/exportLogs.js", () => ({
  exportLogs: vi.fn(),
}));
vi.mock("../src/main/openInEditor.js", () => ({
  openInEditor: vi.fn(),
}));
vi.mock("../src/main/resourceManagerWindow.js", () => ({
  getResourceUsageSnapshot: vi.fn(),
  openResourceManager: vi.fn(),
  setResourceUsageSamplingActive: vi.fn(),
}));
vi.mock("../src/main/resourceManagerStorage.js", () => ({
  registerResourceManagerStorageIpc: vi.fn(),
}));
vi.mock("../src/main/resourceManagerNetwork.js", () => ({
  registerResourceManagerNetworkIpc: vi.fn(),
}));
vi.mock("../src/main/desktopWindowChrome.js", () => ({
  applyWindowsTitleBarTheme: vi.fn(),
  getWindowOverlayTheme: vi.fn(() => null),
}));
vi.mock("../src/main/desktopWindowChromeState.js", () => ({
  resolveDesktopWindowChromeState: vi.fn(() => ({})),
}));
vi.mock("../src/main/desktopWindowButtonPosition.js", () => ({
  syncWindowControlsOverlayForZoomLevel: vi.fn(),
}));
vi.mock("../src/main/desktopZoom.js", () => ({
  resolveDesktopZoomLevelFromFactor: vi.fn(() => 0),
}));
vi.mock("../src/main/desktopWindowLifecycle.js", () => ({
  handleWindowUnreadCountSync: vi.fn(),
}));
vi.mock("../src/main/desktopMainIpcHelpers.js", () => ({
  captureWindowScreenshot: vi.fn(),
  openPathInFileManager: vi.fn(),
}));
vi.mock("../src/main/desktopCuaPermissionIpc.js", () => ({
  registerCuaPermissionIpcHandlers: vi.fn(),
}));
vi.mock("../src/main/desktopBrowserViewIpc.js", () => ({
  registerDesktopBrowserIpcHandlers: vi.fn(),
}));
vi.mock("../src/main/mcpUserDirectory/index.js", () => ({
  loadCliMcpFromUserDirectory: vi.fn(),
  migrateLegacyCommonMcp: vi.fn(),
  saveCliMcpToUserDirectory: vi.fn(),
}));
vi.mock("../src/main/tempTextAttachment.js", () => ({
  createTempTextAttachment: vi.fn(),
}));
vi.mock("../src/main/workflowArtifactFile.js", () => ({
  materializeWorkflowArtifactFile: vi.fn(),
}));
vi.mock("../src/main/desktopSaveFile.js", () => ({
  registerDesktopSaveFileIpcHandler: vi.fn(),
}));
vi.mock("../src/main/desktopPrintToPdf.js", () => ({
  registerDesktopPrintToPdfIpcHandler: vi.fn(),
}));
vi.mock("../src/main/desktopCuaPipIpc.js", () => ({
  registerCuaPipActiveSessionIpc: vi.fn(),
}));
vi.mock("../src/preload/pluginSandbox/hostBridge.js", () => ({
  installPluginSandboxHostBridge: vi.fn(),
}));
vi.mock("@zcode/ui", () => ({
  recordArmsCustomEventForE2E: vi.fn(),
}));

async function registerPlatformHandlers(): Promise<void> {
  const { registerPlatformIpcHandlers } = await import("../src/main/desktopMainIpcPlatform.js");
  registerPlatformIpcHandlers({
    logger: { info: vi.fn(), warn: vi.fn() },
    applyApplicationLocale: vi.fn(async () => {}),
    resolveSystemLocale: () => "en-US",
    focusWorkspaceInExistingWindow: vi.fn(() => ({ activated: false })),
    windowWorkspaceMap: new Map(),
    windowUnreadCountMap: new Map(),
    currentApplicationLocale: () => "en-US",
    executeDesktopCommand: vi.fn(async () => {}),
    syncActiveTaskSession: vi.fn(),
    syncTaskRealtimeWorkspaceKeys: vi.fn(),
    restorePreviouslyEnabledWebRemoteControl: vi.fn(),
    syncWebRemoteControlWorkspaces: vi.fn(),
    syncWebRemoteControlTasks: vi.fn(),
    getDesktopSessionActivity: vi.fn(() => ({ runningAgentSessionCount: 0 })),
    syncAppSettings: vi.fn(),
    refreshCloseToTrayCapability: vi.fn(async () => ({ supported: false })),
    deviceMid: "test-device-mid",
  });
}

describe("桌面本地项目系统多选目录", () => {
  beforeEach(() => {
    electronMocks.handlers.clear();
    electronMocks.exposed.clear();
    electronMocks.showOpenDialog.mockReset();
    electronMocks.showMessageBox.mockReset();
    electronMocks.ipcInvoke.mockReset();
    electronMocks.ipcHandle.mockClear();
    electronMocks.ipcOn.mockClear();
    electronMocks.exposeInMainWorld.mockClear();
    electronMocks.browserWindowFromWebContents.mockReset();
    electronMocks.browserWindowFromWebContents.mockReturnValue(null);
  });

  it("main 注册 SelectDirectories handler：多选参数 + 取消返回空数组", async () => {
    await registerPlatformHandlers();

    const handler = electronMocks.handlers.get(PlatformChannels.SelectDirectories);
    expect(handler).toBeDefined();

    electronMocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/one", "/two"],
    });
    await expect(handler?.()).resolves.toEqual(["/one", "/two"]);
    expect(electronMocks.showOpenDialog).toHaveBeenCalledWith({
      properties: ["openDirectory", "createDirectory", "multiSelections"],
    });

    electronMocks.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: ["/ignored"] });
    await expect(handler?.()).resolves.toEqual([]);
  });

  it("preload 把 selectDirectories 转发到 SelectDirectories 频道", async () => {
    // preload 在导入期会同步 renderer 进程标题并注册 DOMContentLoaded 监听，node 环境没有 DOM。
    (globalThis as { document?: unknown }).document = { title: "ZCode" };
    (globalThis as { window?: unknown }).window = { addEventListener: vi.fn() };
    await import("../src/preload/index.js");

    const bridge = electronMocks.exposed.get("zxcode") as
      | { selectDirectories?: () => Promise<string[]> }
      | undefined;
    expect(typeof bridge?.selectDirectories).toBe("function");

    electronMocks.ipcInvoke.mockResolvedValueOnce(["/one", "/two"]);
    await expect(bridge!.selectDirectories!()).resolves.toEqual(["/one", "/two"]);
    expect(electronMocks.ipcInvoke).toHaveBeenCalledWith(PlatformChannels.SelectDirectories);
  });

  it("renderer 平台把 selectDirectories 委托给 preload 桥", async () => {
    const selectDirectories = vi.fn(async () => ["/one", "/two"]);
    (globalThis as { window?: unknown }).window = { zxcode: { selectDirectories } };

    const { createDesktopPlatform } = await import("../src/renderer/src/desktopPlatform.js");
    const platform = createDesktopPlatform({ isLocalDevelopmentRuntime: false });
    expect(typeof platform.selectDirectories).toBe("function");
    await expect(platform.selectDirectories!()).resolves.toEqual(["/one", "/two"]);
    expect(selectDirectories).toHaveBeenCalledTimes(1);
  });
});
