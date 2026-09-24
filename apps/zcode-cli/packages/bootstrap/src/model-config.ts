import type {
  AiSdkModelExecutionConfig,
  AiSdkNetworkConfig,
  EnvRecord,
} from "@zcode/adapters/model";
import {
  applyCustomModelRequestHeaders,
  buildModelRequestDefaultHeaders,
  parseCustomModelRequestHeadersEnv,
  resolveRuntimeZCodeEndpointOrigin,
  ZXCODE_APP_VERSION_ENV,
  ZXCODE_MODEL_CUSTOM_HEADERS_ENV,
} from "@zcode/shared";

export type ModelProviderSourceTitle = "cli" | "electron";

interface RuntimeExecutionConfigOptions {
  appVersion?: string;
  network?: AiSdkNetworkConfig;
  sourceTitle?: ModelProviderSourceTitle;
}

export function createRuntimeAiSdkModelExecutionConfig(
  env: EnvRecord = process.env,
  options: RuntimeExecutionConfigOptions = {},
): AiSdkModelExecutionConfig {
  const network = normalizeAiSdkNetworkConfig(options.network);
  return {
    defaultHeaders: buildCliZCodeSourceHeaders(env, options),
    env,
    ...(network ? { network } : {}),
  };
}

function normalizeAiSdkNetworkConfig(
  network: AiSdkNetworkConfig | undefined,
): AiSdkNetworkConfig | undefined {
  if (!network?.caCertFile && !network?.httpProxy && !network?.noProxy) return undefined;
  return {
    ...(network.caCertFile ? { caCertFile: network.caCertFile } : {}),
    ...(network.httpProxy ? { httpProxy: network.httpProxy } : {}),
    ...(network.noProxy ? { noProxy: network.noProxy } : {}),
  };
}

// 来源归因头 + agent 代号头。环境/统计指纹头已随去平台化清理删除。
// 默认头统一由 shared 的 buildModelRequestDefaultHeaders 构造：设置页展示的预填值
// （ISettingService.getModelRequestHeaderDefaults）与本函数共用同一实现，保证两侧一致。
// 用户自定义模型请求头（specs/custom-request-headers.md）按名覆盖默认来源头：env 由桌面 host
// spawn 时注入（CLI 用户也可手设）；非法条目只剔除，不影响其余默认头。
function buildCliZCodeSourceHeaders(
  env: EnvRecord,
  options: Pick<RuntimeExecutionConfigOptions, "appVersion" | "sourceTitle"> = {},
): Record<string, string> {
  const sourceTitle = options.sourceTitle ?? detectDefaultProviderSourceTitle();
  const appVersion = resolveAppVersionForHeaders(env, options);
  return applyCustomModelRequestHeaders(
    buildModelRequestDefaultHeaders({
      appVersion,
      endpointOrigin: resolveRuntimeZCodeEndpointOrigin(env),
      sourceTitle,
    }),
    parseCustomModelRequestHeadersEnv(env[ZXCODE_MODEL_CUSTOM_HEADERS_ENV]),
  );
}

function resolveAppVersionForHeaders(
  env: EnvRecord,
  options: Pick<RuntimeExecutionConfigOptions, "appVersion">,
): string | undefined {
  const value = (env[ZXCODE_APP_VERSION_ENV] ?? options.appVersion)?.trim();
  if (!value || !/^[\x20-\x7e]+$/.test(value)) {
    return undefined;
  }
  return value;
}

function detectDefaultProviderSourceTitle(): ModelProviderSourceTitle {
  return process.argv.includes("app-server") || process.argv.includes("agent-server")
    ? "electron"
    : "cli";
}
