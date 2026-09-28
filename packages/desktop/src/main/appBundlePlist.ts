/**
 * macOS .app bundle 的 Info.plist 读取。
 * 独立成模块（无 electron 依赖）：自定义打开方式注册表（customEditors.ts）在纯 node
 * 测试环境也要读 bundle 显示名，不能连带 editors.ts 顶层的 electron import。
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { logger } from "./logger.js";

export interface AppBundleInfoPlist {
  CFBundleIconFile?: string;
  CFBundleIconFiles?: string[];
  CFBundleIconName?: string;
  /** 应用显示名；自定义打开方式注册表读取它派生菜单展示名。 */
  CFBundleName?: string;
  CFBundleDisplayName?: string;
  CFBundleIcons?: {
    CFBundlePrimaryIcon?: {
      CFBundleIconFiles?: string[];
      CFBundleIconName?: string;
    };
  };
}

export function readAppBundleInfoPlist(appPath: string): AppBundleInfoPlist | null {
  try {
    const infoPlistPath = join(appPath, "Contents", "Info.plist");
    const raw = execFileSync("plutil", ["-convert", "json", "-o", "-", infoPlistPath], {
      encoding: "utf8",
      timeout: 3000,
    });
    return JSON.parse(raw) as AppBundleInfoPlist;
  } catch (error) {
    logger.warn("[appBundlePlist] 读取 Info.plist 失败", {
      appPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
