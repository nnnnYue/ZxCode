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
