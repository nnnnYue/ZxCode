import type { ProviderSettingsFormProvider } from "@/lib/providerSettingsFormTypes.js";

// 账号型 preset 组、Coding Plan 导航变体与套餐显示名已随去平台化删除；
// 添加提供商统一走模板选择器（zhipu 分组保留，api-key 模板不动）。

export type ModelProviderNavItem = {
  key: string;
  type: "custom";
  label: string;
  provider: ProviderSettingsFormProvider;
  statusActive: boolean;
};

export type ModelProviderNavGroupId = "custom";

export interface ModelProviderNavGroup {
  id: ModelProviderNavGroupId;
  title: string;
  items: ModelProviderNavItem[];
}
