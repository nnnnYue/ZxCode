import { describe, expect, it } from "vitest";
import {
  appSettingsSchema,
  appSettingsPatchSchema,
} from "../../shared/src/validationAppSettings.js";
import { zcodeTaskMetaSchema } from "../../shared/src/validation.js";
import { readAskUserQuestionAnswers } from "../src/lib/askUserQuestion.js";
import {
  getAgentPrimaryText,
  getAgentKindLabel,
} from "../src/ToolCallBlocks/renderers/agentHelpers.js";
import { getToolCallErrorText } from "../src/lib/toolError.js";
import { resolveToolCallIdentity } from "../src/lib/toolIdentity.js";
import { extractStructuredDiff } from "../src/lib/toolDiffPreview.js";

// fork 原 node:test 用例，vitest 全量接管后转为 vitest 断言，语义不变。

const meta = {
  taskId: "session-example",
  traceId: "trace-example",
  title: "Example",
  workspacePath: "/example/workspace",
  createdAt: 1,
  updatedAt: 2,
  mode: "build",
  provider: "glm",
};

describe("non-CLI ACP retirement", () => {
  it("current task metadata is accepted without upgrading third-party Agent identities", () => {
    expect(zcodeTaskMetaSchema.parse(meta).provider).toBe("glm");
    // fork：历史第三方 provider 值归一为 glm（legacyZCodeProviderSchema transform），
    // 不再以第三方身份浮出；完全未知的 provider 仍拒绝。
    for (const provider of ["claude", "codex", "gemini", "opencode"]) {
      expect(zcodeTaskMetaSchema.parse({ ...meta, provider }).provider).toBe("glm");
    }
    expect(zcodeTaskMetaSchema.safeParse({ ...meta, provider: "not-a-provider" }).success).toBe(
      false,
    );
  });

  it("obsolete Agent settings are stripped without dropping current user preferences", () => {
    const settings = {
      enabledBuiltinAgentCliProviders: ["claude", "codex"],
      localePreference: "en-US",
    };
    for (const schema of [appSettingsSchema, appSettingsPatchSchema]) {
      const parsed = schema.parse(settings);
      expect(parsed.localePreference).toBe("en-US");
      // fork：第三方 Agent 项归一为仅剩 ZxCode Agent，不保留 claude/codex。
      expect(parsed.enabledBuiltinAgentCliProviders).toEqual(["glm"]);
    }
  });

  it("current question results work while Claude ACP text is no longer interpreted as answers", () => {
    const input = { question: "Choose", options: [{ label: "One" }, { label: "Two" }] };
    expect(
      readAskUserQuestionAnswers({ input, output: { type: "answered", selected: "One" } }),
    ).toEqual({ Choose: "One" });
    expect(
      readAskUserQuestionAnswers({ input, output: { type: "answered_custom", text: "Custom" } }),
    ).toEqual({ Choose: "Custom" });
    expect(readAskUserQuestionAnswers({ output: { answers: { Choose: "Two" } } })).toEqual({
      Choose: "Two",
    });
    for (const output of ['"Choose"="One"', { content: [{ text: '"Choose"="One"' }] }]) {
      expect(readAskUserQuestionAnswers({ input, output })).toBeUndefined();
      expect(readAskUserQuestionAnswers({ input, raw: { output } })).toBeUndefined();
      expect(readAskUserQuestionAnswers({ input, raw: { rawOutput: output } })).toBeUndefined();
    }
  });

  it("ZxCode subagent identity wins over retired Codex nicknames", () => {
    const tool = {
      id: "tool-example",
      kind: "Agent",
      title: "Agent",
      status: "completed" as const,
      input: { subagent_type: "researcher", description: "Inspect sources" },
      raw: { nickname: "retired nickname" },
    };
    expect(getAgentPrimaryText(tool, "Agent")).toBe("Inspect sources");
    expect(getAgentKindLabel(tool, "Agent")).toBe("researcher");
    expect(resolveToolCallIdentity({ toolName: "Task" }).family).toBe("agent");
    expect(resolveToolCallIdentity({ kind: "spawn_agent" }).family).toBe("unknown");
  });

  it("current tool errors remain available without Claude ACP status overrides", () => {
    expect(getToolCallErrorText({ status: "failed", error: "Permission denied" })).toBe(
      "Permission denied",
    );
    expect(
      getToolCallErrorText({
        status: "failed",
        output: "<tool_use_error>Invalid input</tool_use_error>",
      }),
    ).toBe("Invalid input");
    expect(
      getToolCallErrorText({
        status: "completed",
        raw: { status: "failed", rawOutput: "legacy error" },
      }),
    ).toBeUndefined();
  });

  it("generic structured diffs still accept current tool content", () => {
    const diff = { type: "diff", path: "/example/file.ts", oldText: "before", newText: "after" };
    expect(extractStructuredDiff({ content: [diff] })).toEqual({
      path: diff.path,
      oldText: diff.oldText,
      newText: diff.newText,
    });
  });
});
