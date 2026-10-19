import { describe, expect, it } from "vitest";
import {
  ApiKeyAccessConfig,
  ProviderApiConfig,
  ProviderConfig,
  ProviderConfigMap,
  parsePersonalProviderConfigMap,
  parseProviderConfig,
  parseProviderConfigMap,
} from "../src/index.js";

describe("ProviderConfig access / api boundaries", () => {
  it("把访问资格与 API 协议解析成两个独立的 Config Overlay", () => {
    const config = parseProviderConfig({
      access: { type: "api-key", apiKey: "secret" },
      api: {
        type: "anthropic-messages",
        baseUrl: "https://api.example.com",
      },
      builtinModelIds: ["model-a"],
    });

    expect(config.access).toBeInstanceOf(ApiKeyAccessConfig);
    expect(config.api).toBeInstanceOf(ProviderApiConfig);
    expect(config.toJSON()).toEqual({
      access: { type: "api-key", apiKey: "secret" },
      api: {
        type: "anthropic-messages",
        baseUrl: "https://api.example.com",
      },
      builtinModelIds: ["model-a"],
    });
  });

  it("递归 Overlay Provider、Access 与 API 字段", () => {
    const zcodeBuiltin = new ProviderConfig({
      group: "standard-personal",
      logo: { type: "builtin", key: "deepseek" },
      access: new ApiKeyAccessConfig({
        apiKeyManagementUrl: "https://platform.deepseek.com/api_keys",
      }),
      api: new ProviderApiConfig({
        type: "anthropic-messages",
        baseUrl: "https://api.deepseek.com/anthropic",
      }),
      builtinModelIds: ["deepseek-v4"],
    });
    const personal = new ProviderConfig({
      access: new ApiKeyAccessConfig({ apiKey: "sk-personal" }),
      api: new ProviderApiConfig({ headers: { "X-Team": "agent" } }),
    });

    const effective = zcodeBuiltin.overlay(personal);

    // 名称由规则外层 overlay 测试覆盖；此处只验证执行配置。
    expect(effective.logo).toEqual({ type: "builtin", key: "deepseek" });

    expect(zcodeBuiltin.overlay(new ProviderConfig({ logo: null })).logo).toBeNull();
    expect(effective.access).toMatchObject({
      type: "api-key",
      apiKey: "sk-personal",
      apiKeyManagementUrl: "https://platform.deepseek.com/api_keys",
    });
    expect(effective.api).toMatchObject({
      type: "anthropic-messages",
      baseUrl: "https://api.deepseek.com/anthropic",
      headers: { "X-Team": "agent" },
    });
    expect(effective.validateComplete()).toEqual([]);
  });

  it("接受开放的 Built-in Logo key，拒绝未知 Logo 类型", () => {
    expect(
      parseProviderConfig({ logo: { type: "builtin", key: "future-provider-logo" } }).toJSON(),
    ).toEqual({ logo: { type: "builtin", key: "future-provider-logo" } });
    expect(() =>
      parseProviderConfig({ logo: { type: "url", url: "https://example.com/logo.svg" } }),
    ).toThrow();
  });

  it("Provider Config 不接受关闭 Usage 的执行开关", () => {
    expect(() =>
      parseProviderConfig({
        access: { type: "api-key", apiKey: "test-key" },
        includeUsage: false,
      }),
    ).toThrow();
  });

  it("visibility 遵循 Provider Overlay 顺序并默认可见", () => {
    const builtIn = new ProviderConfig({ visibility: "hidden" });

    expect(new ProviderConfig().visibility).toBeUndefined();
    expect(builtIn.overlay(new ProviderConfig()).visibility).toBe("hidden");
    expect(builtIn.overlay(new ProviderConfig({ visibility: "visible" })).visibility).toBe(
      "visible",
    );
  });

  it("API Key Access 必须在最终 Overlay 后取得 API Key", () => {
    const incomplete = new ProviderConfig({
      group: "standard-personal",
      access: new ApiKeyAccessConfig(),
      api: new ProviderApiConfig({
        type: "openai-chat-completions",
        baseUrl: "https://api.example.com/v1",
      }),
      builtinModelIds: ["model-a"],
    });

    expect(incomplete.validateComplete(["providers", "api"])).toContainEqual({
      code: "required-field-missing",
      path: ["providers", "api", "access", "apiKey"],
      message: "缺少必填配置 providers.api.access.apiKey",
    });
  });

  it("Personal Provider 允许暂存非法 endpoint，并在完整性校验时 fail-closed", () => {
    const providers = parsePersonalProviderConfigMap({
      providerRules: [
        {
          providerId: "broken",
          config: {
            group: "standard-personal",
            access: { type: "api-key", apiKey: "test-key" },
            api: { type: "openai-chat-completions", baseUrl: "testtest" },
            personalModelIds: ["model-a"],
          },
        },
      ],
    });

    expect(providers.get("broken")?.api?.baseUrl).toBe("testtest");
    expect(providers.get("broken")?.validateComplete(["providers", "broken"])).toContainEqual({
      code: "invalid-url",
      path: ["providers", "broken", "api", "baseUrl"],
      message: "配置 providers.broken.api.baseUrl 必须是有效 URL",
    });
  });

  it("正式 Access Schema 拒绝 execution-provided 与伪通用协议字段", () => {
    expect(() => parseProviderConfig({ access: { type: "execution-provided" } })).toThrow();
    for (const field of ["planKind", "challenge", "requestSigning", "executionProtocol"]) {
      expect(() =>
        parseProviderConfig({
          access: {
            type: "zhipu-account",
            accountType: "zai",
            mode: "start-plan",
            [field]: "legacy",
          },
        }),
      ).toThrow();
    }
    expect(() =>
      parseProviderConfig({
        access: { type: "api-key", apiKey: "secret", requestSigning: "zcode-v4" },
      }),
    ).toThrow();
  });
});
