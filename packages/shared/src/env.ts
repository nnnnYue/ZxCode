export type ZCodeEnv = "test" | "production";
/** 安装包身份：决定应用名、app id、Electron 数据目录与更新策略；与后端环境 `ZCodeEnv` 是两个轴。 */
export type ZCodeProductFlavor = "production" | "preview";

// 非构建环境（如 e2e 测试的 mocha）下 define 不存在，用 typeof 检查 + fallback 避免 ReferenceError
declare const __ZXCODE_ENV__: string;
declare const __ZXCODE_PRODUCT_FLAVOR__: string;

export function normalizeZCodeEnv(value: string | undefined): ZCodeEnv {
  return value?.trim().toLowerCase() === "production" ? "production" : "test";
}

export const ZXCODE_ENV = normalizeZCodeEnv(
  typeof __ZXCODE_ENV__ !== "undefined" ? __ZXCODE_ENV__ : undefined,
);

/**
 * 身份缺省跟随后端环境（test → preview，production → production）。
 * 桌面构建通过 `ZXCODE_PREVIEW_IDENTITY=1` 显式注入 preview，得到连接生产后端的 Preview 包；
 * 未注入 define 的 bundle（web、CLI、测试）沿用旧的单轴语义。
 */
export function normalizeZCodeProductFlavor(
  value: string | undefined,
  zcodeEnv: ZCodeEnv,
): ZCodeProductFlavor {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production" || normalized === "preview") {
    return normalized;
  }
  return zcodeEnv === "production" ? "production" : "preview";
}

export const ZXCODE_PRODUCT_FLAVOR = normalizeZCodeProductFlavor(
  typeof __ZXCODE_PRODUCT_FLAVOR__ !== "undefined" ? __ZXCODE_PRODUCT_FLAVOR__ : undefined,
  ZXCODE_ENV,
);
export const ZXCODE_APP_VERSION_ENV = "ZXCODE_APP_VERSION" as const;
export const ZXCODE_BUILD_COMMIT_ID_ENV = "ZXCODE_BUILD_COMMIT_ID" as const;
/** 桌面 host 下发用户自定义模型请求头的 env；值为 JSON `Array<{name, value}>`。 */
export const ZXCODE_MODEL_CUSTOM_HEADERS_ENV = "ZXCODE_MODEL_CUSTOM_HEADERS" as const;

// ── 运行时环境变量（不经过编译打包，启动时从 process.env 读取） ──
// 启用调试模式，值为 inspect-brk 的端口号，如 ZXCODE_DEBUG=9230
export const RUNTIME_ZXCODE_DEBUG =
  typeof process !== "undefined" ? process.env.ZXCODE_DEBUG : undefined;
