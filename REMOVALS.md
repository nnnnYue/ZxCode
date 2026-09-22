# 移除项清单：智谱登录、遥测与指纹

本仓库在开源代码基础上移除了与智谱（Z.ai / BigModel 平台，`zcode.z.ai`）相关的账号登录、遥测上报和设备指纹信息，主要改动见提交 `3c58a21`。本文只列删除项；当前保留的能力与对外请求说明见 [README.md](README.md) 和 [NOTICE.md](NOTICE.md)。

## 一、平台账号登录

- Z.ai / BigModel OAuth 登录（`bigmodel-oauth.ts`、`browser.ts`）
- CLI 设备码（device flow）登录：`login` 命令、登录轮询与中止、TUI 登录态（`cli-oauth.ts`、`login-command.ts`、`auth-login*.ts`、`login-flow.ts`、`tui-auth.ts`、`tui-login-state.ts`）
- zhipu-account Provider 账号鉴权运行时（`standalone-account-provider-runtime.ts`）
- 启动登录门控：桌面端不再要求登录，直接进入工作台
- Coding Plan 嵌入式购买 / 升级 Webview 及登录恢复流程

## 二、zcode.z.ai 平台运行时调用

- 客户端配置与场景（client scenes）在线拉取
- 官方 Coding Plan 网关改写（`official-coding-plan-gateway.ts`）
- 用量 / 订阅：Coding Plan 用量图表、Start Plan 余额与配额卡片、配额重置 store、套餐商品拉取
- 会话分享：分享确认 / 选择面板、分享附件服务、分享预检指纹
- 反馈工单、飞书反馈表单与社区链接跳转
- 闲时任务（off-peak）：工具、协议端口、失败重试策略与全部设置界面
- 官方 MCP 凭据下发

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

## 保留说明

- 模型推理仍可通过 API key 形式的 Provider 接入 Z.ai / BigModel（coding-plan 与标准 key），以及其他 OpenAI / Anthropic 兼容提供商。
- 桌面端本地仍会生成一个随机 `deviceMid`（存于 `~/.zxcode/v2/telemetry-state.json`），仅用作本地流式连接与手机 Relay 的连接标识，不会发送到智谱或任何遥测服务器。
- 模型请求仍会按所配提供商的协议要求附带认证与会话标识，具体见 [NOTICE.md](NOTICE.md) 的对外请求说明。
