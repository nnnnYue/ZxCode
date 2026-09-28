/**
 * 自定义打开方式注册表 —— open-with 下拉里用户自选的本地应用。
 *
 * 唯一持久化所有者（specs/open-with-custom-apps.md）：本模块 + ~/.zxcode/v2/custom-editors.json。
 * renderer 不持有注册表，也不向 main 传可执行路径：文件选择对话框由 main 弹出，
 * IPC 只传注册表 id（"custom:" 前缀，与静态白名单 id 空间互不冲突）。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createUuid, CUSTOM_EDITOR_ID_PREFIX, type EditorInfo } from "@zcode/shared";
import { getAppConfigDir } from "@zcode/services/node";
import { readAppBundleInfoPlist } from "./appBundlePlist.js";
import { logger } from "./logger.js";

const CUSTOM_EDITORS_FILE_NAME = "custom-editors.json";

/** 注册表条目；结构上就是 EditorInfo + 打开时需要的 appPath。 */
export interface CustomEditorEntry extends EditorInfo {
  appPath: string;
}

/** 注入项仅测试使用（默认走真实 fs / plist / 图标链路）。 */
interface CustomEditorRegistryOptions {
  /** 注册表文件所在目录，默认 getAppConfigDir()（即 ~/.zxcode/v2）。 */
  configDir?: string;
  /** id 生成器，默认 createUuid。 */
  createId?: () => string;
  /** 图标解析器，默认 getAppIconDataUrl。 */
  resolveIcon?: (editorId: string, appPath: string) => Promise<string | null>;
}

export function isCustomEditorId(editorId: string): boolean {
  return editorId.startsWith(CUSTOM_EDITOR_ID_PREFIX);
}

/**
 * 自定义应用路径合法性：macOS 必须是 .app 目录，Windows 必须是 .exe 文件。
 * 对话框 filter 已约束，这里在写入注册表的边界再校验一次，防止 IPC 之外的路径混入。
 */
export function isValidCustomEditorAppPath(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  try {
    if (platform === "darwin") {
      return appPath.endsWith(".app") && statSync(appPath).isDirectory();
    }
    if (platform === "win32") {
      return appPath.toLowerCase().endsWith(".exe") && statSync(appPath).isFile();
    }
    return false;
  } catch {
    // 路径不存在（ENOENT/EACCES）即为非法
    return false;
  }
}

/** 显示名：macOS 优先 Info.plist 的 CFBundleDisplayName/CFBundleName，否则取文件名去扩展。 */
export function deriveCustomEditorName(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "darwin") {
    const plist = readAppBundleInfoPlist(appPath);
    const bundleName = plist?.CFBundleDisplayName?.trim() || plist?.CFBundleName?.trim();
    if (bundleName) {
      return bundleName;
    }
  }

  const fileName = basename(appPath);
  const suffix = platform === "darwin" ? ".app" : ".exe";
  return fileName.toLowerCase().endsWith(suffix) ? fileName.slice(0, -suffix.length) : fileName;
}

function resolveRegistryFile(configDir?: string): string {
  return join(configDir ?? getAppConfigDir(), CUSTOM_EDITORS_FILE_NAME);
}

function isValidEntry(value: unknown): value is CustomEditorEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    entry.id.startsWith(CUSTOM_EDITOR_ID_PREFIX) &&
    typeof entry.appPath === "string" &&
    entry.appPath.length > 0 &&
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    typeof entry.iconDataUrl === "string" &&
    entry.iconDataUrl.length > 0
  );
}

/** 读失败（文件缺失/损坏）按空注册表处理，不打断 open-with 功能。 */
function readCustomEditorsSync(registryFile: string): CustomEditorEntry[] {
  try {
    const raw = readFileSync(registryFile, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

/** 原子写（tmp + rename），避免并发读方读到半截 JSON。 */
function writeCustomEditorsSync(registryFile: string, entries: CustomEditorEntry[]): void {
  mkdirSync(dirname(registryFile), { recursive: true });
  const tempFile = `${registryFile}.${process.pid}.tmp`;
  writeFileSync(tempFile, JSON.stringify(entries, null, 2), "utf-8");
  renameSync(tempFile, registryFile);
}

/** 当前注册的全部自定义应用；每次现读，注册表增删后无需失效任何缓存。 */
export function listCustomEditors(options?: { configDir?: string }): CustomEditorEntry[] {
  return readCustomEditorsSync(resolveRegistryFile(options?.configDir));
}

export function findCustomEditor(
  editorId: string,
  options?: { configDir?: string },
): CustomEditorEntry | null {
  return listCustomEditors(options).find((entry) => entry.id === editorId) ?? null;
}

/** 图标解析默认走 editors.ts 的完整链路。动态 import：editors.ts 顶层 import electron，
 *  纯 node 测试环境无法静态加载（测试注入 resolveIcon 替代）。 */
const defaultResolveIcon = async (editorId: string, appPath: string): Promise<string | null> => {
  const { getAppIconDataUrl } = await import("./editors.js");
  return getAppIconDataUrl(editorId, appPath);
};

/**
 * 注册一个自定义应用。按 appPath 幂等：已注册时直接返回既有条目。
 * 返回 null 表示路径非法或图标解析失败（不写盘）。
 */
export async function addCustomEditor(
  appPath: string,
  options?: CustomEditorRegistryOptions,
): Promise<CustomEditorEntry | null> {
  if (!existsSync(appPath) || !isValidCustomEditorAppPath(appPath)) {
    logger.warn("[custom-editors] 拒绝非法定制应用路径", { appPath });
    return null;
  }

  const registryFile = resolveRegistryFile(options?.configDir);
  const entries = readCustomEditorsSync(registryFile);
  const existing = entries.find((entry) => entry.appPath === appPath);
  if (existing) {
    return existing;
  }

  const id = `${CUSTOM_EDITOR_ID_PREFIX}${(options?.createId ?? createUuid)()}`;
  const iconDataUrl = await (options?.resolveIcon ?? defaultResolveIcon)(id, appPath);
  if (!iconDataUrl) {
    logger.warn("[custom-editors] 图标解析失败，放弃注册", { appPath });
    return null;
  }

  const entry: CustomEditorEntry = {
    id,
    appPath,
    name: deriveCustomEditorName(appPath),
    iconDataUrl,
  };
  writeCustomEditorsSync(registryFile, [...entries, entry]);
  logger.info("[custom-editors] 已注册自定义打开方式", { id, appPath });
  return entry;
}

/** 删除一个自定义应用；返回是否确实删除（id 不存在时 false）。 */
export function removeCustomEditor(editorId: string, options?: { configDir?: string }): boolean {
  const registryFile = resolveRegistryFile(options?.configDir);
  const entries = readCustomEditorsSync(registryFile);
  const nextEntries = entries.filter((entry) => entry.id !== editorId);
  if (nextEntries.length === entries.length) {
    return false;
  }

  writeCustomEditorsSync(registryFile, nextEntries);
  logger.info("[custom-editors] 已删除自定义打开方式", { editorId });
  return true;
}
