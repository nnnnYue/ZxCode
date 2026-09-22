import { DesktopCommandIds, buildLocalMediaPreviewUrl, type IPlatformService } from "@zcode/shared";

import { desktopBrowserPlatformBridge } from "./desktopBrowserPlatformBridge.js";

export function createDesktopPlatform(options: {
  isLocalDevelopmentRuntime: boolean;
}): IPlatformService {
  return {
    canSelectFilePath: true,
    createLocalMediaPreviewUrl: buildLocalMediaPreviewUrl,
    isLocalDevelopmentRuntime: options.isLocalDevelopmentRuntime,
    selectDirectory: () => window.zxcode.selectDirectory(),
    selectFile: () => window.zxcode.selectFile(),
    selectFiles: () => window.zxcode.selectFiles?.() ?? Promise.resolve([]),
    createTempTextAttachment: (payload) => window.zxcode.createTempTextAttachment(payload),
    onRemoteConnectionLog: (handler) => window.zxcode.onRemoteConnectionLog(handler),
    onRemoteSessionClosed: (handler) => window.zxcode.onRemoteSessionClosed(handler),
    activateOrSetWorkspace: (path) =>
      window.zxcode.activateOrSetWorkspace?.(path) ?? Promise.resolve({ activated: false }),
    connectRemote: (remoteOptions, requestId, context) =>
      window.zxcode.connectRemote(remoteOptions, requestId, context),
    cancelPendingRemoteConnection: (requestId) =>
      window.zxcode.cancelPendingRemoteConnection?.(requestId) ?? Promise.resolve(),
    bindRemoteWorkspaceSessionContext: (context) =>
      window.zxcode.bindRemoteWorkspaceSessionContext?.(context) ?? Promise.resolve(),
    disposeRemoteSession: (sessionId) => window.zxcode.disposeRemoteSession(sessionId),
    isDockerAvailable: () => window.zxcode.isDockerAvailable(),
    listWSLDistros: () => window.zxcode.listWSLDistros(),
    listDockerContainers: () => window.zxcode.listDockerContainers(),
    listSSHConfigAliases: () => window.zxcode.listSSHConfigAliases(),
    loadMcpFromUserDirectory: (payload) => window.zxcode.loadMcpFromUserDirectory(payload),
    saveMcpToUserDirectory: (payload) => window.zxcode.saveMcpToUserDirectory(payload),
    migrateLegacyCommonMcp: (payload) => window.zxcode.migrateLegacyCommonMcp(payload),
    openExternal: (url) => window.zxcode.openExternal(url),
    // 去平台化：社群/反馈入口已随桌面命令删除；web 形态仍实现该接口，桌面侧保留 no-op。
    openFeedback: async () => {},
    openCommunity: async () => {},
    canOpenCommunity: async () => false,
    openInFileManager: (path) => window.zxcode.openInFileManager(path),
    openExternalFile: (path) => window.zxcode.openExternalFile(path),
    openCuaPermissionOnboarding: window.zxcode.openCuaPermissionOnboarding
      ? (permissionOptions) =>
          window.zxcode.openCuaPermissionOnboarding?.(permissionOptions) ??
          Promise.resolve({ success: false, error: "not_supported" })
      : undefined,
    prepareCuaHelperPermissionDrag: window.zxcode.prepareCuaHelperPermissionDrag
      ? () =>
          window.zxcode.prepareCuaHelperPermissionDrag?.() ??
          Promise.resolve({ success: false, error: "not_supported" })
      : undefined,
    startCuaHelperPermissionDrag: window.zxcode.startCuaHelperPermissionDrag
      ? () => window.zxcode.startCuaHelperPermissionDrag?.()
      : undefined,
    onPaymentCallback: (callback) => window.zxcode.onPaymentCallback(callback),
    notifyRendererReady: () => window.zxcode.notifyRendererReady(),
    reportRendererHeapSample: window.zxcode.reportRendererHeapSample
      ? (sample) => window.zxcode.reportRendererHeapSample!(sample)
      : undefined,
    showTaskNotification: (payload) => window.zxcode.showTaskNotification(payload),
    syncWindowTabs: (paths) => window.zxcode.syncWindowTabs(paths),
    syncWindowWorkspace: (payload) => window.zxcode.syncWindowWorkspace?.(payload),
    getMobileRelayStatus: () => window.zxcode.getMobileRelayStatus?.(),
    requestMobileRelayGrant: (payload) => window.zxcode.requestMobileRelayGrant?.(payload),
    syncWindowUnreadCount: (count) => window.zxcode.syncWindowUnreadCount(count),
    syncActiveTaskSession: (sessionId) => window.zxcode.syncActiveTaskSession(sessionId),
    syncAppSettings: (patch) => window.zxcode.syncAppSettings?.(patch),
    setShortcutRecordingActive: (active) => window.zxcode.setShortcutRecordingActive?.(active),
    onFocusTab: (handler) => window.zxcode.onFocusTab(handler),
    onNewTab: (handler) => window.zxcode.onNewTab(handler),
    onCloseActiveContextRequest: (handler) =>
      window.zxcode.onCloseActiveContextRequest?.(handler) ?? (() => {}),
    onOpenBrowserUrl: (handler) => window.zxcode.onOpenBrowserUrl?.(handler) ?? (() => {}),
    onBrowserViewScreenshotSurfacePrepare: (handler) =>
      window.zxcode.onBrowserViewScreenshotSurfacePrepare?.(handler) ?? (() => {}),
    onBrowserViewScreenshotSurfaceRelease: (handler) =>
      window.zxcode.onBrowserViewScreenshotSurfaceRelease?.(handler) ?? (() => {}),
    browserViewScreenshotSurfaceReady: (payload) =>
      window.zxcode.browserViewScreenshotSurfaceReady?.(payload),
    ...desktopBrowserPlatformBridge,
    onNewTask: (handler) => window.zxcode.onNewTask(handler),
    onOpenWorkspace: (handler) => {
      // 开发态或升级后的旧窗口可能仍运行未暴露 onOpenWorkspace 的 preload，
      // renderer 直接调用会在启动时崩溃。这里和 activateOrSetWorkspace 一样做兼容兜底，
      // 缺少该 bridge 时只禁用原生菜单回调，不影响应用继续打开。
      return window.zxcode.onOpenWorkspace?.(handler) ?? (() => {});
    },
    onOpenWorkspacePath: (handler) => window.zxcode.onOpenWorkspacePath?.(handler) ?? (() => {}),
    onWindowFullscreenChanged: (handler) => window.zxcode.onWindowFullscreenChanged(handler),
    getDesktopWindowChromeState: window.zxcode.getDesktopWindowChromeState
      ? () => window.zxcode.getDesktopWindowChromeState!()
      : undefined,
    onDesktopWindowChromeStateChanged: window.zxcode.onDesktopWindowChromeStateChanged
      ? (handler) => window.zxcode.onDesktopWindowChromeStateChanged!(handler)
      : undefined,
    getWindowControlsOverlayMetrics: () =>
      window.zxcode.getWindowControlsOverlayMetrics?.() ?? null,
    onWindowControlsOverlayChanged: (handler) =>
      window.zxcode.onWindowControlsOverlayChanged?.(handler) ?? (() => {}),
    getDesktopZoomLevel: () =>
      window.zxcode.getDesktopZoomLevel?.() ?? Promise.resolve({ zoomLevel: 0 }),
    onDesktopZoomLevelChanged: (handler) =>
      window.zxcode.onDesktopZoomLevelChanged?.(handler) ?? (() => {}),
    onTaskNotificationClick: (handler) => window.zxcode.onTaskNotificationClick(handler),
    exportLogs: () => window.zxcode.exportLogs(),
    captureWindowScreenshot: () =>
      window.zxcode.captureWindowScreenshot?.() ?? Promise.resolve(null),
    getDesktopSessionActivity: () =>
      window.zxcode.getDesktopSessionActivity?.() ??
      Promise.resolve({ runningAgentSessionCount: 0 }),
    getZCodeStdioTapDevState: () =>
      window.zxcode.getZCodeStdioTapDevState?.() ??
      Promise.resolve({ enabled: false, visible: false, logDir: "", statePath: "" }),
    onSettingsChanged: (callback) => window.zxcode.onSettingsChanged?.(callback) ?? (() => {}),
    onApplicationLocaleChanged: (callback) =>
      window.zxcode.onApplicationLocaleChanged?.(callback) ?? (() => {}),
    getInstalledEditors: () => window.zxcode.getInstalledEditors(),
    getApplicationIcon: (bundleId) =>
      window.zxcode.getApplicationIcon?.(bundleId) ?? Promise.resolve(null),
    openInEditor: (editorId, path, editorOptions) =>
      window.zxcode.openInEditor(editorId, path, editorOptions),
    executeDesktopCommand: (command) => window.zxcode.executeDesktopCommand(command),
    setApplicationLocale: (locale) => window.zxcode.setApplicationLocale(locale),
    getSystemLocale: () =>
      window.zxcode.getSystemLocale?.() ??
      Promise.resolve(navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US"),
    setTitleBarTheme: (theme) => window.zxcode.setTitleBarTheme(theme),
    getDeviceId: () =>
      (window as Window & { __ZXCODE_DEVICE_ID__?: string }).__ZXCODE_DEVICE_ID__ ?? "",
  };
}
