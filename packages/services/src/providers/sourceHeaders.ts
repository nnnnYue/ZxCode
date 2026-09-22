import {
  buildZCodeSourceHeadersFromContext,
  normalizeZCodeSourceHeaderValue,
  ZXCODE_VERSION,
} from "@zcode/shared";

interface ZCodeSourceHeaderOptions {
  appVersion?: string;
  sourceTitle?: string;
}

// 来源归因头（User-Agent/HTTP-Referer/X-Title）的 services 侧组装。
// 环境/统计指纹头已随去平台化清理删除，不再读取 locale/时区/OS/deviceMid。
export function buildZCodeSourceHeaders(
  options: ZCodeSourceHeaderOptions = {},
): Record<string, string> {
  const appVersion = normalizeZCodeSourceHeaderValue(options.appVersion ?? ZXCODE_VERSION);

  return buildZCodeSourceHeadersFromContext({
    appVersion,
    sourceTitle: options.sourceTitle ?? "electron",
  });
}
