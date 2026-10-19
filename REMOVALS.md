# 移除项清单：智谱登录、遥测与指纹

本仓库在开源代码基础上移除了与智谱（Z.ai / BigModel 平台，`zcode.z.ai`）相关的账号登录、遥测上报和设备指纹信息，以及插件商店的在线链路，主要改动见提交 `3c58a21` 与 `7b5ce75`。本文只列删除项；当前保留的能力与对外请求说明见 [README.md](README.md) 和 [NOTICE.md](NOTICE.md)。

## 一、平台账号登录

- Z.ai / BigModel OAuth 登录（`bigmodel-oauth.ts`、`browser.ts`）
- Web 端 OAuth 登录页与回调（`packages/web/src/auth/`）
- CLI 设备码（device flow）登录：`login` 命令、登录轮询与中止、TUI 登录态（`cli-oauth.ts`、`login-command.ts`、`auth-login*.ts`、`login-flow.ts`、`tui-auth.ts`、`tui-login-state.ts`）
- zhipu-account Provider 账号鉴权运行时（`standalone-account-provider-runtime.ts`）
- 启动登录门控：桌面端不再要求登录，直接进入工作台
- Coding Plan 嵌入式购买 / 升级 Webview 及登录恢复流程

## 二、zcode.z.ai 平台运行时调用

- 客户端配置与场景（client scenes）在线拉取（含下发的自动化模板目录）
- 单功能灰度下发（`singleFeatureRollout.ts`、`desktopContextPromptRollout.ts`）
- 官方 Coding Plan 网关改写（`official-coding-plan-gateway.ts`）
- 用量 / 订阅：Coding Plan 用量图表、Start Plan 余额与配额卡片、配额重置 store、套餐商品拉取
- 本地应用使用统计设置分区：App Usage 面板、热力图 / 趋势图与 `usageStats` 聚合服务
- 会话分享：分享确认 / 选择面板、分享附件服务、分享预检指纹、Web 端落地页与预览（`packages/web/src/share/`）
- 反馈工单、飞书反馈表单与社区链接跳转
- 闲时任务（off-peak）：工具、协议端口、失败重试策略与全部设置界面
- 插件商店官方市场在线自动刷新（`officialMarketplaceAutoRefresh.ts`），目录改为构建期内置离线清单
- 官方 MCP 凭据下发
- 端点工具函数死链（v3.14.3 同步审计确认零调用方后清理）：`buildRuntimeZCodeEndpointUrls`、`buildRuntimeZCodeApiUrl`、`buildBigModelApiUrl`、`buildZCodeEndpointUrls` 与 `ZCodeEndpointUrls` 接口；保留环境变量解析、provider 遗留配置导入与 `rewriteZCodeEndpointUrl` 等存活链路

## 三、自动更新链路

- `electron-updater` 依赖与 `autoUpdater.ts`
- 强更门控与提示（`forceUpdateGuard.ts`、`forceUpdatePrompt.ts`）、清单更新提供器
- 更新 IPC、更新状态窗口与设置项

## 四、遥测上报

- `/event/report` 通用事件上报端点与投递链路
- ARMS RUM：`@arms/rum-electron` 及其 patch、卫星模块与崩溃捕获；渲染进程会话遥测、用户行为轨迹、TTFT 统计
- CLI OTLP：`@zcode/telemetry` 整包（OTLP 导出器、Agent 追踪、模型 API 记录）及遥测契约
- 桌面 OTLP 导出链：资源、网络、稳定性、数据量、启动、数据库启动、MCP、会话创建等遥测源

## 五、指纹与设备标识上报

- `deviceMid` 上报：不再作为 ARMS `user.name` 上报（原 `armsUserIdentity.ts`）
- 崩溃指纹（`error_fingerprint`）上报链
- 会话分享预检指纹（`capabilitiesFingerprint` / `turnFingerprint`）

## 六、依赖与第三方声明

- 移除依赖：`@arms/rum-electron`、`electron-updater`、OpenTelemetry API 与 OTLP 导出器
- 重新生成 `THIRD-PARTY-NOTICES.md` 与第三方清单，移除上述组件的声明条目

## 七、插件商店后续清理

- 远端排序下发（`client/configs`、`pluginStoreOrder`），改为本地默认排序（`dd04568`）
- 14 个官方插件下线，移除资源与清单条目（`5879dd4`）：assess-credit、finance-search、find-clients、hexin、model-deals、pick-funds、read-macro、run-fpa、tianyancha、vet-companies、video-agent-kit、watch-positions、wind、write-research

## 八、v3.15.1 同步剔除（上游新增的已删域复活内容）

- 账号请求安全子系统：`apps/zcode-cli/packages/adapters` 的 `request-security(-edition)`、`account-request-retry`；`packages/shared/src/request-security-edition/`；desktop main 与 UI 侧同名 no-op 壳；`@zcode/telemetry` 包残留骨架（`request-observation-target` 等）与全部测试。runner 三件套（generate/stream/execution）中的账号重试与请求验证接线同步剥离
- zhipu-account Provider 规则：`config/provider/zxcode-builtin.json` 上游侧新增的 `account:zai-*`（个人/团队 Coding Plan、Start Plan、highspeed 卡）provider 规则不合入，仅保留 API key 模板
- 营销触达与奖励中心：`packages/services/src/marketing-touch/`、`packages/services/src/cloud-content/`、`packages/shared/src/{marketingTouch,rewardsBridge,rewardsEmbedded,cloudContent}.ts`、UI 侧 `components/marketing-touch/`、`rewards/`、`manual-claim-plan/`、`cloud-content-dialog/`、`global-notice/`、`sidebar-activity/`、营销导航 store 与相关 i18n key
- 高速卡（highspeed）营销分享面：分享卡（`HighspeedShareNoticeCard`）、到期自动分享链路、分享对话框与引流文案；加速执行与视觉反馈层保留为休眠态（fork 无账号 provider，永不激活）
- 会话分享 Web 落地：`packages/web-share/`、`packages/share-ui/`、`packages/web/src/share/` 页面与路由、`conversationShareInlineImages`
- Web 登录页：`packages/web/src/auth/`（WebLoginPage/WebCallbackPage/WebLoggedInWaitingPage、webAuthService、oauthStateCodec）
- 反馈工单 UI 残件：`packages/ui/src/feedback/` 剩余视图与 `useFeedbackStore` 接线、Windows 标题栏菜单组件（仅剩反馈/更新入口，fork 无消费方）
- 自动更新残留：`platformUpdate.ts`、`PostUpdateReleaseNotesDialog`、`desktopUpdateMenu`、web `remoteFrontendVersion.mjs`
- Coding Plan 购买支付：`@stripe/*` 依赖、`CodingPlanBillingDiscount`、share-ui 内嵌购买页
- 平台端点运行时白名单新增：`packages/shared/test/pluginMarketplaces.test.ts`（插件市场 CDN `cdn-zcode.z.ai` 保留项的来源 fixture）

## 保留说明

- 模型推理仍可通过 API key 形式的 Provider 接入 Z.ai / BigModel（coding-plan 与标准 key），以及其他 OpenAI / Anthropic 兼容提供商。
- 桌面端本地仍会生成一个随机 `deviceMid`（存于 `~/.zxcode/v2/telemetry-state.json`），仅用作本地流式连接与手机 Relay 的连接标识，不会发送到智谱或任何遥测服务器。
- 模型请求仍会按所配提供商的协议要求附带认证与会话标识，具体见 [NOTICE.md](NOTICE.md) 的对外请求说明。
- v3.15.1 起 `packages/shared/src/zcodeEndpoint.ts` 恢复 `buildZCodeEndpointUrls` 裁剪版（仅 origin/apiBaseUrl/remoteUrl，供 web 远控前端 v3/v4 版本门槛使用）并新增 `resolveWebRemoteControlRelayWsUrl`（默认官方 relay 地址，自部署 relay 经设置覆盖）；上游 webRemoteControl manager 与 fork 自部署 `mobileRelayClient` 并存，互不替代。
- 上游 v3.15.1 的 UI 插件、插件 UI 沙箱（`zcodePluginSandbox` preload 命名空间）、内联 Gen UI、vitest 测试体系为保留能力。
