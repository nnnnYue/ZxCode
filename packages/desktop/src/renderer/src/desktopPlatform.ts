import { buildLocalMediaPreviewUrl, type IPlatformService } from "@zcode/shared";
import type { FileApplicationInfo, FileApplicationTarget } from "@zcode/shared";
// fork 修复：window.zxcode 全局声明此前不在任何 tsc 程序里（renderer 的 window.zxcode 访问
// 全部 TS2339 记账）。renderer tsconfig rootDir 限死 src/renderer，跨树 include 声明文件会破坏
// 输出布局，故经 @zcode/client 的 "./globals" exports 子路径把声明拉进程序；type-only import
// 运行时零影响，禁止改成值导入（vite 运行时解析 .d.ts 会失败）。
import type {} from "@zcode/client/globals";

import { desktopBrowserPlatformBridge } from "./desktopBrowserPlatformBridge.js";
import { createDesktopPluginSandboxPlatform } from "./plugin-sandbox/desktopPluginSandboxPlatform.js";

// 浏览器 context 兜底：window.zxcode 由 desktop preload 注入，非桌面宿主下不存在，
// 系统关联桥接按显式可选断言收口，与全局声明的必选形态互不冲突。
const fileApplicationsBridge = (
  window as Window & {
    zxcode?: {
      getFileApplications?: (target: FileApplicationTarget) => Promise<FileApplicationInfo[]>;
      openFileWithApplication?: (
        applicationId: string,
        target: FileApplicationTarget,
      ) => Promise<{ success: boolean; error?: string }>;
    };
  }
).zxcode;

export function createDesktopPlatform(options: {
  isLocalDevelopmentRuntime: boolean;
}): IPlatformService {
  return {
    canSelectFilePath: true,
    canOpenLocalFiles: true,
    pluginSandbox: createDesktopPluginSandboxPlatform(),
    createLocalMediaPreviewUrl: buildLocalMediaPreviewUrl,
    isLocalDevelopmentRuntime: options.isLocalDevelopmentRuntime,
    selectDirectory: () => window.zxcode.selectDirectory(),
    selectDirectories: () => window.zxcode.selectDirectories(),
    selectFile: () => window.zxcode.selectFile(),
    selectFiles: () => window.zxcode.selectFiles?.() ?? Promise.resolve([]),
    createTempTextAttachment: (payload) => window.zxcode.createTempTextAttachment(payload),
    materializeWorkflowArtifactFile: (payload) =>
      window.zxcode.materializeWorkflowArtifactFile(payload),
    onRemoteConnectionLog: (handler) => window.zxcode.onRemoteConnectionLog(handler),
    onRemoteSessionClosed: (handler) => window.zxcode.onRemoteSessionClosed(handler),
    onBotRemoteWorkspaceReconnected: (handler) =>
      window.zxcode.onBotRemoteWorkspaceReconnected(handler),
    activateOrSetWorkspace: (path) =>
      window.zxcode.activateOrSetWorkspace?.(path) ?? Promise.resolve({ activated: false }),
    connectRemote: (remoteOptions, requestId, context) =>
      window.zxcode.connectRemote(remoteOptions, requestId, context),
    cancelPendingRemoteConnection: (requestId) =>
      window.zxcode.cancelPendingRemoteConnection?.(requestId) ?? Promise.resolve(),
    bindRemoteWorkspaceSessionContext: async (context) => {
      // fork：v3.17.2 已把 bind 结果升级为结构化 IpcResult + unwrapRemoteWorkspaceBindResult
      // （shared 类型层已进），但 main/preload 实现层未合并——preload 仍 resolve void，失败靠
      // reject 传递。这里维持 await+reject 语义，按调用入参回填最小 Result（ui 消费方只
      // await/catch，不消费返回值）；identity 缺省回退 workspacePath 遵循仓库身份 key 约定。
      // main 侧合并结构化结果后再切换 unwrap。
      await window.zxcode.bindRemoteWorkspaceSessionContext?.(context);
      return {
        remoteSessionId: context.remoteSessionId,
        workspacePath: context.workspacePath,
        workspaceIdentity: context.workspaceIdentity?.trim() || context.workspacePath,
      };
    },
    // fork：采纳上游 webRemoteControl 桥（main 侧 IPC 已注册，preload 已暴露）；
    // 反馈/社群入口维持去平台化 no-op（REMOVALS：反馈工单与社区链接跳转）。
    startWebRemoteControl: (context) => window.zxcode.startWebRemoteControl(context),
    refreshWebRemoteControlPairing: (context) =>
      window.zxcode.refreshWebRemoteControlPairing(context),
    stopWebRemoteControl: () => window.zxcode.stopWebRemoteControl(),
    getWebRemoteControlStatus: () => window.zxcode.getWebRemoteControlStatus(),
    onWebRemoteControlStatusChanged: (handler) =>
      window.zxcode.onWebRemoteControlStatusChanged?.(handler) ?? (() => {}),
    disposeRemoteSession: (sessionId) => window.zxcode.disposeRemoteSession(sessionId),
    isDockerAvailable: () => window.zxcode.isDockerAvailable(),
    listWSLDistros: () => window.zxcode.listWSLDistros(),
    listDockerContainers: () => window.zxcode.listDockerContainers(),
    listSSHConfigAliases: () => window.zxcode.listSSHConfigAliases(),
    loadMcpFromUserDirectory: (payload) => window.zxcode.loadMcpFromUserDirectory(payload),
    saveMcpToUserDirectory: (payload) => window.zxcode.saveMcpToUserDirectory(payload),
    migrateLegacyCommonMcp: (payload) => window.zxcode.migrateLegacyCommonMcp(payload),
    openExternal: (url) => window.zxcode.openExternal(url),
    // fork：openCommunity / canOpenCommunity 已从平台合同剔除（与 web/main.tsx 同步），
    // 两个无消费方的死属性一并移除。
    openFeedback: async () => {},
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
    // fork：支付 deep link 的 IPC 链路（main→preload→window.zxcode.onPaymentCallback）仍保留，
    // 但 IPlatformService 平台合同已不含该成员，renderer 无消费方，此处不再重复适配。
    notifyRendererReady: () => window.zxcode.notifyRendererReady(),
    reportRendererHeapSample: window.zxcode.reportRendererHeapSample
      ? (sample) => window.zxcode.reportRendererHeapSample!(sample)
      : undefined,
    showTaskNotification: (payload) => window.zxcode.showTaskNotification(payload),
    syncWindowTabs: (paths) => window.zxcode.syncWindowTabs(paths),
    syncWindowWorkspace: (payload) => window.zxcode.syncWindowWorkspace?.(payload),
    getMobileRelayStatus: () => window.zxcode.getMobileRelayStatus?.(),
    requestMobileRelayGrant: (payload) => window.zxcode.requestMobileRelayGrant?.(payload),
    // fork：上游 rendererActionTrace / TTFT 埋点桥保持移除（REMOVALS 遥测域）。
    syncWebRemoteControlWorkspaces: (workspaces) =>
      window.zxcode.syncWebRemoteControlWorkspaces?.(workspaces),
    syncWebRemoteControlTasks: (tasks) => window.zxcode.syncWebRemoteControlTasks?.(tasks),
    onWebRemoteControlReconnectWorkspace: (handler) =>
      window.zxcode.onWebRemoteControlReconnectWorkspace?.(handler) ?? (() => {}),
    // 桥缺失（旧 preload 升级窗口）时按 supported 兜底，与 Windows 现状一致，设置开关可用。
    getCloseToTrayCapability: () =>
      window.zxcode.getCloseToTrayCapability?.() ??
      Promise.resolve({ supported: true, gnomeLikeWithoutTray: false }),
    onEmbeddedBrowserPermissionPrompt: (handler) =>
      window.zxcode.onEmbeddedBrowserPermissionPrompt?.(handler) ?? (() => {}),
    resolveEmbeddedBrowserPermissionPrompt: (request) =>
      window.zxcode.resolveEmbeddedBrowserPermissionPrompt?.(request),
    getEmbeddedBrowserSitePermissions: () =>
      window.zxcode.getEmbeddedBrowserSitePermissions?.() ?? Promise.resolve({}),
    setEmbeddedBrowserSitePermission: (request) =>
      window.zxcode.setEmbeddedBrowserSitePermission?.(request) ?? Promise.resolve({}),
    clearEmbeddedBrowserSitePermissions: () =>
      window.zxcode.clearEmbeddedBrowserSitePermissions?.() ?? Promise.resolve({}),
    resetEmbeddedBrowserSitePermission: (request) =>
      window.zxcode.resetEmbeddedBrowserSitePermission?.(request) ?? Promise.resolve({}),
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
      Promise.resolve({
        enabled: false,
        visible: false,
        logDir: "",
        statePath: "",
      }),
    onSettingsChanged: (callback) => window.zxcode.onSettingsChanged?.(callback) ?? (() => {}),
    onApplicationLocaleChanged: (callback) =>
      window.zxcode.onApplicationLocaleChanged?.(callback) ?? (() => {}),
    getInstalledEditors: () => window.zxcode.getInstalledEditors(),
    getFileApplications: (target) =>
      fileApplicationsBridge?.getFileApplications?.(target) ?? Promise.resolve([]),
    openFileWithApplication: async (applicationId, target) =>
      (await fileApplicationsBridge?.openFileWithApplication?.(applicationId, target)) ?? {
        success: false,
        error: "unsupported",
      },
    getApplicationIcon: (bundleId) =>
      window.zxcode.getApplicationIcon?.(bundleId) ?? Promise.resolve(null),
    openInEditor: (editorId, path, editorOptions) =>
      window.zxcode.openInEditor(editorId, path, editorOptions),
    selectAndAddCustomEditor: () =>
      window.zxcode.selectAndAddCustomEditor?.() ?? Promise.resolve(null),
    removeCustomEditor: (editorId) =>
      window.zxcode.removeCustomEditor?.(editorId) ?? Promise.resolve({ success: false }),
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
