import { DEFAULT_ZXCODE_ENDPOINT_ORIGIN } from "./zcodeEndpoint.js";

// 仅保留 OpenRouter 官方归因字段（HTTP-Referer / X-Title）与标准 User-Agent。
// 环境/统计指纹头（X-Platform/X-Os-*/X-Release-Channel/X-Client-*/X-ZxCode-App-Version/X-Device-Mid）
// 已随去平台化清理删除。
export const ZXCODE_SOURCE_HEADERS = {
  "User-Agent": "ZxCode/unknown",
  "HTTP-Referer": DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
  "X-Title": "ZxCode@electron",
} as const;

export interface BuildZCodeSourceHeadersFromContextOptions {
  appVersion?: string;
  endpointOrigin?: string;
  sourceTitle?: string;
}

export function normalizeZCodeSourceHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^[\x20-\x7e]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function buildZCodeSourceHeadersFromContext(
  options: BuildZCodeSourceHeadersFromContextOptions = {},
): Record<string, string> {
  const appVersion = normalizeZCodeSourceHeaderValue(options.appVersion);
  const endpointOrigin =
    normalizeZCodeSourceHeaderValue(options.endpointOrigin) ?? DEFAULT_ZXCODE_ENDPOINT_ORIGIN;
  const sourceTitle = normalizeZCodeSourceHeaderValue(options.sourceTitle) ?? "electron";

  return {
    ...ZXCODE_SOURCE_HEADERS,
    "HTTP-Referer": endpointOrigin,
    "User-Agent": `ZxCode/${appVersion ?? "unknown"}`,
    "X-Title": `ZxCode@${sourceTitle}`,
  };
}

// ── 用户自定义模型请求头（specs/custom-request-headers.md） ──

export interface CustomModelRequestHeaderEntry {
  name: string;
  value: string;
}

// RFC 7230 header 名 token 约束；冒号、空白等分隔符不允许出现在名字里。
const MODEL_REQUEST_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// 值与来源头同约束：仅可打印 ASCII，避免多字节字符在 SDK/网关侧被不可控地转码。
const MODEL_REQUEST_HEADER_VALUE_PATTERN = /^[\x20-\x7e]+$/;
export const CUSTOM_MODEL_REQUEST_HEADERS_MAX_ENTRIES = 32;

export function isValidModelRequestHeaderName(name: string): boolean {
  return MODEL_REQUEST_HEADER_NAME_PATTERN.test(name);
}

export function isValidModelRequestHeaderValue(value: string): boolean {
  return MODEL_REQUEST_HEADER_VALUE_PATTERN.test(value);
}

/**
 * 解析 `ZXCODE_MODEL_CUSTOM_HEADERS` env（JSON `Array<{name, value}>`）。
 * 环境变量属于用户可手写入口，任何非法条目（形状错误、名字/值不合法、超上限、重复名）
 * 都只剔除该条目，不让整次解析失败影响模型请求。
 */
export function parseCustomModelRequestHeadersEnv(
  raw: string | undefined,
): CustomModelRequestHeaderEntry[] {
  if (!raw?.trim()) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const entries: CustomModelRequestHeaderEntry[] = [];
  const seenNames = new Set<string>();
  for (const item of parsed) {
    if (entries.length >= CUSTOM_MODEL_REQUEST_HEADERS_MAX_ENTRIES) break;
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const value = typeof record.value === "string" ? record.value.trim() : "";
    if (!isValidModelRequestHeaderName(name) || !isValidModelRequestHeaderValue(value)) continue;
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    entries.push({ name, value });
  }
  return entries;
}

/**
 * 把用户自定义头按名覆盖到默认来源头之上（不区分大小写；列表顺序靠后的同名条目胜出）。
 * 只返回新对象，不改写传入的 source。
 */
export function applyCustomModelRequestHeaders(
  source: Readonly<Record<string, string>>,
  custom: readonly CustomModelRequestHeaderEntry[],
): Record<string, string> {
  if (custom.length === 0) {
    return { ...source };
  }
  const headers: Record<string, string> = { ...source };
  for (const entry of custom) {
    for (const existing of Object.keys(headers)) {
      if (existing.toLowerCase() === entry.name.toLowerCase()) {
        delete headers[existing];
      }
    }
    headers[entry.name] = entry.value;
  }
  return headers;
}
