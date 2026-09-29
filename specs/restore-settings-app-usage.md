# 恢复设置页「应用统计」(App Usage)面板

## 背景

`3c58a21` 移除平台账号与遥测时,把设置页「使用统计」分区连同 Coding Plan 用量面板一起删除。其中 App Usage 面板是纯本地统计(数据源为 agent 全局 session 库的 model_usage / turn_usage / tool_usage 表),不涉及任何网络调用,按用户要求恢复;Coding Plan 用量、entitlement、配额重置等联网链路不恢复。

## 产品规则

- 设置页侧栏恢复 `usage` 分区(图标 BarChart3,标题 `settings.usageTitle`,分组 `dataAndStats`),内容为 App Usage 面板单面板,无 tab 分发层(原 `UsageStatsSection` 的 codingPlan tab 不恢复)。
- 面板内容:终身摘要条(总 token / 峰值 / 最长会话 / 当前连续 / 最长连续)、52 周热力图(daily / weekly / cumulative 三模式)、7d / 30d 范围下的每日模型趋势折线图与模型用量饼图、刷新按钮、加载 / 空态 / 错误态。
- 数据仅来自本地 agent 数据库,整条链路无网络请求:协议请求经 stdio 发给本机 agent 进程(远程 workspace 场景发给该远端自己的 agent,同样不经过智谱平台)。
- 折线图 / 饼图(Recharts)保持 lazy 加载并包在 `UsageChartLoadBoundary` 内:Recharts 初始化触发 decimal.js-light LN10 校验,在 Electron Linux 会阻断 renderer 启动。

## 状态所有者与接口

- 事实源:agent 进程的 usage store(`queryAppUsage`),只读聚合;桌面 UI 不持有任何统计状态,快照按需拉取。
- 数据链(全部幸存,仅恢复 UI 层):
  `useAppUsageStats(range)` → `useServices().zcodeAgentService.getAppUsageStats({ range, timeZone })` → ZCode Protocol `v4/usage/stats`(结果 schema `v4UsageStatsResultSchema = appUsageSnapshotSchema`)→ CLI `getUsageStats` → `usageStore.queryAppUsage()`。
- 不重建 `IUsageStatsService` 服务面:原 `getAppUsageSnapshot` 是对 `zcodeAgentService.getAppUsageStats` 的纯透传(其余 7 个方法全是 Coding Plan 链),重建需 5 处通道 / 注册接线且无逻辑。UI 经 hooks 直接消费 `zcodeAgentService`(通道 `ServiceChannels.ZCodeAgent` 存活且已代理),符合「组件通过 `packages/ui/src/hooks/` 访问服务」的边界。
- hook 签名:`useAppUsageStats(range: AppUsageRange)` → `{ snapshot: AppUsageSnapshot | null, loading, error, refresh }`;带请求版本号防竞态。`AppUsagePanel` 内两次调用(一次 `"all"` 终身摘要、一次当前 range)。

## 不变量

- App Usage 数据链不发起任何 HTTP/API 请求;不引入 `apiClient`、账号鉴权或 credential 依赖。
- 不恢复任何 Coding Plan / entitlement / quota 类型、服务、组件与 i18n key;`packages/shared/src/usage-stats.ts` 保持当前纯 App Usage 形状不动。
- 无活跃 workspace 连接时 `getAppUsageStats` 抛 `no_active_workspace`,面板显示错误态,不加兜底重试或静默降级(保持原有行为)。
- 幸存共享物不重复引入:`appUsageChartPalette.ts`、`styles.css` 的 `--color-usage-chart-1..6` / `--color-usage-heatmap-0..4`、`components/ui/chart.tsx`、`lib/tokenNumberFormat.ts`。

## 验收场景

1. 设置 → 使用统计:面板显示本地统计(热力图、趋势图、饼图、终身摘要),与 `~/.zxcode` 本地库数据一致。
2. 7d / 30d 范围切换:图表与摘要联动刷新。
3. 空库(全新环境):显示空态,不报错。
4. 无活跃 workspace(启动后面板无连接可复用):显示错误态与刷新入口。
5. 刷新按钮:重新拉取快照,请求版本号防竞态(快速切换范围不串台)。
6. 抓包 / 代码审计:面板打开与刷新不产生任何对外网络请求。
