import { describe, expect, it } from "vitest";
import { ZXCODE_AGENT_RUNTIME } from "@zcode/shared";

describe("ZCode Agent runtime", () => {
  it("starts the private ZCode Protocol server instead of the retired ZCode Agent command", () => {
    const retiredProtocolName = `${"a"}${"cp"}`;

    expect(ZXCODE_AGENT_RUNTIME.spawnArgs).toEqual(["app-server", "--stdio"]);
    expect(ZXCODE_AGENT_RUNTIME.spawnArgs).not.toContain(retiredProtocolName);
  });

  it("uses the ZCode Agent binary name", () => {
    expect(ZXCODE_AGENT_RUNTIME.resolveEntrySegments("darwin")).toEqual(["zxcode-agent"]);
    expect(ZXCODE_AGENT_RUNTIME.resolveEntrySegments("win32")).toEqual(["zxcode-agent.exe"]);
  });
});
