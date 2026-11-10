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
- 自动更新残留：`platformUpdate.ts`、`PostUpdateReleaseNotesDialog`、`desktopUpdateMenu`（web `remoteFrontendVersion.mjs` 保留：该文件是 `packages/web/vite.config.ts` 构建期解析 `__ZCODE_VERSION__` 的唯一依赖，删除后 web 构建直接报 `UNRESOLVED_IMPORT`；其中与自动更新无关的版本比较函数仍无消费方）
- Coding Plan 购买支付：`@stripe/*` 依赖、`CodingPlanBillingDiscount`、share-ui 内嵌购买页
- 平台端点运行时白名单新增：`packages/shared/test/pluginMarketplaces.test.ts`（插件市场 CDN `cdn-zcode.z.ai` 保留项的来源 fixture）

## 九、v3.16.2 同步剔除（随桌面 fork 基线恢复补齐）

- 桌面 fork 基线 removes：删除 fork 基线（3.15.1-ce.1，`23dae928`）不存在的 43 个上游新增 src 文件（Source Server 连接管理、database-startup、botRemoteWorkspaceResolver 等），desktop test/scripts/package.json 与根级构建配置一并恢复基线；上游改名残留的 e2e 用例清理
- 回潜清扫：上游复活的 6 个剔除域测试/helper 文件删除（electron-updater mock、`/event/report` 断言、ARMS patch bootstrap 测试、`zcode.z.ai` e2e helper 等），services/ui 两个被上游覆盖的基线测试恢复 fork 内容；`scripts/check-no-zai-runtime-endpoints.mjs` 归零
- 协议域残留：runtime headers 请求参数 schema（账号请求安全域）已随 `7b02617d` 剔除，对应的 4+1 个悬挂测试用例移除
- off-peak 休眠层遗留：上游协议整体合入带回 off-peak 休眠面（shared 协议 schema、共享迁移创建的 `off_peak_tasks` 表与 `tasks.off_peak_task_id` 列、`packages/services/src/session/offPeakResidentExecutions.ts` 等）。fork 无激活路径（桌面 Host 不下发 `offPeakToolEnabled`，工具簇不注册，UI 设置面不存在）；DB 层彻底剔除涉及共享迁移改造与基线 SQL 再生，需独立专项处理，`check-sqlite-schema.ts` 已排除未合入的 `OffPeakTaskRepo`

## 十、v3.17.2 同步剔除与补齐定案（2026-11-07，五阶段补齐工程后最终定案）

v3.17.2 合并（`11e88869`）沿用「协议/服务引擎层采纳、desktop main / ui / cli 整域保 fork 基线」策略，随后五阶段补齐工程（Phase 1–5，`4aa059db`…`11c5556f`）把非剔除域可视功能合并进 fork。本节为最终定案，全部不再跟进：

### 持续剔除域（上游新增部分一并拒入）

- 会话分享 UI 全套（ConversationShare* 7 组件 + conversationShare* 9 helper + popover 模块）、Coding Plan/Start Plan 配额桶横幅与提醒 store、余额/用量面板、模型菜单套餐徽标、OffPeak 新任务入口与回合卡、Client Scenes 服务端推荐、会话遥测域（v4/telemetry ARMS 面）、自动更新新脚本（windows-update-publisher、macos-update-manifest 等）、highspeed 查看/分享按钮、营销/推荐 hooks（上游数据源 `clientConfigService.uiPluginRecommendations`，fork 无 clientConfig 域）
- Sites「部署」侧栏入口：依赖整个 `zcode-site-plugin` CLI 域（42 文件）与 ZCode Sites 云服务，连带上游 plugin-ui 的 Sites 接线 hunk 一并拒入
- 数据同步设置面 + 远程设备管理（source-server 域 19 文件与 2371 行连接向导编排）：`remoteProjectService` 为本地持久化实现（readDirectory 读组织库，空库返回空目录），远程项目 UI 路径按 stub 降级；fork 保留旧版 Remote\*SyncDialog 与自建 relay 承担远程故事
- CLI session-data 执行面（`bootstrap/src/zcode-protocol/session-data/` + `adapters/src/storage/session-data-files/`）：项目管理页「同时删除 ZxCode 数据」的 measure/purge 在 Host→CLI 请求处失败并按 failed 计数优雅降级，项目删除本体不受影响
- 上游 openFeedback 反馈入口按钮：fork 反馈工单域已删、desktop 实现为 no-op，不打死按钮
- `sidebar-activity/SidebarBottomActivity`：纯营销 banner + highspeed 分享卡仲裁（23 行），不落盘

### 拍板放弃（fork 主动决策，非遗漏）

- workspace tab 展开视图：项目树是唯一组织视图（`specs/sidebar-project-skeleton-swap.md`）。`SortableWorkspaceSidebar`/`WorkspaceSidebarItem`/`useWorkspaceTaskLists` 双数据源、`WebRemoteControlTaskIndex` 旧形态、`DeleteAllArchivedTasksButton` 等旧骨架 43 文件退役；已知代价：手机宽屏远控且无 bridge 附着时的任务索引视图消失（窄屏首页与附着后项目树不受影响）
- 打开方式采用「增强共存」而非替换：上游系统应用查询（file-open-apps）与 fork 自选应用列表同一菜单合并（系统应用默认置顶 → custom: → 静态编辑器），见 `specs/file-open-apps-enhancement.md`

### 补齐后的休眠面（协议/接线在、运行时多数场景不触发）

- workflow blocked 通知行、MCP 工作区信任 agent 边界（trust 落库在 CLI 剔除域，UI→host→services 三层已通）、初始化失败条与 /reload（CLI 不发射 lifecycle）、远程断连横幅（桌面远程项目未合并）、项目草稿归属管道（虚拟项目域未合入）

## 十一、rebrand 协议命名空间键（keep-ours，上游同步不得回退）

- MCP `_meta` 命名空间键 `com.zxcode/request-context`（rebrand 提交 `b8ea19cf` 自上游 `com.zcode/` 改名）是 fork 品牌项。client 写入方 `apps/zcode-cli/packages/adapters/src/mcp/index.ts`（`mcpRequestMeta`）与 host 读取方 `apps/zcode-cli/packages/node-repl-host/src/server.ts`（`buildRequestMeta`）必须同键。
- 事故：v3.15.1（`6ba801ec`）与 v3.16.2（`f785503b`/`00dbc590`）上游合并把 adapters 整文件覆盖回上游 `com.zcode/`，与 host 侧 `com.zxcode/` 劈叉。host 按"安全边界"静默降级 requestMeta 为 `{}`，普通 js 调用不受影响，但 Browser Use / Computer Use 的 bridge 因拿不到 `session_id` 报 `node_repl browser request is missing session_id metadata`。2026-11-09 修复（adapters 改回 `com.zxcode/`）。
- 合并判据：上游对 `adapters/src/mcp/index.ts` 的改动凡涉及该键字面量 → **keep-ours**。守护防线：`node-repl-host/test/request-context-key.test.ts`（两侧键一致）与 [specs/zxcode-path-consistency.md](specs/zxcode-path-consistency.md) 探针 5。

## 保留说明

- 模型推理仍可通过 API key 形式的 Provider 接入 Z.ai / BigModel（coding-plan 与标准 key），以及其他 OpenAI / Anthropic 兼容提供商。
- 桌面端本地仍会生成一个随机 `deviceMid`（存于 `~/.zxcode/v2/telemetry-state.json`），仅用作本地流式连接与手机 Relay 的连接标识，不会发送到智谱或任何遥测服务器。
- 模型请求仍会按所配提供商的协议要求附带认证与会话标识，具体见 [NOTICE.md](NOTICE.md) 的对外请求说明。
- v3.15.1 起 `packages/shared/src/zcodeEndpoint.ts` 恢复 `buildZCodeEndpointUrls` 裁剪版（仅 origin/apiBaseUrl/remoteUrl，供 web 远控前端 v3/v4 版本门槛使用）并新增 `resolveWebRemoteControlRelayWsUrl`（默认官方 relay 地址，自部署 relay 经设置覆盖）；上游 webRemoteControl manager 与 fork 自部署 `mobileRelayClient` 并存，互不替代。【2026-10-23 修订】左下角「移动端远程控制」入口已收口自部署 relay（removes 规范：不再生成 `zcode.z.ai` 官方二维码/凭据，未配置 relay 时入口隐藏），官方云中继 main 链路的整体删除为第二步专项（见 `specs/mobile-remote-entry-relay-only.md`）。
- 上游 v3.15.1 的 UI 插件、插件 UI 沙箱（`zcodePluginSandbox` preload 命名空间）、内联 Gen UI、vitest 测试体系为保留能力。
