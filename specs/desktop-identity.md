# Spec: ZxCode 产品身份与系统可见指纹

状态：实施中（rebrand 自 ZCode → ZxCode）
范围：仅系统可见指纹 + 网络 UA/请求头 + 进程命令行产物名 + `ZCODE_*` 环境变量前缀 + wire 协议字符串。
不在范围（刻意保留）：包名 `@zcode/*` 与 import 路径、`ZCode*` 类型/符号名、模块目录与文件名（`zcode-protocol/` 等）、后端域名 `zcode.z.ai` / CDN、插件市场 scope `@zcode-plugins-official`。

## 产品规则

- 显示名 `ZxCode`（驼峰），preview 显示 `ZxCode Preview`，dev 显示 `ZxCode Dev`。
- 标识类统一小写 `zxcode`：appId、URL scheme、数据目录、进程前缀、产物可执行名、CLI bin。
- 环境变量前缀 `ZXCODE_`。
- flavor 模型不变：production / preview 由 `ZXCODE_PREVIEW_IDENTITY` + `ZXCODE_ENV` 决定；身份（flavor）与后端环境（`ZXCODE_ENV`）仍是两个独立轴。
- 数据边界「全新开始」：不做旧 `~/.zcode` 数据迁移，不写旧名兼容别名；旧数据原地保留。

## 身份映射（旧 → 新）

| 类别               | 旧                                                       | 新                                                          |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------- |
| productName        | `ZCode` / `ZCode Preview` / `ZCode Dev`                  | `ZxCode` / `ZxCode Preview` / `ZxCode Dev`                  |
| appId              | `dev.zcode.app(.preview)`                                | `dev.zxcode.app(.preview)`                                  |
| Dev AUMID          | `cn.aminer.zcode`                                        | `dev.zxcode.app.development`                                |
| mac .app / Win exe | `ZCode.app` / `ZCode.exe`                                | `ZxCode.app` / `ZxCode.exe`                                 |
| Linux 可执行/包名  | `zcode(-preview)`                                        | `zxcode(-preview)`                                          |
| URL scheme         | `zcode://`                                               | `zxcode://`                                                 |
| 进程名前缀         | `zcode-*`                                                | `zxcode-*`                                                  |
| spawn 产物         | `zcode.cjs` / `zcode.bytecode.cjs` / `zcode-agent(.exe)` | `zxcode.cjs` / `zxcode.bytecode.cjs` / `zxcode-agent(.exe)` |
| CLI bin / 分发     | `zcode` / `zcode-relay` / `~/.zcode/runtime`             | `zxcode` / `zxcode-relay` / `~/.zxcode/runtime`             |
| 数据根 / dotfile   | `~/.zcode` / `.zcode/` / `zcode.json` / `.zcodeignore`   | `~/.zxcode` / `.zxcode/` / `zxcode.json` / `.zxcodeignore`  |
| Electron userData  | `<appData>/ZCode…`                                       | `<appData>/ZxCode…`                                         |
| 环境变量前缀       | `ZCODE_*`                                                | `ZXCODE_*`                                                  |
| User-Agent         | `ZCode/<版本>`                                           | `ZxCode/<版本>`                                             |
| HTTP 头            | `X-Title: Z Code@…`、`X-ZCode-App-Version`               | `X-Title: ZxCode@…`、`X-ZxCode-App-Version`                 |
| RPC 头             | `x-zcode-rpc-*`、`x-zcode-intranet-token`                | `x-zxcode-rpc-*`、`x-zxcode-intranet-token`                 |
| wire 协议          | `"ZCode Protocol"`、`zcode-hello(-ack)`                  | `"ZxCode Protocol"`、`zxcode-hello(-ack)`                   |
| serverId           | `zcode-relay` / `zcode-server`                           | `zxcode-relay` / `zxcode-server`                            |
| 打包元数据键       | `zcodeProductFlavor`                                     | `zxcodeProductFlavor`                                       |
| CUA helper         | `ZCode Computer Use.app`、`zcode-cua-broker-*.sock`      | `ZxCode Computer Use.app`、`zxcode-cua-broker-*.sock`       |
| 构建签名开关       | `ZCODE_ENABLE_MAC_SIGN`                                  | `ZXCODE_ENABLE_MAC_SIGN`                                    |

## 状态所有者与依赖方向

- 打包身份唯一来源：`packages/desktop/scripts/desktop-product-identity.mjs`（appId、productName、linux 可执行/包名、AUMID）。`electron-builder.config.js` 只能通过 `resolveDesktopProductIdentity(...)` 消费，不得另起常量。
- 运行时应用名所有者：`packages/desktop/src/main/desktopRuntimeEnv.ts` 的 `runtimeApplicationName`（决定 userData 目录名、`app.setName`、`process.title`）。
- 进程名所有者：`packages/shared/src/process-names.ts`（前缀与窗口标题特判串）。
- HTTP 指纹头所有者：`packages/shared/src/zcode-source-headers.ts`。
- 环境变量读取中心：`packages/shared/src/runtimeEnv.ts` 与 `packages/desktop/src/main/desktopRuntimeEnv.ts`；业务代码不得手写 `process.env.ZCODE_*` 新拼写以外的裸键。
- 数据目录所有者：`packages/services/src/paths.ts`。

## 签名（本轮不接证书，已确认决定）

- 保持现有开关：`ZXCODE_ENABLE_MAC_SIGN=1` + `APPLE_SIGNING_IDENTITY` / `CSC_NAME` 注入；entitlements 三文件不变；未签名构建流程不变。
- Windows 不配置签名证书：未签名安装包仍可正常安装运行，仅触发 SmartScreen"更多信息→仍要运行"；`win:` 块保持无签名配置。后续可选 SignPath（开源免费）/ Azure Trusted Signing。
- macOS 暂不公证：`notarize: false` 两段式设计保持；接入证书时再补 notarytool 环节。
- 拿到证书后的接入点：`electron-builder.config.js` 的 `shouldEnableMacSigning`、`signIdentity`、`hardenedRuntime`；公证沿用现有独立公证阶段（builder 内置 notarize=false）。
- appId 变更影响：首次签名发布后，macOS TCC 授权（Apple Events、辅助功能、屏幕录制）与 keychain 分区需用户重新授权；Windows 任务栏固定项/开始菜单索引因 AUMID 变更失效。

## 兼容边界（已确认接受）

- 旧桌面端 × 新 relay / 新 wire 协议不互通（组件同发版，混布不支持）。
- 旧 `zcode://` 链接失效。
- 旧 `~/.zcode` 数据不迁移。
- 外部 CI 不在本仓库但引用 `ZCODE_PREVIEW_IDENTITY` / `ZCODE_ENV` 等，发布前需外部同步。
- 自动更新旧 feed 断档（本轮无 autoUpdater 配置，仅记录）。

## 刻意保留（逐项确认）

| 保留项                                                                                                                            | 原因                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 包名 `@zcode/*`、import 路径、`apps/zcode-cli` 目录                                                                               | 范围决策：仅系统可见指纹，不动包名/目录                      |
| `ZCode*` 内部符号（ZCodeIntl、ZCodeTaskMeta 等 ~618 个）                                                                          | 内部代码标识，非系统可见                                     |
| 插件市场 scope `zcode-plugins-official`、`zcode-guide` 等插件 ID                                                                  | 已持久化于 manifest/CDN，外部契约                            |
| `.zcode-plugin/` 插件包格式标记                                                                                                   | 外部插件包（CDN/市场）内容格式                               |
| `zcode_official` MCP 鉴权类型                                                                                                     | 插件 `.mcp.json` 持久化字段，外部契约                        |
| 域名 `zcode.z.ai` / `cdn-zcode.z.ai`、后端路径 `/zcode/deps`、`/zcode/official-plugin`、`/zcode/electron/releases`、`/zcode-plan` | 外部基础设施与后端 API 契约                                  |
| intranet 资产服务 URL 路径 `/zcode`、SMB 目标 `zcode/deps`、`RELEASE_DIRECTORY_PREFIX = "zcode-cli-"`                             | 外部内网资产服务路径契约（上传端回退与 URL 对齐）            |
| `com.zxcode/` MCP meta 命名空间、`zcode/` 短前缀 meta 键                                                                          | 与 Go 侧/服务端 header 的跨语言键约定（注释明示）            |
| legacy 文件格式字面量：`zcode.model-providers.v1/v2`、`china-llm-zcode-dev`、`zcode.enabled` 等 opencode 扩展键                   | 只读历史文件格式，改了会导致旧配置解析失败                   |
| `zcode-credential-fallback` KDF salt                                                                                              | 凭据加密密钥派生盐，改了旧凭据解不开                         |
| `zcode-stdio-tap.mjs` 脚本名（引用已同步）、`build:zcode` 脚本名                                                                  | 仓库内构建/开发脚本名，非系统可见                            |
| `zcode.local`（checkpoint 邮箱域）、`refs/` 之外的 git 内部约定                                                                   | 已改 checkpoint 邮箱为 `checkpoint@zxcode.local`；域名类保留 |
| relay 协议模块路径 `@zcode/shared/zcode-relay-protocol`、`zcode-protocol*` 目录/文件名                                            | 模块名在保留范围                                             |
| `Symbol.for("zcode.*")` 品牌符号、`zcode.estimateTokens.v1`（已改 `zxcode.`）、诊断常量                                           | 进程内符号键不可见；已改可见事件串                           |

## 验收结果（2026-09-22 实测）

1. ✅ 未签名打包身份单点：`desktop-product-identity.mjs` = appId `dev.zxcode.app(.preview)`、productName `ZxCode[ Preview]`、linux `zxcode[-preview]`；electron-builder protocols scheme `zxcode`；产物名模式 `${productName}-...`。
2. ✅ `process-names.ts` 前缀 = `zxcode`；spawn 产物 = `zxcode.cjs` / `zxcode-agent(.exe)`；CLI bin = `zxcode`、relay bin = `zxcode-relay`；安装器包装 = `$BIN_DIR/zxcode`；`process.title` = `runtimeApplicationName`（ZxCode 三态）。
3. ✅ HTTP 头：`User-Agent: ZxCode/<version>`、`X-Title: ZxCode@...`、`X-ZxCode-App-Version`（zcode-source-headers.ts）；RPC 头 `x-zxcode-rpc-*` / `x-zxcode-intranet-token`；wire `zxcode-hello(-ack)`、协议名 `"ZxCode Protocol"`、serverId `zxcode-relay` / `zxcode-server`。
4. ✅ 数据目录：`~/.zxcode/v2/...`、`<appData>/ZxCode/...`、项目 `.zxcode/`、`zxcode.json`、`.zxcodeignore`；workspace hook `configFileKind` 枚举 = `zxcode.json` / `.zxcode/config.json`。
5. ✅ 环境变量：`ZXCODE_*`（全仓 315 名替换，typecheck 0 错）。
6. ✅ 验证：`pnpm typecheck` 0 错；`pnpm lint` 0 错 / 59 警告（与 HEAD 基线同数，存量）；`pnpm architecture:check --changed` 0 违规；测试 relay 9/9 + services 10/10 + ui 6/6 全通过（根目录 ui 测试为别名解析的运行方式差异，从包目录运行通过）。
7. ✅ `rg -i zcode` 可见面专项（productName/AUMID/scheme/UA/头/hello/bin/tmpdir/git邮箱/CA 文件名等22 项模式）全部 0 命中；残留 15309 处均为上方保留清单项。

## 验收场景（设计目标，供后续打包态核对）

1. 未签名打包后：`Info.plist` 的 CFBundleIdentifier = `dev.zxcode.app`、CFBundleName = `ZxCode`；产物文件名为 `ZxCode-<version>-<platform>-<arch>[_TEST].<ext>`。
2. 运行时 `ps`：主/渲染/Host/Agent 进程名为 `zxcode-…`，Agent 命令行指向 `zxcode.cjs` / `zxcode-agent`。
3. 抓包或日志：请求头 `User-Agent: ZxCode/<version>`、`X-Title: ZxCode@…`，无 `X-ZCode-*` 残留。
4. 数据目录：新装后生成 `~/.zxcode/v2/…` 与 `<appData>/ZxCode/…`；旧 `~/.zcode` 与 `<appData>/ZCode` 不被读写。
5. `rg -i 'zcode'` 扫描：残留项均为本 spec「不在范围」清单或注释性历史提法，逐项确认。
6. `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 全绿；受影响测试按各包 `package.json` 实际执行。
