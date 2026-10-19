import { z } from "zod";
import type { CommandAgentSource } from "./command-types.js";
import type { ZCodeProvider } from "./zcode-task-types-core.js";

export const ZXCODE_AGENT_PROVIDER = "glm" satisfies ZCodeProvider;
export const ZXCODE_AGENT_PROVIDER_LABEL = "ZxCode Agent";
export const ZXCODE_COMMAND_AGENT_SOURCE =
  "zcodeAgent" satisfies CommandAgentSource;

export const zcodeAgentProviderSchema = z.literal(ZXCODE_AGENT_PROVIDER);

/**
 * 解析持久化/relay 数据时的 provider 归一 schema：
 * 已移除的第三方 provider 历史值仅作为归一化输入保留，统一收敛为 glm；
 * 其它非法值保持拒绝，与收窄前的校验边界一致。
 */
export const legacyZCodeProviderSchema = z
  .enum(["claude", "opencode", "gemini", "codex", "glm"])
  .transform((): typeof ZXCODE_AGENT_PROVIDER => ZXCODE_AGENT_PROVIDER);

export const ZCODE_ENABLED_AGENT_PROVIDERS = [
  ZXCODE_AGENT_PROVIDER,
] as const satisfies readonly ZCodeProvider[];

export const ZXCODE_COMMAND_AGENT_SOURCES = [
  ZXCODE_COMMAND_AGENT_SOURCE,
] as const satisfies readonly CommandAgentSource[];

export function normalizeAgentProviderToZCodeAgent(
  _provider?: ZCodeProvider | null,
): ZCodeProvider {
  return ZXCODE_AGENT_PROVIDER;
}

export function normalizeAgentProvidersToZCodeAgent(
  _providers?: ReadonlyArray<ZCodeProvider> | null,
): ZCodeProvider[] {
  return [...ZCODE_ENABLED_AGENT_PROVIDERS];
}

export function normalizeCommandAgentSourceToZCodeAgent(
  _agentSource?: CommandAgentSource | null,
): CommandAgentSource {
  return ZXCODE_COMMAND_AGENT_SOURCE;
}

export function isZCodeAgentProvider(
  provider: ZCodeProvider | null | undefined,
): provider is typeof ZXCODE_AGENT_PROVIDER {
  return provider === ZXCODE_AGENT_PROVIDER;
}
