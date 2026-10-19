import { describe, expect, it } from "vitest";
import localDefaultAppConfig from "../../../config/default.json" with { type: "json" };
import { resolveWebCommunityUrl, resolveWebHelpConfig } from "../src/communityUrl.js";

// 去平台化后帮助入口只读仓库内置 config/default.json，不再有启动期远端请求
// （原 /api/v1/client/configs 拉取链路已删除），因此这里只验证本地同步解析。
const sanitized = (value: string | undefined): string | undefined =>
  value && value.trim() !== "" ? value : undefined;

describe("Web 帮助入口（本地内置配置）", () => {
  it("resolveWebHelpConfig 同步返回内置 default.json", () => {
    const config = resolveWebHelpConfig();
    expect(config.community_urls["en-US"]).toBe(
      sanitized(localDefaultAppConfig.community_urls["en-US"]),
    );
    // 内置值为空串时按缺省处理（sanitize 为 undefined）。
    expect(config.community_urls["zh-CN"]).toBe(
      sanitized(localDefaultAppConfig.community_urls["zh-CN"]),
    );
    expect(config.feedback_url).toBe(sanitized(localDefaultAppConfig.feedback_url));
  });

  it("resolveWebCommunityUrl 同步取内置同语言入口", () => {
    expect(resolveWebCommunityUrl("en-US")).toBe(
      sanitized(localDefaultAppConfig.community_urls["en-US"]),
    );
    expect(resolveWebCommunityUrl("zh-CN")).toBe(
      sanitized(localDefaultAppConfig.community_urls["zh-CN"]),
    );
  });
});
