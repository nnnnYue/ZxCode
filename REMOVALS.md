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

## 十二、v3.18.0 同步剔除（2026-11-12）

v3.18.0 合并（`b95ebaff` sync）沿用「引擎/新功能采纳、智谱联网域拒入」策略。本节记录本轮新增剔除与拍板：

### 新增剔除域（上游 v3.18.0 新功能中的智谱联网面）

- **voice-input 语音输入**：云端 ASR（`/api/v1/asr/tickets` + WS 转发 PCM16，`voiceInputService.ts`）+ `zcodejwttoken` 登录令牌双重命中剔除域。整域拒入：`packages/services/src/voice-input/`、`packages/ui/src/voice-input/`、`packages/desktop/src/main/microphone-access/`、node.ts 注册块、ConversationComposer 接线、i18n key、e2e（asr-mock-server）。TID 常量保留为休眠。
- **Web 区域化登录**（`packages/web/src/auth/webRegionalOAuth.ts`，`chat.z.ai/oauth/authorize`）与 **Web 分享管理页**（`packages/web/src/share-manage/`，zcode-server 分享 API）：随登录/分享域拒入。
- **移动推送**：`mobilePushEnabled` 设置、`webRemoteControlV2Http` 的 `/api/v1/remote/notification/events` 上报、`mobilePushConnection`——依赖登录账号与官方推送服务，拒入（`web-remote-relay/` 整目录继续保 fork 删除，自部署 relay 不受影响）。
- **插件推荐设置**：`PluginAutoRecommendationSetting`（数据源 `useUiPluginRecommendations` 读 clientConfig 在线下发）。
- **i18n 新语言（ja-JP/ko-KR/ru-RU）中的剔除域 key**：三语言文件按 zh-CN/en-US 最终 key 集白名单裁剪（各删约 880+ 条：manualClaimPlan 分享、globalNotice.highspeed、highspeed `zcode.z.ai` 下载链接、conversationShare、mobilePush、login.\* 等）。

### 上游对既有剔除域的演进（全部拒入，维持 fork 现状）

- Coding Plan 配额/用量/购买（含 CONFIRMING(type) 确认页、highspeed-owner 账号域）、off-peak 激活面、营销（marketing-touch task-completion）、自动更新（autoUpdater `resolveZcodeJwtToken` 更新 feed 鉴权、forceUpdate、manifest provider、auto-update smoke 脚本与 `UpdateStatusDialog`）、遥测（desktopStabilityTelemetry 崩溃脱敏移出、`/event/report`）、source-server/数据同步 UI（`packages/ui/src/data-sync/` 复活已清）、zhipu 账号 provider 运行时、official-mcp 凭据、clientConfig/help 在线下发、Sites（site-analytics、official-command-endpoint 身份链路）、反馈工单。

### 本轮拍板（fork 主动决策）

- **web 远控前端保 fork 平铺结构**：上游 `packages/web/src/web-remote-control/` 子目录化重构（含 regional-login 接线）拒入；上游手机草稿恢复链（依赖 `webRemoteControlBridgeRecovery`）一并保 fork 旧恢复链路。
- **CLI 凭据侧未接 keyring v2**：`adapters/src/auth/{credential-cipher,shared-credentials}.ts` 上游演进与智谱账号域（saveZaiLoginCredentials、zcodejwttoken）深度耦合，保 fork 版（AES-GCM `enc:v1`）；桌面侧 credential-security（keyring v2）已采纳，读取 fork 凭据走 `createLegacyCredentialCipher` 兼容 v1 格式。
- **UI 组件保守取 fork 版**：AssistantPreviewCards、RemoteConnectionFields/ConnectingStep、WorkspaceSidebarFooter、DesktopTopOverlay、MemorySettingsPage（settings-scope 依赖）等上游重写未采纳（fork API 面不支持或依赖剔除域）；ToolCallBlocks 分组渲染器（changes/cua/execute-group）随上游渲染重构退役。
- **conversationTimeline 保 fork 数组版**：上游「历史+尾轮」分区管线（`getConversationRowsPartition`）依赖 conversationProjectionStore 上游版，fork 侧未引入，timeline/liveTail 按数组版对齐（仅缺上游性能优化，行为等价）。
- **data-sync e2e 保留**：fork 既有数据同步 e2e 用例（测自建 relay/stub 降级路径）随上游目录重组迁至 `remote/data-sync/`，属 fork 保留域（与 source-server UI 剔除不冲突）。
- **CLI v4 遥测契约休眠面**（`contracts/telemetry`、`conversation-telemetry-facts`、`zcode-protocol-v4/telemetry`）继续保留（v3.17.2 既定决策，本地会话指标，无上报链路）。
- **ZXCODE\_ 环境键族**：上游把 `ZXCODE_BASE_URL/ENDPOINT_ORIGIN/...` 等改回 `ZCODE_*`，fork 消费基线键名不回退（判据同 §十一，以 `git show 1ed5dd2d` 全族为准）；`ZCODE_CLIENT_LANGUAGE_ENV` 为拍板例外（按上游名）。

### 采纳面备注

- 桌面 `desktopNetworkPolicy` 采纳上游 X.509 完整链验证（pkijs），剥离 `electron-updater` import 与 auto-updater 出口规则（fork 无该依赖）。
- `config/provider/zxcode-builtin.json` 采纳 revision 44（新增 `gpt-6.1-terra` API key 模板；无 `account:zai-*` 规则）。
- `session-lifecycle`/`input-prediction`/`session-features`/`conversation-quote-context` 等 CLI 本地引擎域本轮采纳（此前 v3.17.2 保基线未合）。
- **node-repl-host 0.7.0 补全采纳**【2026-11-14】：v3.18.0 合并把该插件留在坏中间态——definition 已是 0.7.0，但包内 manifest/package.json 停在 0.6.1（v3.17.2 CLI 域 keep-ours 遗留），call-ledger 只合入半套（result.ts 反伪造强化在、server.ts 账本接线缺），node-repl-host vitest 3 个账本断言挂、运行时截图下标/CUA App 身份/会话能力标签三类可信 `_meta` 键永不写回、商店对已启用用户常驻 update-available 误报。本轮按「引擎/新功能采纳」补全整套：server.ts 账本接线、browser-bridge 主线程代理、cua-broker 按条目 token 鉴权、no-progress-guard（上游 0.6.2 特性随 0.7.0 一并进入）与账本行为回归测试全量采纳；rebrand 项按第十一节回写（`com.zxcode/request-context`、`ZXCODE_PLUGIN_ROOT`/`ZXCODE_CUA_*` env、`ZXCODE_MCP_*` 双名导入、`ZXCODE_CUA_HELPER_BUILD_ID` define）。plugin.json/package.json/`NODE_REPL_SERVER_VERSION` 三处对齐 0.7.0 并重建 dist；`bootstrap/test/official-plugin-defaults.test.ts` 新增「定义 version 与包内 plugin.json 一致」守护，`test/request-context-key.test.ts` 守护保留。

## 十三、v4.0.0 同步剔除与拍板（2026-11-26）

v4.0.0 合并（上游 squash 提交 `a4b44451`，2209 文件）沿用「引擎/新功能采纳、智谱联网域拒入」策略。本轮采纳预装文档工具链（preinstalled-tools，CDN 默认基址置空）、MCP 异步连接与动态目录缓存、Skill 实时目录、Workspace 插件信任门、子代理常驻后台、回复语言、Token 预算提醒、崩溃恢复、CLI 浏览器登录态注入、Windows CMD 只读判定、会话归档批量预检删除、会话遥测休眠契约演进（本地指标）、文档四插件 0.2.10/design 0.8.0/cua 0.6.6/browser-use 0.5.2/android-emulator 0.1.3、node-repl-host 0.7.1。zod 3→4 major 迁移随上游。

### 新增剔除域（上游 v4.0.0 中的智谱联网面）

- **voice-input 复活面**：`useVoiceInputShortcut` 快捷键与 composer 接线、`docs/chat/composer-voice-input.md`、e2e（asr-mock-server 接线）随 §十二继续拒入。
- **Web 区域化登录演进**（`webRegionalOAuth`、`chat.z.ai/oauth/authorize`）与登录区域（plugin store regions、`usePluginLoginRegion`）：随登录域拒入，contracts/protocol 的 regions 域整体剔除。
- **会话分享 v1 演进**：services conversation-share（rate-limit 等待、artifact 校验问题码）、UI `conversation-share-interaction/`（preflight 指纹搬家）、`conversationShare.issue.*` i18n key，随 §二/§八拒入。
- **PayPal 支付中继**：`desktopWindowChrome`/`desktopMainIpcRemote` 的 `CODING_PLAN_ZAI_PAYPAL_RELAY_HOSTS`（`api.z.ai`）hunk 拒入。
- **遥测抓取面复活**：merge 在 8 个 e2e spec 与 `V4InteractionDialogs` 复活的 `conversation-telemetry-parity-capture` 断言/上报全部摘除（helper fork 已删）。
- **插件图标/目录 CDN 回流**：marketplace 图标子系统与官方 no-refetch 守卫、`cdn-zcode.z.ai` 图标/目录 URL 按 fork「图标不写 seed、运行时无 CDN fetch」不变量摘除；`OFFICIAL_MARKETPLACE_OFFLINE_ENTRIES` seed 展开恢复。
- **providerProvisioningSource 账号 token 列表**：上游 LEGACY+OAuth 会话组 key（`zcodejwttoken`、`oauth:zai*`）不合入，allowlist 维持 fork 空列表。
- **automations live-bigmodel-team / live-zapi**：真实账号域 e2e 拒入。

### 品牌回写（本轮回归面）

- HOME 数据目录 `.zcode`：merge 新增 src 2 处（browser storage-state、skills catalog）回写 `.zxcode`；workspace 级 `.zcode/config.json` 与 `.zcode-plugin` 继续保护不动。
- `ZCODE_*` env 键族：8 个键（STORAGE*DIR、CREDENTIAL_SECRET、PLUGIN_ROOT、CUA*_、PLUGIN*DATA、PROJECT_DIR、PREINSTALLED_TOOLS*_、AVAILABLE）约 60 处回归 `ZXCODE_`；例外 `ZCODE_CLIENT_LANGUAGE*` 按上游名；desktop e2e agent 侧 env（wdio ensure-e2e 注入）保上游名。
- `com.zxcode/request-context`：adapters mcp/index.ts 与 node-repl-host server.ts 取上游后回写键；守护测试通过。

### 本轮拍板（fork 主动决策）

- **no-progress-guard 跟随上游撤销**：上游 0.7.1 主动回退该特性，fork 随上游删除（§十二 0.7.0 补全工程中的 guard 部分退役，call-ledger 与鉴权保留），守护测试同步。
- **draftModelMigration 弃用**：上游草稿模型迁移依赖 clientConfig 在线下发域（fork 已删），整链不引入。
- **ConversationQuotaBanner 保 fork 休眠版**；SessionPane/ConversationRowView/TurnNavigator 保 fork 数组版渲染（上游 ItemView 分区管线不引入，同 §十二）。
- **session-data purge 演进采纳**：本地永久删除能力（`deletionPreviewBatch`），无联网面。
- **prepareAgentNodeBundle.test.ts 随上游删除**（脚本保留）。
- **offpeak-retry 激活测试继续拒入**（§九现状）。
- **SSH remote-release e2e 构建锁摘除**：`withE2EDesktopBuildLock` 属上游新增（fork ensure-e2e 无此导出），维持 fork 无锁基线；并行 runner 重建 mock-cdn 的竞争窗口为已知开发场景限制。
- **auth-config pending 车位**：`system-credential-auto-reset`（凭据安全，已采纳域）保留 pending；`logout-relaunch-login-gate`、`cn-login-stale-provider-family-domain`（登录域）删除。
- **上游 promoted pending specs（约 40 个 fork 曾裁剪用例）**：本地功能用例随上游目录整改复活，由 e2e-remote-target-specs 门禁排除出默认全量；引用已删 helper 的 19 个用例已删。

### 审计后拍板补登（2026-11-26，v4.0.0-ce.1 合并复核）

- **provider builtin 配置只在编译打包期联网刷新（二次拍板，废止同日首版「运行时保留、默认开启」拍板）**：客户端运行时不发起 `/api/v1/client/configs` 与 CDN 请求——bootstrap standalone 的 `zcodeBuiltinRemote` 接线拆除（`ProcessProviderRegistryRuntimeOptions.standalone` 仅保留凭据与旧配置导入），CLI 侧 `createCliProviderRefreshReporter` 删除，services 休眠消费方 `model-provider/zcodeBuiltinRemoteConfig.ts` 删除；provider-node 的 synchronizer/download 引擎随上游保留为休眠（无运行时激活路径，off-peak 同款）。刷新唯一路径：打包入口 `scripts/build-zcode.mjs` 自动执行 `scripts/update-builtin-provider-config.mjs`（拉索引→下载→去平台化清洗〔删 zcode.z.ai 网关模板、账号型 access、已下线平台管理外链，第三方外链保留，级联清模型规则〕→decode 校验→原子写回 `config/provider/zxcode-builtin.json`；远端 revision 不升号保留本地，网络失败保留快照并以 0 退出，不阻断离线构建）。运行时读取的始终是清洗后的仓库快照。
- **office-runtime 补采纳上游会话化 viewer**：撤销 v3.17.2「CLI 域整包回退」对本包的静默遗留（纯本地引擎、无联网面，判据「引擎/新功能采纳」）；文档四插件 0.2.10/0.2.11 版本号与引擎实现恢复一致，`.zcode/document-imports` 按品牌回写 `.zxcode`。
- **插件 MCP isolation 透传恢复**：官方插件 `isolation: "workspace"` 共享语义的生产端映射（`adapters/src/plugins/mcp.ts`）随合并恢复；消费端（`adapters/src/mcp/pool.ts`）已随上游在位，文档四插件 plugin.json 的声明不再是死配置。
- **slash 命令输入历史记录守卫恢复**：合并把 `command-center/history.ts` 的 `shouldRecordSlashCommand` 弱化成只记录 unknown（自定义）命令，已接受的内建 slash 命令（`/help`、`/model` 等）不再写入输入历史，TUI 输入召回丢记忆；按上游（与 v3.18.2 相同语义）恢复「接受的命令一律记录」，fork 已剔除 `/login`，上游对其 API-key 登录命令的排除分支无对应命令名。配套把 `packages/cli` 存量单测（cli.unit/provider-runtime-env 等）的旧品牌断言（`zcode`→`zxcode`、`.zcode`→`.zxcode`、`ZCODE_*`→`ZXCODE_*`）与随剔除域失效的期望（login/logout 不再运行 Core、遥测关闭回调、standalone providerRuntimeHeadersPort 转发已于 0c4bd7a8 拆除）清理回绿，cli.unit.test.ts 192/192。
- **CLI 用户可见文案品牌回写**：`hooks-trust-command.ts` 的 USAGE 与 trust grant 提示、`plugins-command-shared.ts` 的 scope 报错仍让用户照抄不存在的 `zcode` 命令，回写 `zxcode`；`process-name.ts` 的 `zcode-cli`/`zcode-mcp` 内部进程标题与上游逐字一致，保持不动。同轮把 `packages/cli` 兄弟套件的合并陈旧断言清理回绿：登录域整测 `tui-login-polling.test.ts` 删除（`tui-login-state.ts` 已随 3c58a218 剔除）、`tui-model-selection` 弃用该死 import 并内联 fork 生产同款判定、`tui-startup`/`browser-state-option`/`plugin-host-entry`/SEA 三件套（build-sea、sea-runtime-tools、build、upload-sea-smb）的旧品牌期望与 `__zxcode-plugin-host` 标记对齐，cli 包 46 个测试文件全绿。`packages/shared/package.json` 仍悬空导出 `"./request-security"`（目录已删、全仓无引用），留待下次剔除轮独立 commit 清除。

## 保留说明

- 模型推理仍可通过 API key 形式的 Provider 接入 Z.ai / BigModel（coding-plan 与标准 key），以及其他 OpenAI / Anthropic 兼容提供商。
- 桌面端本地仍会生成一个随机 `deviceMid`（存于 `~/.zxcode/v2/telemetry-state.json`），仅用作本地流式连接与手机 Relay 的连接标识，不会发送到智谱或任何遥测服务器。
- 模型请求仍会按所配提供商的协议要求附带认证与会话标识，具体见 [NOTICE.md](NOTICE.md) 的对外请求说明。
- v3.15.1 起 `packages/shared/src/zcodeEndpoint.ts` 恢复 `buildZCodeEndpointUrls` 裁剪版（仅 origin/apiBaseUrl/remoteUrl，供 web 远控前端 v3/v4 版本门槛使用）并新增 `resolveWebRemoteControlRelayWsUrl`（默认官方 relay 地址，自部署 relay 经设置覆盖）；上游 webRemoteControl manager 与 fork 自部署 `mobileRelayClient` 并存，互不替代。【2026-10-23 修订】左下角「移动端远程控制」入口已收口自部署 relay（removes 规范：不再生成 `zcode.z.ai` 官方二维码/凭据，未配置 relay 时入口隐藏），官方云中继 main 链路的整体删除为第二步专项（见 `specs/mobile-remote-entry-relay-only.md`）。
- 上游 v3.15.1 的 UI 插件、插件 UI 沙箱（`zcodePluginSandbox` preload 命名空间）、内联 Gen UI、vitest 测试体系为保留能力。
