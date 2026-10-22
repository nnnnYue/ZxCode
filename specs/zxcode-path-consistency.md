# ZxCode 路径与产物名一致性（fork 收口）

本仓库 rebrand 后（`ZCode` → `ZxCode`），数据目录、构建产物名、环境变量名三处必须保持 fork 侧一致；上游同步取上游版本时极易把其中一处改回上游命名而其余处不动，形成"无冲突的 split-brain"，静默产出旧产物或写错目录。本 spec 固化三组不变量与上游 sync 后的检查项。

## 产品规则

- 数据根：fork 全部可写数据在 `{dataBaseDir}/.zxcode` 下（`packages/services/src/paths.ts` 收口）。host 侧镜像 CLI 路径时必须对齐 fork CLI 实际目录 `~/.zxcode/cli`（config / db / log 的唯一权威定义在 `apps/zcode-cli/packages/adapters/src/config/file-config.adapter.ts`、`apps/zcode-cli/packages/contracts/src/config/index.ts`、`apps/zcode-cli/packages/adapters/src/logging/index.ts`），不得手写 `.zcode` 字面量。
- 例外（写死且合法）：`setting.json` 刻意锚定 homedir（`~/.zxcode/v2/setting.json`），不跟随 `dataBaseDir`（见 `paths.ts` `copyDataDirectory` 注释）；desktop main 与 services 两端路径必须一致。
- 读旧数据兼容不算残留：`project-storage` 的 `.zcode/workspace` 迁移 GLOB、legacy 配置读取兼容、`.agents` 双目录合并保持不动。
- agent bundle 产物名固定 `zxcode.cjs`：CLI 构建产物（`apps/zcode-cli/packages/cli/dist/zxcode.cjs`）、desktop 暂存（`packages/desktop/scripts/stage-agent-bundle.mjs`、`prepare-agent-node-bundle.mjs`）、远端 wiring（`packages/zcode-server-cli`）、运行时入口（`packages/shared/src/zcode-agent-runtime.ts` `nodeBundleEntryFile`）四方一致。上游 `build.mjs` 的 `dist/zcode.cjs` 命名在合并时属**品牌项，keep-ours**。
- 环境变量名带 `ZXCODE_` 前缀：desktop/E2E home 隔离用 `ZXCODE_DESKTOP_HOME_DIR`，数据根覆盖用 `ZXCODE_DATA_BASE_DIR`。上游带入的 `ZCODE_*`（无 X）变量名视为改名残留。

## 状态所有者与接口

- 路径工具唯一所有者：`packages/services/src/paths.ts`（`getZCodeDataRootDir` / `getAppConfigDir` / `getProviderWorkspaceConfigDir`）。
- 远程安装根：source-server 通道与 remote 通道统一 `~/.zxcode/server`（`packages/server/src/source-server/*` 常量、`packages/zcode-server-cli/src/runtime/paths.ts` `getDefaultServerDataRoot`）。
- 打包新鲜度防线：`packages/desktop/scripts/prepare-agent-node-bundle.mjs` 在 `buildCliBundle()` 后断言产物 mtime ≥ 脚本启动时间，source 侧 `existsSync` 守卫不得作为唯一防线（历史上旧名残留文件曾让守卫全放行，把两天前的旧 agent 静默打进安装包，引发 `fault.command.executionFailed` 协议错位）。

## 上游 sync 后的 rebrand 检查项（合并完成判定的一部分）

1. `git grep -n '\.zcode' -- packages apps`（排除本 spec 列出的读旧兼容清单与注释）无新增命中。
2. `git grep -n 'dist/zcode\.cjs'` 无命中（产物名 split-brain 探针）。
3. `git grep -n '"ZCODE_'` 无新增无 X 前缀 env 名。
4. 重打包前验证 `apps/zcode-cli/packages/cli/dist/zxcode.cjs` 含当次协议改动（本次事故探针：`grep -c toolSearchMode` > 0）。

## 验收场景

1. 打包产物内 `glm/zxcode.cjs` 与 `apps/zcode-cli/packages/cli/dist/zxcode.cjs` md5 一致，且包含最近一次 shared 协议变更的字段。
2. fork 运行期不向 `~/.zcode` 写入任何文件（desktop 日志 `writing settings to` 指向 `~/.zxcode/v2/setting.json`）。
3. host 侧读取 fork CLI 的 config / db / log / usage 证据时路径可达（`~/.zxcode/cli/...`）。
4. 远端 source-server 部署后 `current.json`、`run/status.json`、sessionDb 均落在 `~/.zxcode/server` 树内，server CLI 不进 dataBaseDir 隔离模式。
