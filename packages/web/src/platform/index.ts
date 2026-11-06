import {
  type IPlatformService,
  type RemoteTarget,
  type WebRemoteControlStatus,
} from "@zcode/shared";
import localDefaultAppConfig from "../../../../config/default.json" with { type: "json" };
import { playTaskNotificationSound } from "@zcode/ui";
import type { WebRemoteControlPlatformProxy } from "#src/platform/contract.js";
import { saveBrowserFile } from "#src/platform/saveBrowserFile.js";
export type { WebRemoteControlPlatformProxy } from "#src/platform/contract.js";

// 帮助入口（反馈）配置：去平台化后只读仓库内置 config/default.json，
// 无任何启动期远端请求（社区链接已随剔除域移除，仅保留反馈地址解析）。
async function resolveFeedbackUrl(): Promise<string | undefined> {
  const feedbackUrl = localDefaultAppConfig.feedback_url;
  return typeof feedbackUrl === "string" && feedbackUrl.trim() !== "" ? feedbackUrl : undefined;
}

export function createWebPlatform(options?: {
  externalWebRemoteControlProxy?: WebRemoteControlPlatformProxy;
}): IPlatformService {
  const platformProxy = options?.externalWebRemoteControlProxy;

  return {
    canSelectFilePath: false,
    canOpenLocalFiles: false,
    saveFile: saveBrowserFile,
    // Web 端无法打开系统目录选择框
    selectDirectory: () => Promise.resolve(null),
    // Web 端无法打开系统文件选择框
    selectFile: () => Promise.resolve(null),
    selectFiles: () => Promise.resolve([]),
    getPathForFile: () => null,
    createTempTextAttachment: (payload) =>
      platformProxy
        ? platformProxy.requestPlatformMethod("createTempTextAttachment", payload)
        : Promise.reject(new Error("Temporary text attachments require a desktop host")),
    onRemoteConnectionLog: () => () => {},
    onRemoteSessionClosed: () => () => {},
    // Web 端无多窗口管理
    activateOrSetWorkspace: () => Promise.resolve({ activated: false }),
    // Bugfix: Web 远程控制模式虽然复用了 web UI，但它背后其实挂着 desktop。
    // 之前这里仍然走普通 web 的 `/api/connect-remote`，既不能命中 desktop main，
    // 也拿不到 remote session 的 MessagePort，结果看起来像“支持”，实际必然失败。
    // 先显式拒绝，避免用户沿着错误链路继续排查；后续如果要支持，需要单独补 remote session 注入协议。
    async connectRemote(
      options: RemoteTarget,
      _requestId?: string,
      _context?: {
        workspacePath: string;
        workspaceIdentity?: string;
        connectTrigger?: import("@zcode/shared").RemoteWorkspaceConnectTrigger;
      },
    ) {
      if (platformProxy) {
        return {
          success: false,
          error: `Remote connect is not supported in Web remote control mode yet: ${options.kind}`,
        };
      }

      // TODO(web-remote-workspace): 普通 Web 模式先只保证 server 本地工作区可用。
      // 之前这里虽然能打开 ?remote=<id> 新标签页，但远程 WebSocket 只暴露部分 service，
      // 与 Root/RemoteServiceAccess 需要的完整 accessor 不匹配，最终会在项目向导或首屏卡住。
      return {
        success: false,
        error: `Remote connect is not supported in Web mode yet: ${options.kind}`,
      };
    },
    cancelPendingRemoteConnection: (_requestId?: string) => Promise.resolve(),
    // Web 端不作为 Web 远程控制的发起端，保留空实现以兼容统一接口。
    startWebRemoteControl: () =>
      Promise.reject(new Error("Web remote control can only be started from desktop")),
    refreshWebRemoteControlPairing: () =>
      Promise.reject(new Error("Web remote control pairing can only be refreshed from desktop")),
    stopWebRemoteControl: () => Promise.resolve(),
    getWebRemoteControlStatus: () =>
      Promise.resolve<WebRemoteControlStatus>({
        status: "idle",
      }),
    disposeRemoteSession: () => Promise.resolve(),
    isDockerAvailable: () =>
      platformProxy
        ? platformProxy.requestPlatformMethod("isDockerAvailable")
        : Promise.resolve(false),
    listWSLDistros: () =>
      platformProxy ? platformProxy.requestPlatformMethod("listWSLDistros") : Promise.resolve([]),
    listDockerContainers: () =>
      platformProxy
        ? platformProxy.requestPlatformMethod("listDockerContainers")
        : Promise.resolve([]),
    listSSHConfigAliases: () =>
      platformProxy
        ? platformProxy.requestPlatformMethod("listSSHConfigAliases")
        : Promise.resolve([]),
    loadMcpFromUserDirectory: (payload) =>
      platformProxy
        ? platformProxy.requestPlatformMethod("loadMcpFromUserDirectory", payload)
        : Promise.resolve({ servers: [] }),
    saveMcpToUserDirectory: (payload) =>
      platformProxy
        ? platformProxy.requestPlatformMethod("saveMcpToUserDirectory", payload)
        : Promise.resolve({
            success: false,
            error: "MCP native directory management requires a desktop attachment",
          }),
    migrateLegacyCommonMcp: (payload) =>
      platformProxy
        ? platformProxy.requestPlatformMethod("migrateLegacyCommonMcp", payload)
        : Promise.resolve({
            servers: {},
            totalCount: 0,
            importedCount: 0,
            skippedCount: 0,
          }),
    openExternal: (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    openFeedback: async () => {
      const feedbackUrl = await resolveFeedbackUrl();
      if (!feedbackUrl) {
        return;
      }
      window.open(feedbackUrl, "_blank", "noopener,noreferrer");
    },
    openInFileManager: () =>
      Promise.resolve({ success: false, error: "Not supported in web mode" }),
    openExternalFile: () => Promise.resolve({ success: false, error: "Not supported in web mode" }),
    notifyRendererReady: () => {},
    showTaskNotification: (payload) => {
      if (document.hasFocus()) {
        return;
      }

      if (
        typeof window.Notification === "undefined" ||
        window.Notification.permission !== "granted"
      ) {
        return;
      }

      try {
        new window.Notification(payload.title, {
          body: payload.body,
          silent: true,
        });
        void playTaskNotificationSound();
      } catch {
        // 浏览器通知不可用时静默忽略，避免打断主流程
      }
    },
    // Web 端不需要跨窗口 tab 管理
    syncWindowTabs: () => {},
    // Web 端没有宿主层 Dock / 任务栏徽标，保持空实现以兼容统一平台接口
    syncWindowUnreadCount: () => {},
    syncActiveTaskSession: () => {},
    onFocusTab: () => () => {},
    onNewTab: () => () => {},
    onCloseActiveContextRequest: () => () => {},
    onOpenBrowserUrl: () => () => {},
    onNewTask: () => () => {},
    onOpenWorkspace: () => () => {},
    onWindowFullscreenChanged: () => () => {},
    onTaskNotificationClick: () => () => {},
    exportLogs: () => Promise.resolve({ success: false, error: "Not supported in web mode" }),
    captureWindowScreenshot: () => Promise.resolve(null),
    importChromeBrowserData: (_options) =>
      Promise.resolve({
        success: false,
        cookies: { imported: 0, skipped: 0, failed: 0 },
        localStorage: {
          originsImported: 0,
          entriesImported: 0,
          originsSkipped: 0,
          originsFailed: 0,
        },
        error: "chrome_import_not_supported" as const,
      }),
    clearEmbeddedBrowserData: () =>
      Promise.resolve({ success: false, error: "Not supported in web mode" }),
    // 自动更新域（REMOVALS）：整组方法不在 IPlatformService 内，fork 无更新器，
    // 全部为剔除域残留死条目，随 web 域类型收口移除。
    getDesktopSessionActivity: () => Promise.resolve({ runningAgentSessionCount: 0 }),
    getDesktopZoomLevel: () => Promise.resolve({ zoomLevel: 0 }),
    onDesktopZoomLevelChanged: () => () => {},
    getInstalledEditors: () => Promise.resolve([]),
    getFileApplications: () => Promise.resolve([]),
    openFileWithApplication: () => Promise.resolve({ success: false, error: "not_supported" }),
    openInEditor: () => Promise.resolve({ success: false, error: "Not supported in web mode" }),
    executeDesktopCommand: () => Promise.resolve(),
    setApplicationLocale: (_locale) => Promise.resolve(),
    setTitleBarTheme: () => Promise.resolve(),
    getDeviceId: () => {
      const nav = globalThis.navigator as Navigator & { platform?: string };
      const platform = nav?.platform ?? "";
      const screenWidth = globalThis.screen?.width;
      const screenHeight = globalThis.screen?.height;
      const colorDepth = globalThis.screen?.colorDepth;
      const parts = [
        platform,
        screenWidth !== undefined ? String(screenWidth) : "",
        screenHeight !== undefined ? String(screenHeight) : "",
        colorDepth !== undefined ? String(colorDepth) : "",
      ];
      return parts.filter(Boolean).join("|");
    },
  };
}
