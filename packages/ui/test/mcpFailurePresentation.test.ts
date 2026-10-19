import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ZCodeIntlProvider } from "../src/i18n/IntlProvider.js";
import {
  McpFailurePresentation,
  resolveMcpFailureMessageId,
} from "../src/settings/McpFailurePresentation.js";

describe("MCP failure presentation", () => {
  it("maps every stable failure kind to a localized message id", () => {
    expect(resolveMcpFailureMessageId("server_not_found")).toBe(
      "settings.mcp.failure.server_not_found",
    );
    expect(resolveMcpFailureMessageId("official_origin_untrusted")).toBe(
      "settings.mcp.failure.official_origin_untrusted",
    );
    expect(resolveMcpFailureMessageId(undefined)).toBe("settings.mcp.failure.connection_failed");
    expect(resolveMcpFailureMessageId("not_authenticated")).toBe(
      "settings.mcp.failure.not_authenticated",
    );
    expect(resolveMcpFailureMessageId("coding_plan_required")).toBe(
      "settings.mcp.failure.coding_plan_required",
    );
  });

  it.each([
    ["zh-CN" as const, "MCP 服务暂时不可用，请稍后重试。"],
    ["en-US" as const, "The MCP service is temporarily unavailable. Try again later."],
  ])("keeps diagnostics inside the click-only popover for %s", (locale, message) => {
    const html = renderToStaticMarkup(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: locale },
        createElement(McpFailurePresentation, {
          error: "raw sdk error",
          failureKind: "server_unavailable",
        }),
      ),
    );

    expect(html).toContain(message);
    expect(html).toContain('data-slot="popover-trigger"');
    expect(html).not.toContain("req-1000");
    expect(html).not.toContain("Request ID");
    expect(html).not.toContain("请求 ID");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("text-destructive");
    expect(html).toContain("text-foreground-subtle");
    expect(html).not.toContain("raw sdk error");
  });

  it.each([
    // fork 无账号登录链路，not_authenticated 展示通用鉴权失败文案。
    ["zh-CN" as const, "MCP 服务端要求身份验证，当前请求未通过。"],
    [
      "en-US" as const,
      "The MCP server requires authentication and the current request was not accepted.",
    ],
  ])("localizes the not-authenticated diagnosis for %s", (locale, message) => {
    const html = renderToStaticMarkup(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: locale },
        createElement(McpFailurePresentation, { failureKind: "not_authenticated" }),
      ),
    );
    expect(html).toContain(message);
  });

  it.each([
    // fork 无 Coding Plan 购买链路，coding_plan_required 展示通用权限拒绝文案。
    ["zh-CN" as const, "MCP 服务端拒绝了当前访问权限，请检查该服务的可用性。"],
    [
      "en-US" as const,
      "The MCP server denied the current access. Check the availability of this service.",
    ],
  ])("localizes the coding-plan diagnosis for %s", (locale, message) => {
    const html = renderToStaticMarkup(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: locale },
        createElement(McpFailurePresentation, { failureKind: "coding_plan_required" }),
      ),
    );
    expect(html).toContain(message);
  });
});
