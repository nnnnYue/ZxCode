import type { ZCodeEnv } from "./env.js";

export const DEFAULT_ZXCODE_ENDPOINT_ORIGIN = "https://zcode.z.ai";
export const DEFAULT_BIGMODEL_API_ORIGIN = "https://bigmodel.cn";

// 构建仅注入公开链接；Node 调用方仍可显式传 env，避免读取另一进程的配置。
declare const __ZXCODE_ENDPOINT_ENV__: Record<string, string | undefined> | undefined;
export function pickProductEndpointEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const keys = ["ZXCODE_BASE_URL", "ZXCODE_ENDPOINT_ORIGIN", "BIGMODEL_API_BASE_URL"];
  return Object.fromEntries(
    keys.flatMap((key) => (env[key]?.trim() ? [[key, env[key]!.trim()]] : [])),
  );
}
export function readProductEndpointEnv(): Record<string, string | undefined> {
  return {
    ...(typeof __ZXCODE_ENDPOINT_ENV__ === "undefined" ? {} : __ZXCODE_ENDPOINT_ENV__),
    ...pickProductEndpointEnv(typeof process === "undefined" ? {} : process.env),
  };
}

export interface RuntimeZCodeEndpointEnv {
  [key: string]: string | undefined;
  ZXCODE_ENV?: string;
  ZXCODE_BASE_URL?: string;
  ZXCODE_ENDPOINT_ORIGIN?: string;
}

export interface RuntimeBigModelApiEnv {
  [key: string]: string | undefined;
  ZXCODE_ENV?: string;
  BIGMODEL_API_BASE_URL?: string;
}

export interface RuntimeProductEndpointEnv extends RuntimeZCodeEndpointEnv, RuntimeBigModelApiEnv {}

function readRuntimeEnvValue(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function normalizeZCodeEndpointOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("ZxCode endpoint origin is empty");
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("ZxCode endpoint origin must use http or https");
  }
  return parsed.origin;
}

export function resolveZCodeEndpointOrigin(options?: {
  env?: ZCodeEnv;
  envBaseOrigin?: string | null;
  overrideOrigin?: string | null;
}): string {
  const origin = options?.overrideOrigin?.trim() || options?.envBaseOrigin?.trim();
  return origin ? normalizeZCodeEndpointOrigin(origin) : DEFAULT_ZXCODE_ENDPOINT_ORIGIN;
}

// 手机远控外部 relay 的默认 WS 地址；自部署 relay 由设置/环境变量经 overrideUrl 覆盖。
export const DEFAULT_WEB_REMOTE_CONTROL_RELAY_WS_URL = "wss://zcode.z.ai/ws";

export function resolveWebRemoteControlRelayWsUrl(options?: {
  endpointOrigin?: string | null | undefined;
  overrideUrl?: string | null | undefined;
}): string {
  const overrideUrl = options?.overrideUrl?.trim();
  if (overrideUrl) {
    return overrideUrl;
  }
  // 上游对 test endpoint 单独返回同一 relay 地址；本 fork 无独立 test origin，统一走默认值。
  return DEFAULT_WEB_REMOTE_CONTROL_RELAY_WS_URL;
}

// 上游同名的 test origin；开源构建与默认 origin 相同，仅保持引用方兼容。
export const TEST_ZCODE_ENDPOINT_ORIGIN = DEFAULT_ZXCODE_ENDPOINT_ORIGIN;

export const WEB_REMOTE_CONTROL_V4_MIN_APP_VERSION = "3.4.0";

function isWebRemoteControlV4AppVersion(appVersion: string | undefined): boolean {
  if (!appVersion) {
    return false;
  }

  // zcodeEndpoint 会被 Vite 配置在 Node 加载期直接导入，不能依赖源码态 `.js` runtime import。
  // 这里只比较固定的稳定版门槛；高于 3.4.0 的预发布版本仍满足门槛，3.4.0 自身的预发布版本不满足。
  const normalizedVersion = appVersion.trim().replace(/^v/i, "");
  const match = normalizedVersion.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([^+]+))?(?:\+(.+))?$/,
  );
  if (!match) {
    return false;
  }

  const prereleaseIdentifiers = match[4]?.split(".");
  const buildIdentifiers = match[5]?.split(".");
  if (
    (prereleaseIdentifiers ?? []).some((identifier) => !/^[0-9A-Za-z-]+$/.test(identifier)) ||
    (buildIdentifiers ?? []).some((identifier) => !/^[0-9A-Za-z-]+$/.test(identifier))
  ) {
    return false;
  }

  const versionParts = [Number(match[1]), Number(match[2]), Number(match[3])];
  const floorParts = WEB_REMOTE_CONTROL_V4_MIN_APP_VERSION.split(".").map(Number);
  for (let index = 0; index < floorParts.length; index += 1) {
    if (versionParts[index]! !== floorParts[index]!) {
      return versionParts[index]! > floorParts[index]!;
    }
  }

  return prereleaseIdentifiers === undefined;
}

export interface ZCodeEndpointUrls {
  origin: string;
  apiBaseUrl: string;
  remoteUrl: string;
  /** fork：手机远控 relay WS 地址（v1 自部署 relay / 官方 relay 兼容）。 */
  relayWsUrl?: string;
}

export interface BuildZCodeEndpointUrlsOptions {
  appVersion?: string;
}

// v3.14.3 同步时曾因零调用方删除本组 builder；v3.15.1 的 web 远控（remoteUrl 的
// v3/v4 版本门槛）重新需要，按当前调用面恢复裁剪版，coding plan 计费 URL 不复活。
export function buildZCodeEndpointUrls(
  origin: string,
  options: BuildZCodeEndpointUrlsOptions = {},
): ZCodeEndpointUrls {
  const normalizedOrigin = normalizeZCodeEndpointOrigin(origin);
  // 无法解析或低于分界版本时保守使用 v3，避免开发版本和旧客户端进入未兼容的 v4 页面。
  const remoteVersion = isWebRemoteControlV4AppVersion(options.appVersion) ? "v4" : "v3";

  return {
    origin: normalizedOrigin,
    apiBaseUrl: `${normalizedOrigin}/api/v1`,
    remoteUrl: `${normalizedOrigin}/remote/${remoteVersion}`,
    relayWsUrl: resolveWebRemoteControlRelayWsUrl({ endpointOrigin: normalizedOrigin }),
  };
}

export function resolveRuntimeZCodeEnv(
  env: RuntimeZCodeEndpointEnv = readProductEndpointEnv(),
): ZCodeEnv {
  // 产品身份仅用于既有展示与安装标识，不参与地址解析。
  return env.ZXCODE_ENV?.trim().toLowerCase() === "test" ? "test" : "production";
}

export function resolveRuntimeZCodeEndpointOrigin(
  env: RuntimeZCodeEndpointEnv = readProductEndpointEnv(),
  options?: { overrideOrigin?: string | null },
): string {
  return resolveZCodeEndpointOrigin({
    envBaseOrigin:
      readRuntimeEnvValue(env, "ZXCODE_BASE_URL") ??
      readRuntimeEnvValue(env, "ZXCODE_ENDPOINT_ORIGIN"),
    overrideOrigin: options?.overrideOrigin,
  });
}

export function resolveBigModelApiOrigin(
  env: RuntimeBigModelApiEnv = readProductEndpointEnv(),
): string {
  return normalizeZCodeEndpointOrigin(
    readRuntimeEnvValue(env, "BIGMODEL_API_BASE_URL") ?? DEFAULT_BIGMODEL_API_ORIGIN,
  );
}

export function rewriteZCodeEndpointUrl(input: string | URL, endpointOrigin: string): string | URL {
  const originalUrl = typeof input === "string" ? input : input.toString();
  let parsed: URL;
  try {
    parsed = new URL(originalUrl);
  } catch {
    return input;
  }
  const sourceOrigin = DEFAULT_ZXCODE_ENDPOINT_ORIGIN;
  if (parsed.origin !== sourceOrigin) {
    return input;
  }

  const targetOrigin = normalizeZCodeEndpointOrigin(endpointOrigin);
  if (targetOrigin === sourceOrigin) {
    return input;
  }

  const target = new URL(targetOrigin);
  target.pathname = parsed.pathname;
  target.search = parsed.search;
  target.hash = parsed.hash;
  return target.toString();
}
