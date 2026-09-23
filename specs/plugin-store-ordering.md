# 插件商店排序

## 产品规则

- 插件列表排序为**本地默认排序**，不存在任何远端排序配置通道。原 `GET /api/v1/client/configs` 下发的 `pluginStoreOrder`（code/work 双模式 categoryOrder/pluginOrder）通道已整体拆除：客户端不再发起该请求，不再解析该字段。
- 分类区块顺序：产品默认序 `productivity → developer-tools → utilities → finance → legal → template`，无分类归 `other` 沉底（`PLUGIN_STORE_CATEGORY_ORDER` / `FALLBACK_PLUGIN_STORE_CATEGORY`）。
- 类内插件顺序：官方文档插件（pdf / presentations / spreadsheets / documents@官方市场）优先，其余按本地化显示名稳定排序，同名保持目录原序。
- Featured（精选）来自官方 CDN 目录的 `featured` 字段，与本排序无关（见 CONTEXT.md）。
- @ 插件提及候选保持引用目录（catalog）自身顺序，不再按模式重排或把公开市场条目前置。
- 工作区插件预览面板的公开市场条目仍走上述本地默认排序，个人来源条目追加其后。

## 状态所有者与接口

- 排序实现唯一入口：`@zcode/shared` 的 `sortPluginStoreEntries`（纯函数）及其常量；UI 侧 `pluginStoreListing.ts` 的 `groupItemsByCategory` / `selectFeaturedItems` 组装投影，不持有第二份排序状态。
- 已删除：`IClientConfigService`（`packages/services/src/client-config/`）、shared 的 `clientConfig.ts` / `pluginStoreOrder.ts` 解析、shared `ServiceChannels.ClientConfig` 频道、UI `usePluginStoreOrder` hook，以及 host 装配 / accessor / 远程 ProxyChannel / `remoteWorkspaceServiceCollection` 注入。
- 插件商店页顶栏「手动刷新」只刷新市场目录（`updateMarketplace`），不再触发任何排序配置重取。

## 不变量

- 排序是纯展示行为：不得影响插件安装、启停、更新、卸载或引用解析。
- `sortPluginStoreEntries` 的排序键在市场与引用 Picker 之间保持一致（同一函数，不各写一份）。
- 全仓库不得残留对 `/api/v1/client/configs` 的客户端调用或 `pluginStoreOrder` 解析（构建产物 dist 除外）。

## 验收场景

1. 打开设置 → 插件商店页（公开分段）：分类区块按默认序排列，`other` 沉底，类内文档插件在前；无网络请求发往 `client/configs`。
2. 切换办公模式 / 普通模式：列表顺序不变（不再存在双模式远端排序）。
3. 输入框 `@` 唤起插件提及面板：候选顺序与引用目录一致，无配置请求。
4. 工作区插件预览面板：公开市场条目按默认排序，个人来源条目追加其后。
5. 商店页顶栏手动刷新：仅刷新市场目录与更新角标，不产生配置请求。
