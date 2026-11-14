# ZxCode 路径与产物名一致性（fork 收口）

本仓库 rebrand 后（`ZCode` → `ZxCode`），数据目录、构建产物名、环境变量名三处必须保持 fork 侧一致；上游同步取上游版本时极易把其中一处改回上游命名而其余处不动，形成"无冲突的 split-brain"，静默产出旧产物或写错目录。本 spec 固化三组不变量与上游 sync 后的检查项。

## 产品规则

- 数据根：fork 全部可写数据在 `{dataBaseDir}/.zxcode` 下（`packages/services/src/paths.ts` 收口）。host 侧镜像 CLI 路径时必须对齐 fork CLI 实际目录 `~/.zxcode/cli`（config / db / log 的唯一权威定义在 `apps/zcode-cli/packages/adapters/src/config/file-config.adapter.ts`、`apps/zcode-cli/packages/contracts/src/config/index.ts`、`apps/zcode-cli/packages/adapters/src/logging/index.ts`），不得手写 `.zcode` 字面量。
- host 侧技能/命令/设置同步/数据同步的用户级与 workspace 级品牌目录同样锁定 `.zxcode`（2026-11-14 收口：`skillsService`、`commandsService`、`settingsSyncService`、`hookDataSync`、`skillDataSync`、`commandDataSync`；对齐 `subagentsService` 先例与 CLI 侧 `adapters/src/commands/roots.ts`、`adapters/src/skills/roots.ts` 的 `ZXCODE_DIR = ".zxcode"`）。劈叉症状（已修复案例）：插件市场「创建插件」报"插件创建器暂不可用"——skillsService 扫 `~/.zcode/cli/plugins/cache` 静默返回空，而 CLI 读 `~/.zxcode` 显示插件已启用，两个进程读两个数据根。
- 工程探针：`packages/services/test/zxcodePathConsistency.test.ts` 扫 services 源码禁止 `".zcode"` / `"~/.zcode"` 字面量（注释行豁免）；`.zcode-plugin`（插件 manifest 约定名，CLI 同款）不受本约束。未来确需读旧上游数据时写双名兼容（先例：`bootstrap/plugins.ts` `isWorkspacePluginConfigPath`），并在本 spec 登记。
- 已知残留处置（2026-11-15 拍板"修复两处残留"后全量收口）：①named workflow 读侧（`script-workflow-tool-port.ts` resolveNamedWorkflowPath）已对齐 `.zxcode`（30ce8b07 合并曾把它打回上游 `.zcode`，fork 全部写侧都是 `.zxcode`，不做双名兜底）；②UI 文案 zh-CN/en-US 六处（remoteSync.empty.description、remoteSync.blocked.externalDirectory、`~/.zcode/server` 安装文案）已对齐 `.zxcode`（远控推送实现两端本来就写 `.zxcode`，文案是漏改）；③同簇行为层三处一并修复：`desktopHostProcess.ts` 凭据密钥登记路径（copyDataDirectory 目标布局是 `.zxcode/v2`，登记 `.zcode` 会重现"重启掉登录"）、`exportLogs.ts` 归档内 CLI 日志路径标签、`migrate-projects.ts` 远端 owner 建项目的会话目录排除（补 `.zxcode/workspace` 双拼写，对齐 project-repository listRestoreCandidates 先例）。
- 刻意不动（勿"修复"）：`default-workspace/migration.ts` 的 `*/.zcode/workspace/default` GLOB 属 0005 存量迁移（已应用迁移 SQL 不可改，见 project-repository 先例注释）；`plugins.ts` 的 `.zcode`/`.zxcode` 双名判定与 `.zcode-plugin` manifest 目录名是兼容约定。
- 测试基建待办（不阻塞运行时）：E2E 隔离 HOME 样本放置仍钉 `.zcode` 布局（`export-logs-jsonl-redaction.test.ts:234-235`、`e2e-runtime-paths.ts`、`ssh-remote-p0.ts` 等与 app 实际 `.zxcode` 布局不一致，需与 E2E 负责人统一）；core/tests 的 saved-workflows / workflow-draft 等测试期望仍是上游 `.zcode` 字面量（存量红，品牌收尾时逐文件对齐，workflow-store.test.ts 已翻绿）。
- 例外（写死且合法）：`setting.json` 刻意锚定 homedir（`~/.zxcode/v2/setting.json`），不跟随 `dataBaseDir`（见 `paths.ts` `copyDataDirectory` 注释）；desktop main 与 services 两端路径必须一致。
- 读旧数据兼容不算残留：`project-storage` 的 `.zcode/workspace` 迁移 GLOB、legacy 配置读取兼容、`.agents` 双目录合并保持不动。
- agent bundle 产物名固定 `zxcode.cjs`：CLI 构建产物（`apps/zcode-cli/packages/cli/dist/zxcode.cjs`）、desktop 暂存（`packages/desktop/scripts/stage-agent-bundle.mjs`、`prepare-agent-node-bundle.mjs`）、远端 wiring（`packages/zcode-server-cli`）、运行时入口（`packages/shared/src/zcode-agent-runtime.ts` `nodeBundleEntryFile`）四方一致。上游 `build.mjs` 的 `dist/zcode.cjs` 命名在合并时属**品牌项，keep-ours**。
- 环境变量名带 `ZXCODE_` 前缀：desktop/E2E home 隔离用 `ZXCODE_DESKTOP_HOME_DIR`，数据根覆盖用 `ZXCODE_DATA_BASE_DIR`。上游带入的 `ZCODE_*`（无 X）变量名视为改名残留。

## 状态所有者与接口

- 路径工具唯一所有者：`packages/services/src/paths.ts`（`getZCodeDataRootDir` / `getAppConfigDir` / `getProviderWorkspaceConfigDir`）。
- 远程安装根：source-server 通道与 remote 通道统一 `~/.zxcode/server`（`packages/server/src/source-server/*` 常量、`packages/zcode-server-cli/src/runtime/paths.ts` `getDefaultServerDataRoot`）。
- 打包新鲜度防线：`packages/desktop/scripts/prepare-agent-node-bundle.mjs` 在 `buildCliBundle()` 后断言产物 mtime ≥ 脚本启动时间，source 侧 `existsSync` 守卫不得作为唯一防线（历史上旧名残留文件曾让守卫全放行，把两天前的旧 agent 静默打进安装包，引发 `fault.command.executionFailed` 协议错位）。

## 上游 sync 后的 rebrand 检查项（合并完成判定的一部分）

1. `pnpm test:engineering packages/services/test/zxcodePathConsistency.test.ts` 通过（services 域探针）；CLI 域与 UI 文案用 `git grep -n '\.zcode' -- packages apps`（排除本 spec 列出的读旧兼容清单与注释）复核无新增命中。
2. `git grep -n 'dist/zcode\.cjs'` 无命中（产物名 split-brain 探针）。
3. `git grep -n '"ZCODE_'` 无新增无 X 前缀 env 名。
4. 重打包前验证 `apps/zcode-cli/packages/cli/dist/zxcode.cjs` 含当次协议改动（本次事故探针：`grep -c toolSearchMode` > 0）。
5. MCP request-context 命名空间键 split-brain 探针：`git grep -n 'com\.zcode/request-context'` 无命中。该键（`com.zxcode/request-context`）属品牌项 keep-ours，adapters 写入方与 node-repl-host 读取方必须同键；劈叉症状为 Browser Use / Computer Use 报 `missing session_id metadata`（v3.15.1/3.16.2 两次上游合并均把 adapters 打回上游键，2026-11-09 修复，详见 REMOVALS.md 第十一节）。

## 验收场景

1. 打包产物内 `glm/zxcode.cjs` 与 `apps/zcode-cli/packages/cli/dist/zxcode.cjs` md5 一致，且包含最近一次 shared 协议变更的字段。
2. fork 运行期不向 `~/.zcode` 写入任何文件（desktop 日志 `writing settings to` 指向 `~/.zxcode/v2/setting.json`）。
3. host 侧读取 fork CLI 的 config / db / log / usage 证据时路径可达（`~/.zxcode/cli/...`）。
4. 远端 source-server 部署后 `current.json`、`run/status.json`、sessionDb 均落在 `~/.zxcode/server` 树内，server CLI 不进 dataBaseDir 隔离模式。
