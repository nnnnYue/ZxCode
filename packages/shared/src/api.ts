export interface ApiRequestInit extends RequestInit {
  timeoutMs?: number;
  /** 补关联等非登录校验请求自行处理 401，不能触发全局退出。 */
  authFailurePolicy?: "caller-handled";
}

export interface ApiClient {
  request(input: string | URL, init?: ApiRequestInit): Promise<Response>;
}

/** 只校验请求头字符，不验证 Token 身份；空值或非法字符不生成 Authorization。 */
export function toBearerAuthorization(token: string | null | undefined): string | null {
  const value = token?.trim();
  return value && /^[\x21-\x7e]+$/.test(value) ? `Bearer ${value}` : null;
}

export type ZCodeJwtTokenResolver = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

/** 配置允许匿名读取；凭据不可读或格式非法时不得阻断配置，也不透出原始异常。 */
export async function resolveOptionalZCodeAuthorization(
  resolveToken?: ZCodeJwtTokenResolver,
): Promise<string | null> {
  try {
    return toBearerAuthorization(await resolveToken?.());
  } catch {
    return null;
  }
}

// 运营可把刷新调到分钟级；上限保持原有的一小时，缺省或非法值不能让客户端比原来更频繁或更慢。
const REFRESH_INTERVAL_DEFAULT_SECONDS = 3600;
const REFRESH_INTERVAL_MIN_SECONDS = 60;
const REFRESH_INTERVAL_MAX_SECONDS = 3600;

/** ClientConfigService 与 Built-in 刷新共用；入参为响应的 data.configs。 */
export function resolveClientConfigRefreshIntervalMs(configs: unknown): number {
  const value =
    configs && typeof configs === "object" && !Array.isArray(configs)
      ? (configs as Record<string, unknown>).clientConfigRefreshIntervalSeconds
      : undefined;
  const seconds =
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.min(
          Math.max(Math.floor(value), REFRESH_INTERVAL_MIN_SECONDS),
          REFRESH_INTERVAL_MAX_SECONDS,
        )
      : REFRESH_INTERVAL_DEFAULT_SECONDS;
  return seconds * 1000;
}

export interface ApiErrorOptions {
  message: string;
  url: string;
  method?: string;
  status?: number;
  responseHeaders?: Record<string, string>;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly url: string;
  readonly method: string;
  readonly status?: number;
  readonly responseHeaders?: Record<string, string>;

  constructor(options: ApiErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ApiError";
    this.url = options.url;
    this.method = (options.method ?? "GET").toUpperCase();
    this.status = options.status;
    this.responseHeaders = options.responseHeaders;
  }
}
