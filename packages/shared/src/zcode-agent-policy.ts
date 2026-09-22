import { z } from "zod";
import type { CommandAgentSource } from "./command-types.js";
import type { ZCodeProvider } from "./zcode-task-types-core.js";

export const ZXCODE_AGENT_PROVIDER = "glm" satisfies ZCodeProvider;
export const ZXCODE_AGENT_PROVIDER_LABEL = "ZxCode Agent";
export const ZXCODE_COMMAND_AGENT_SOURCE = "zcodeAgent" satisfies CommandAgentSource;

export const zcodeAgentProviderSchema = z.literal(ZXCODE_AGENT_PROVIDER);

export const ZXCODE_COMMAND_AGENT_SOURCES = [
  ZXCODE_COMMAND_AGENT_SOURCE,
] as const satisfies readonly CommandAgentSource[];

export function normalizeAgentProviderToZCodeAgent(
  _provider?: ZCodeProvider | null,
): ZCodeProvider {
  return ZXCODE_AGENT_PROVIDER;
}

export function isZCodeAgentProvider(
  provider: ZCodeProvider | null | undefined,
): provider is typeof ZXCODE_AGENT_PROVIDER {
  return provider === ZXCODE_AGENT_PROVIDER;
}
