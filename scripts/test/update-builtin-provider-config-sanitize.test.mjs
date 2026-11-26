import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeZCodeBuiltinProviderConfig } from "../update-builtin-provider-config.mjs";

// 回归依据（REMOVALS §十三 2026-11-26 二次拍板）：Built-in Provider 配置唯一刷新路径是
// 编译打包期的 update-builtin-provider-config.mjs（运行时接线已拆除）。该脚本的
// 去平台化清洗是剔除域防线：平台网关模板 / 账号型规则 / 已下线平台管理外链必须被剥掉，
// 第三方厂商外链保留，且级联清理不得误删存活模板的模型规则。
const release = () => ({
  schemaVersion: 1,
  revision: 49,
  config: {
    providerConfigRules: {
      templateRules: [
        {
          templateId: "zcode-plan",
          templateNameMap: { "zh-CN": "套餐网关" },
          config: {
            access: { type: "zcode-plan" },
            api: { type: "anthropic-messages", baseUrl: "https://zcode.z.ai/api/anthropic" },
          },
        },
        {
          templateId: "zai-api",
          templateNameMap: { "zh-CN": "Z.ai" },
          config: {
            access: {
              type: "zhipu-coding-plan-api-key",
              apiKeyManagementUrl: "https://z.ai/manage-apikey/apikey-list",
            },
            api: { type: "anthropic-messages", baseUrl: "https://api.z.ai/api/anthropic" },
          },
        },
        {
          templateId: "bigmodel-api",
          templateNameMap: { "zh-CN": "BigModel" },
          config: {
            access: {
              type: "api-key",
              apiKeyManagementUrl: "https://open.bigmodel.cn/coding-plan/personal/overview",
            },
            api: {
              type: "openai-chat-completions",
              baseUrl: "https://open.bigmodel.cn/api/paas/v4",
            },
          },
        },
        {
          templateId: "kimi-api",
          templateNameMap: { "zh-CN": "Kimi" },
          config: {
            access: {
              type: "api-key",
              apiKeyManagementUrl: "https://platform.kimi.com/console/api-keys",
            },
            api: { type: "openai-chat-completions", baseUrl: "https://api.kimi.com" },
          },
        },
        {
          templateId: "legacy-account",
          templateNameMap: { "zh-CN": "账号型" },
          config: {
            access: { type: "zhipu-account" },
            api: { type: "anthropic-messages", baseUrl: "https://api.example.test" },
          },
        },
      ],
      providerRules: [
        {
          providerId: "builtin:legacy-account",
          config: { access: { type: "zhipu-account" }, group: "zai-family" },
        },
      ],
    },
    modelConfigRules: {
      modelRules: [{ modelMatch: ".*", config: { enabled: true, properties: {} } }],
      modelApiRules: [],
      providerSiteRules: [
        {
          modelMatch: ".*",
          apiTypeMatch: ".*",
          baseUrlMatch: "zcode\\.z\\.ai",
          config: { enabled: true, properties: {} },
        },
        {
          modelMatch: ".*",
          apiTypeMatch: ".*",
          baseUrlMatch: "api\\.z\\.ai",
          config: { enabled: true, properties: {} },
        },
      ],
      templateModelRules: [
        { templateId: "zai-api", modelId: "glm-5.4", config: { enabled: true, properties: {} } },
        {
          templateId: "legacy-account",
          modelId: "glm-5.4",
          config: { enabled: true, properties: {} },
        },
      ],
      builtinProviderModelRules: [
        {
          providerId: "builtin:legacy-account",
          modelId: "glm-5.4",
          config: { enabled: true, properties: {} },
        },
      ],
    },
  },
});

test("sanitize strips retired gateway templates, account access rules and retired management links", () => {
  const { config, removed } = sanitizeZCodeBuiltinProviderConfig(release());
  const templateIds = config.config.providerConfigRules.templateRules.map((r) => r.templateId);
  // zcode.z.ai 网关模板与 zhipu-account 账号型模板整条删除
  assert.deepEqual(templateIds, ["zai-api", "bigmodel-api", "kimi-api"]);
  assert.ok(removed.templates.includes("zcode-plan"));
  assert.ok(removed.templates.includes("legacy-account"));
  // providerRules 的账号型规则删除
  assert.deepEqual(config.config.providerConfigRules.providerRules, []);
  // z.ai / bigmodel.cn 管理外链剥离；第三方（kimi）保留
  const accessById = new Map(
    config.config.providerConfigRules.templateRules.map((r) => [r.templateId, r.config.access]),
  );
  assert.equal(accessById.get("zai-api").apiKeyManagementUrl, undefined);
  assert.equal(accessById.get("bigmodel-api").apiKeyManagementUrl, undefined);
  assert.equal(
    accessById.get("kimi-api").apiKeyManagementUrl,
    "https://platform.kimi.com/console/api-keys",
  );
  // zcode.z.ai 命中的 providerSiteRules 删除，api.z.ai 保留（API-key 供应商域）
  assert.equal(config.config.modelConfigRules.providerSiteRules.length, 1);
  // 级联清理只删已死模板/Provider 的模型规则，存活模板的保留
  assert.deepEqual(
    config.config.modelConfigRules.templateModelRules.map((r) => r.templateId),
    ["zai-api"],
  );
  assert.deepEqual(config.config.modelConfigRules.builtinProviderModelRules, []);
  // revision / schemaVersion 不动
  assert.equal(config.revision, 49);
  assert.equal(config.schemaVersion, 1);
});
