import { describe, expect, it } from "vitest";
import {
  parseAccountProviderConfigMap,
  parsePersonalModelConfigRules,
  parsePersonalProviderConfigMap,
  parseZCodeBuiltinProviderConfigMap,
} from "../src/index.js";

describe("Todo 21 source contracts", () => {
  it("ZCode Built-in Provider 只接受家族分组 Provider", () => {
    // fork：zhipu-account Access 已下线，Built-in Provider 以 api-key 形态声明访问材料。
    const providers = parseZCodeBuiltinProviderConfigMap([
      {
        providerId: "builtin",
        config: {
          group: "zai-family",
          visibility: "visible",
          access: { type: "api-key", apiKey: "test-only" },
          api: { type: "anthropic-messages", baseUrl: "https://example.com" },
          builtinModelIds: ["model-a"],
        },
      },
    ]);

    expect(providers.get("builtin")?.group).toBe("zai-family");
    expect(() =>
      parseZCodeBuiltinProviderConfigMap([
        {
          providerId: "invalid",
          config: { group: "standard-personal", personalModelIds: ["model-a"] },
        },
      ]),
    ).toThrow();
    expect(() =>
      parseZCodeBuiltinProviderConfigMap([
        { providerId: "invalid", config: { access: { type: "api-key" } } },
      ]),
    ).toThrow();
  });

  it("Account Provider 只能投影账号约束字段", () => {
    // fork：账号 Overlay 仅余 builtinModelIds 历史字段面，不再携带 access。
    const providers = parseAccountProviderConfigMap({
      account: { builtinModelIds: ["model-a"] },
    });
    expect(providers.get("account")?.builtinModelIds).toEqual(["model-a"]);
    expect(() =>
      parseAccountProviderConfigMap({
        account: { access: { type: "zhipu-account", entitled: true } },
      }),
    ).toThrow();
    expect(() => parseAccountProviderConfigMap({ account: { label: "Account" } })).toThrow();
    expect(() => parseAccountProviderConfigMap({ account: { group: "zai-family" } })).toThrow();
  });

  it("Personal Provider 不能写 builtinModelIds，根 group 只能是 standard-personal", () => {
    const providers = parsePersonalProviderConfigMap({
      providerRules: [
        {
          providerId: "personal",
          config: {
            group: "standard-personal",
            personalModelIds: ["model-a"],
            modelOrder: ["model-a"],
          },
        },
        { providerId: "overlay", providerName: "Overlay", config: {} },
      ],
    });
    expect(providers.get("personal")?.modelOrder).toEqual(["model-a"]);
    expect(() =>
      parsePersonalProviderConfigMap({
        providerRules: [{ providerId: "personal", config: { builtinModelIds: ["model-a"] } }],
      }),
    ).toThrow();
    expect(() =>
      parsePersonalProviderConfigMap({
        providerRules: [{ providerId: "personal", config: { group: "standard-builtin" } }],
      }),
    ).toThrow();
    // fork：“固定 Account Provider 的 Access 只能由 Built-in 声明”守卫已随账号型 Provider 下线。
  });

  it("Personal Provider 缺失 access 时保持不完整，不从 group 推断 Access", () => {
    const providers = parsePersonalProviderConfigMap({
      providerRules: [
        { providerId: "personal", config: { group: "standard-personal" } },
        { providerId: "overlay", providerName: "Overlay", config: {} },
      ],
    });

    expect(providers.get("personal")?.access).toBeUndefined();
    expect(providers.get("overlay")?.access).toBeUndefined();
  });

  it("Model 没有 visibility", () => {
    expect(() =>
      parsePersonalModelConfigRules([
        {
          type: "provider-model",
          providerId: "provider-a",
          modelId: "model-a",
          config: { visibility: "hidden" },
        },
      ]),
    ).toThrow();
  });
});
