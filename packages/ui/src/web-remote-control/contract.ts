/**
 * web-remote-control 类型合同（fork 最小落地：仅类型再导出）。
 * 上游 module 含 Dialog/app/domain 与 OAuth 面板；fork 手机远控走自部署 relay
 * （mobile-remote-entry-relay-only），IOAuthService 属剔除的账号登录域，
 * 剔除 WebRemoteControlAuthPlatform/AuthEvents 导出。
 */
import type { IPlatformService } from "@zcode/shared";
import type { WebRemoteControlWorkspaceSwitcherApi } from "@/root/types.js";

export type WebRemoteControlDeviceNavigation = NonNullable<
  WebRemoteControlWorkspaceSwitcherApi["deviceNavigation"]
>;
export type WebRemoteControlAuthPlatform = Pick<
  IPlatformService,
  "notifyWebRemoteControlAuthStateChanged"
>;
export type { WebRemoteControlMobileTaskView } from "@zcode/shared";
export type WebRemoteControlTaskViewSwitcher = Pick<
  WebRemoteControlWorkspaceSwitcherApi,
  "updateMobileTaskView" | "updateMobileViewState"
>;
