import type { Locale } from "@zcode/shared";
import localDefaultAppConfig from "../../../config/default.json" with { type: "json" };

/**
 * 帮助入口（社区/反馈）配置。去平台化后只读仓库内置 config/default.json，
 * 不再有任何启动期远端请求（原 zcode.z.ai /api/v1/client/configs 拉取链路已删除）。
 */
interface WebHelpConfig {
  community_urls: Partial<Record<Locale, string>>;
  feedback_url?: string;
}

function sanitizeUrl(value: string): string | undefined {
  return value.trim() !== "" ? value : undefined;
}

const localHelpConfig: WebHelpConfig = {
  community_urls: {
    "zh-CN": sanitizeUrl(localDefaultAppConfig.community_urls["zh-CN"]),
    "en-US": sanitizeUrl(localDefaultAppConfig.community_urls["en-US"]),
  },
  feedback_url: sanitizeUrl(localDefaultAppConfig.feedback_url),
};

export function resolveWebHelpConfig(): WebHelpConfig {
  return localHelpConfig;
}

export function resolveWebCommunityUrl(locale: Locale): string | undefined {
  return localHelpConfig.community_urls[locale];
}
