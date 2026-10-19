import { ZXCODE_VERSION, type ZCodeEnv } from "@zcode/shared";

declare const __ZXCODE_CDN_BASE_URL__: string | undefined;
// 导出默认海外 CDN 基址供测试引用：门禁禁止 zcode.z.ai 字面量散落测试文件，
// 断言值必须与这里的单一事实源一致（本文件在门禁允许清单内）。
export const DEFAULT_CDN_BASE_URL = "https://cdn-zcode.z.ai";

export interface ResolveRemoteCdnOptions {
  env?: ZCodeEnv;
  locale?: string;
  timeZone?: string;
  overrideBaseUrl?: string;
  version?: string;
  now?: Date;
}

function isChineseLocale(locale?: string | null): boolean {
  return locale?.trim().toLowerCase().startsWith("zh") ?? false;
}

function resolveLocalTimeZone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isUtcPlusEightTimeZone(timeZone?: string | null, now: Date = new Date()): boolean {
  const normalizedTimeZone = timeZone?.trim();
  if (!normalizedTimeZone) {
    return false;
  }

  const offsetMinutes = resolveTimeZoneOffsetMinutes(normalizedTimeZone, now);
  return offsetMinutes === 8 * 60;
}

export function shouldPreferDomesticRemoteCdn(
  options: Pick<ResolveRemoteCdnOptions, "locale" | "timeZone" | "now">,
): boolean {
  const timeZone = options.timeZone ?? resolveLocalTimeZone();
  return isChineseLocale(options.locale) && isUtcPlusEightTimeZone(timeZone, options.now);
}

export function resolveRemoteCdnBaseUrls(options: ResolveRemoteCdnOptions = {}): string[] {
  const override = options.overrideBaseUrl?.trim();
  if (override) return [normalizeBaseUrl(override)];
  const baseUrl =
    process.env.ZXCODE_CDN_BASE_URL?.trim() ||
    (typeof __ZXCODE_CDN_BASE_URL__ === "undefined" ? "" : __ZXCODE_CDN_BASE_URL__) ||
    DEFAULT_CDN_BASE_URL;
  return [
    `${normalizeBaseUrl(baseUrl)}/zcode/electron/releases/${options.version ?? ZXCODE_VERSION}`,
  ];
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("CDN URL must use http or https");
  return value.replace(/\/+$/, "");
}

function resolveTimeZoneOffsetMinutes(timeZone: string, now: Date): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(now);
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
    );
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    const second = Number(values.second);
    if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
      return null;
    }

    // 这里把目标时区“格式化后的人类时间”反算成 UTC，得到该时区相对 UTC 的真实偏移。
    // 不能只按常见亚洲城市白名单判断，否则 UTC+8 但非中国命名的时区会被误判。
    const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const currentUtcMs = now.getTime();
    return Math.round((targetUtcMs - currentUtcMs) / 60_000);
  } catch {
    return null;
  }
}
