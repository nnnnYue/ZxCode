import { readFile } from "node:fs/promises";
import {
  resolvePreinstalledToolsCatalog,
  type PreinstalledToolConfiguration,
} from "@zcode/shared/preinstalled-tools";
import preinstalledToolCatalog from "@desktop/preinstalled-tools/catalog.json" with { type: "json" };

declare const __ZCODE_PREINSTALL_TEST_BUILD__: boolean;

const PREINSTALLED_TOOLS_CDN_BASE_URL_ENV = "ZXCODE_PREINSTALLED_TOOLS_CDN_BASE_URL";

/**
 * fork：默认不配置官方 CDN 基址（默认不下载）；仅当 ZXCODE_PREINSTALLED_TOOLS_CDN_BASE_URL
 * 显式配置（逗号分隔多个候选）时启用下载。
 */
function resolvePreinstalledToolsCdnBaseUrls(): string[] {
  return (
    process.env[PREINSTALLED_TOOLS_CDN_BASE_URL_ENV]
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? []
  );
}

/**
 * Main 只装配构建配置；Host 无需等待本次读取或工具初始化。
 * 返回 null 表示清单不可用：工具归属未知，预装进程不得按 catalog 回收任何入口或目录。
 * 修复原因：此前任何装配失败都在 Main 变成空列表，预装进程把它当作全部工具移出 catalog，
 * 撤销入口并删除已安装资源（含 Python 附加区）。
 */
export async function loadPreinstalledToolsCatalog(logger: {
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}): Promise<PreinstalledToolConfiguration[] | null> {
  try {
    const catalog: unknown =
      __ZCODE_PREINSTALL_TEST_BUILD__ && process.env.ZCODE_E2E_PREINSTALLED_TOOLS_CATALOG
        ? JSON.parse(await readFile(process.env.ZCODE_E2E_PREINSTALLED_TOOLS_CATALOG, "utf8"))
        : preinstalledToolCatalog;
    const cdnBaseUrls = resolvePreinstalledToolsCdnBaseUrls();
    const { tools, downloadBaseUrlsError } = resolvePreinstalledToolsCatalog(
      catalog,
      process.platform,
      process.arch,
      cdnBaseUrls,
    );
    if (downloadBaseUrlsError) {
      // 未配置是预期状态（默认不下载），降级为 warn；显式配置非法才按错误记录。
      if (cdnBaseUrls.length === 0) {
        logger.warn(
          `[preinstalled-tools] ${PREINSTALLED_TOOLS_CDN_BASE_URL_ENV} 未配置，预装工具不下发下载目标`,
        );
      } else {
        logger.error(
          `[preinstalled-tools] invalid ${PREINSTALLED_TOOLS_CDN_BASE_URL_ENV}; all tools have no target`,
          downloadBaseUrlsError,
        );
      }
    }
    return tools;
  } catch (error) {
    logger.error("[preinstalled-tools] invalid static target configuration", error);
    return null;
  }
}
