import type { IPlatformService } from "@zcode/shared";

// fork：onBrowserViewDownloadStarted / browserViewLoadUrl 尚未进入 @zcode/client/globals 的
// window.zxcode 声明，按 desktopPlatform.ts 的显式可选断言模式收口（非桌面宿主下同样缺桥）。
const preloadBrowserBridge = (
  window as Window & {
    zxcode?: {
      onBrowserViewDownloadStarted?: (
        handler: (payload: { webContentsId: number; urls: string[] }) => void,
      ) => () => void;
      browserViewLoadUrl?: (payload: { webContentsId: number; url: string }) => Promise<void>;
    };
  }
).zxcode;

type DesktopBrowserPlatformBridge = Pick<
  IPlatformService,
  | "onBrowserViewDownloadStarted"
  | "onBrowserViewReady"
  | "onBrowserViewOperation"
  | "onBrowserViewViewportChanged"
  | "onBrowserViewVisibility"
  | "onBrowserViewCloseTab"
  | "onBrowserViewSuspend"
  | "onBrowserViewRestore"
  | "browserViewLoadUrl"
  | "browserViewAttachGuest"
  | "browserViewDetachGuest"
  | "browserViewCloseTab"
  | "browserViewReportResidency"
  | "browserViewPromoteDraftTabs"
  | "browserViewSuspendReady"
  | "browserViewEnsureResident"
  | "browserViewRestoreTabs"
  | "browserViewUpdateViewport"
  | "importChromeBrowserData"
  | "clearEmbeddedBrowserData"
  | "getPathForFile"
  | "saveFile"
  | "printPageToPdf"
  // fork 修正：v3.18.0 同并在 Pick 里带入了 "microphone"，但 platform.ts 已随 voice-input
  // 域剔除 IPlatformService.microphone，Pick 引用不存在键是 TS2344 隐性类型债；随本次合并移除。
  | "captureBrowserGuestPage"
>;

// Rebase 集成：browser bridge 若继续内联在 renderer 入口，会让入口越过 max-lines 门禁。
// 独立对象只做 preload 委托与旧 bridge 兼容兜底，不持有 Browser 业务状态。
export const desktopBrowserPlatformBridge = {
  getPathForFile: (file) => window.zxcode.getPathForFile?.(file) ?? null,
  saveFile: (payload) =>
    window.zxcode.saveFile?.(payload) ??
    Promise.resolve({ success: false, error: "not_supported" }),
  // 条件定义而非兜底返回失败：UI 靠方法是否存在做能力检测，旧 preload 下必须保持 undefined
  printPageToPdf: window.zxcode.printPageToPdf ? () => window.zxcode.printPageToPdf!() : undefined,
  // fork：microphone（voice-input 域）不接入，上游 v3.18.2 的 resetAccess 扩展同样不恢复；
  // CaptureBrowserGuestPage（design 桥）采纳。
  captureBrowserGuestPage: window.zxcode.captureBrowserGuestPage
    ? (payload) => window.zxcode.captureBrowserGuestPage!(payload)
    : undefined,
  onBrowserViewDownloadStarted: (handler) =>
    preloadBrowserBridge?.onBrowserViewDownloadStarted?.(handler) ?? (() => {}),
  onBrowserViewReady: (handler) => window.zxcode.onBrowserViewReady?.(handler) ?? (() => {}),
  onBrowserViewOperation: (handler) =>
    window.zxcode.onBrowserViewOperation?.(handler) ?? (() => {}),
  onBrowserViewViewportChanged: (handler) =>
    window.zxcode.onBrowserViewViewportChanged?.(handler) ?? (() => {}),
  onBrowserViewVisibility: (handler) =>
    window.zxcode.onBrowserViewVisibility?.(handler) ?? (() => {}),
  onBrowserViewCloseTab: (handler) => window.zxcode.onBrowserViewCloseTab?.(handler) ?? (() => {}),
  onBrowserViewSuspend: (handler) => window.zxcode.onBrowserViewSuspend?.(handler) ?? (() => {}),
  onBrowserViewRestore: (handler) => window.zxcode.onBrowserViewRestore?.(handler) ?? (() => {}),
  browserViewLoadUrl: (payload) => preloadBrowserBridge!.browserViewLoadUrl!(payload),
  browserViewAttachGuest: (payload) =>
    window.zxcode.browserViewAttachGuest?.(payload) ??
    Promise.resolve({
      ok: false,
      reason: "not-found",
      recoveryRequested: false,
    }),
  browserViewDetachGuest: (payload) =>
    window.zxcode.browserViewDetachGuest?.(payload) ?? Promise.resolve(false),
  browserViewCloseTab: (payload) =>
    window.zxcode.browserViewCloseTab?.(payload) ?? Promise.resolve(),
  browserViewReportResidency: (payload) =>
    window.zxcode.browserViewReportResidency?.(payload) ?? Promise.resolve(),
  // 草稿首发后把草稿 human tab 的 owner 升级为新会话（上游 v3.18.0）。
  browserViewPromoteDraftTabs: (payload) =>
    window.zxcode.browserViewPromoteDraftTabs?.(payload) ?? Promise.resolve([]),
  browserViewSuspendReady: (payload) =>
    window.zxcode.browserViewSuspendReady?.(payload) ?? Promise.resolve(),
  browserViewEnsureResident: (payload) =>
    window.zxcode.browserViewEnsureResident?.(payload) ?? Promise.resolve(),
  browserViewRestoreTabs: (payload) =>
    window.zxcode.browserViewRestoreTabs?.(payload) ?? Promise.resolve([]),
  browserViewUpdateViewport: (payload) =>
    window.zxcode.browserViewUpdateViewport?.(payload) ?? Promise.resolve(),
  importChromeBrowserData: (options) =>
    window.zxcode.importChromeBrowserData?.(options) ??
    Promise.resolve({
      success: false,
      cookies: { imported: 0, skipped: 0, failed: 0 },
      localStorage: {
        originsImported: 0,
        entriesImported: 0,
        originsSkipped: 0,
        originsFailed: 0,
      },
      // Bugfix：非桌面宿主无 preload 桥，导入能力不可用；"unsupported" 从未是
      // ChromeBrowserDataImportError 联合成员（类型接入后暴露），改用合法错误码。
      error: "chrome_browser_data_import_unavailable",
    }),
  clearEmbeddedBrowserData: (mode) =>
    window.zxcode.clearEmbeddedBrowserData?.(mode) ??
    Promise.resolve({ success: false, error: "unsupported" }),
} satisfies DesktopBrowserPlatformBridge;
