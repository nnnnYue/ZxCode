import {
  ZXCODE_AGENT_PROVIDER,
  ZXCODE_COMMAND_AGENT_SOURCES,
  type ZCodeProvider,
  type CommandAgentSource,
} from "@zcode/shared";

export const COMMAND_AGENT_SOURCES = [
  ...ZXCODE_COMMAND_AGENT_SOURCES,
] as const satisfies readonly CommandAgentSource[];

export const COMMAND_AGENT_SOURCE_META: Record<
  CommandAgentSource,
  {
    labelId: string;
    provider: ZCodeProvider;
    pathHint: string;
  }
> = {
  zcodeAgent: {
    labelId: "settings.commands.source.zcodeAgent",
    pathHint: "~/.zxcode/commands",
    provider: ZXCODE_AGENT_PROVIDER,
  },
};
