import { describe, expect, it } from "vitest";
import {
  getMobileRelayTriggerPresentation,
  shouldShowMobileRelayTrigger,
} from "@/WorkspaceWebRemoteControlTrigger.js";

const formatMessage = ({ id }: { id: string }) => id;

const baseStatus = {
  supported: true,
  enabled: true,
  connected: true,
  serverUrl: "http://127.0.0.1:8787",
} as const;

describe("getMobileRelayTriggerPresentation", () => {
  it("uses success styling when the relay control connection is up", () => {
    const presentation = getMobileRelayTriggerPresentation(baseStatus, formatMessage);

    expect(presentation.iconClassName).toContain("text-success");
    expect(presentation.tooltip).toBe("webRemoteControl.triggerStatus.relayConnected");
  });

  it("uses destructive styling with the relay error while enabled but failed", () => {
    const presentation = getMobileRelayTriggerPresentation(
      { ...baseStatus, connected: false, lastError: "relay control connection lost" },
      formatMessage,
    );

    expect(presentation.iconClassName).toContain("text-destructive");
    expect(presentation.tooltip).toBe("webRemoteControl.triggerStatus.relayError");
  });

  it("uses subtle styling while the relay control connection is still connecting", () => {
    const presentation = getMobileRelayTriggerPresentation(
      { ...baseStatus, connected: false },
      formatMessage,
    );

    expect(presentation.iconClassName).toContain("text-foreground-subtle");
    expect(presentation.tooltip).toBe("webRemoteControl.triggerStatus.relayConnecting");
  });
});

describe("shouldShowMobileRelayTrigger", () => {
  it("shows the entry once relay is enabled with a configured server url", () => {
    expect(shouldShowMobileRelayTrigger(baseStatus)).toBe(true);
    // 控制连接瞬断不隐藏入口：connected 只影响图标颜色，避免入口闪烁消失。
    expect(shouldShowMobileRelayTrigger({ ...baseStatus, connected: false })).toBe(true);
  });

  it("hides the entry when relay is unsupported, disabled, or unconfigured", () => {
    expect(shouldShowMobileRelayTrigger(undefined)).toBe(false);
    expect(shouldShowMobileRelayTrigger({ ...baseStatus, supported: false })).toBe(false);
    expect(shouldShowMobileRelayTrigger({ ...baseStatus, enabled: false })).toBe(false);
    expect(shouldShowMobileRelayTrigger({ ...baseStatus, serverUrl: undefined })).toBe(false);
    expect(shouldShowMobileRelayTrigger({ ...baseStatus, serverUrl: "  " })).toBe(false);
  });
});
