# 上游同步策略（fork 维护）

本仓库是 `zai-org/ZCode` 的长期定制 fork（origin = `nnnnYue/ZxCode`）。本 spec 约束每次从上游同步代码的方式与判据，避免定制内容被覆盖或上游功能被误剔除。

## 产品规则

- 同步方式：**分支 + `git merge upstream/main`**。上游 remote 固定为 `upstream = https://github.com/zai-org/ZCode.git`（fetch 其 `main` 分支）。禁止用 rebase 重放定制历史、禁止在 `main` 上直接试验合并。
- 同步节奏：上游每发布一个版本即合并一次，不攒批。每个同步在历史中表现为一个 merge commit；"合并时主动剔除上游功能"必须拆成合并后的**独立 commit**，与合并提交分离，保证剔除项在历史中可查。
- 合并冲突判据（按序裁定）：
  1. 上游改动落入 [REMOVALS.md](../REMOVALS.md) 任一类别（账号登录、平台运行时调用、自动更新、遥测上报、指纹上报、相关依赖）→ **keep-ours**，维持剔除状态；上游对已删文件的新增修改用 `git rm` 保持删除。
  2. 品牌与外链（Z 品牌位图、启动/关于页标志、外链指向 `ZXCODE_RELEASES_URL` 等 GitHub Releases）→ **keep-ours**。
  3. 其余改动（workflow、编辑器、协议演进、修复等）→ **取上游版本**，再叠加本地适配；本地适配放在合并 commit 的冲突解决内完成。
- 路径/产物名/env 名的 rebrand 一致性按 [zxcode-path-consistency.md](./zxcode-path-consistency.md) 裁定：`dist/zxcode.cjs` 产物名、`.zxcode` 数据目录、`ZXCODE_*` 变量名均属品牌项（keep-ours），合并完成后执行该 spec 的 4 项探针检查。
- CDN 类活请求为**产品保留项**：远程资源 CDN（`cdn-zcode.z.ai`，`packages/desktop/src/main/remoteCdn.ts`）与官方插件市场 CDN 下载（`packages/desktop/resources/official-marketplace/`）保留，不随上游演进剔除；但不得借机新增对 `zcode.z.ai` 平台运行时（登录、用量、分享等 REMOVALS 领域）的调用。

## 状态所有者与接口

- 品牌保护文件清单的唯一所有者：`.gitattributes` 中 `merge=zcode-brand` 段。当前保护：`packages/ui/src/assets/zcode-logo.png`、`packages/desktop/src/renderer/startup-logo.png`、`packages/web/startup-logo.png`、`packages/desktop/src/main/aboutWindowLogoDataUri.ts`。
- 合并驱动是 clone 级配置，每个新 clone 需执行一次：`git config merge.zcode-brand.driver true`。该驱动仅在合并双方都改动同一文件时生效；上游删除/改名保护文件仍需按上述判据手工裁定。
- z.ai 相关端点常量唯一汇聚点：`packages/shared/src/zcodeEndpoint.ts`；远程资源 CDN 基址另见 `packages/desktop/src/main/remoteCdn.ts`（保留项）。
- 回潜门禁：`scripts/check-no-zai-runtime-endpoints.mjs` 扫描运行时代码中的 z.ai 平台端点字面量，纳入 `pnpm verify:pre-push`；允许清单仅含产品保留项（内置模型 Provider 配置、CDN 保留项、文档、构建脚本）。
- `pnpm-lock.yaml` 冲突固定解法：先解决 `package.json`，锁文件整体取上游版本后运行 `pnpm install` 重新生成，禁止手工合并锁文件。

## 不变量

- `main` 历史不被 rebase 重写；每个同步为一个 merge commit，剔除项为独立 commit。
- 合并双方都改动品牌保护文件时，结果一律为本仓库版本。
- 合并完成的判定：分包 tsc 按[类型基线](#desktop-类型基线2026-11-09)门禁执行（desktop 子包以错误数零新增为准，勿直接用根级 `pnpm typecheck`——desktop 存量红与根级 OOM 已知）、`pnpm lint`、`pnpm architecture:check --changed` 全部通过，且回潜门禁脚本通过，方可将同步分支 fast-forward 回 `main`。

## 验收场景

1. 执行一次上游合并后：REMOVALS.md 六大类领域无代码回归（门禁脚本通过；grep 无登录/遥测/自动更新符号复活）。
2. 上游与本地同时修改任一品牌保护文件时，合并结果保留本地版本，无需人工干预。
3. 合并后锁文件由 `pnpm install` 重新生成，本地新增依赖（如 CodeMirror）与上游新增依赖同时可用，typecheck 通过。

## 补齐批次（2026-11-07，v3.17.2）

合并域级回退导致的可视缺口按五阶段补齐工程回收（`4aa059db`…`11c5556f`，基线上游快照 `a9fe401e`）：Phase 1 纯 UI 低风险批、Phase 2 九个中等专项（2a–2i）、Phase 3 侧栏整体换 project-sidebar 骨架（`specs/sidebar-project-skeleton-swap.md`）、Phase 4 Electron 44 转正、Phase 5 定案落档（REMOVALS.md 第十节）。方法论沉淀：上游 hunk 逐段摘取适配 fork 基线（禁整文件替换）、分包 tsc 删 tsbuildinfo 后跑（根级 OOM 已知）、desktop tsc 以错误文件集合零新增为门禁、每批独立 commit 过 architecture:check --changed。后续同步遇到同类缺口按此法逐批补齐，剔除域判定以 REMOVALS.md 第十节定案为准。

## desktop 类型基线（2026-11-09）

v3.17.2 合并遗留的 desktop 1514 个 tsc 错按两层专项清偿（`a20a7e17` renderer 声明链、`66cb3fbb` e2e 基建），当前基线以分包 tsc（删 tsbuildinfo 后跑）为准：

| 分包                     | 基线   | 构成                                                                                                                                                       |
| ------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.renderer.json` | **0**  | 声明经 `@zcode/client/globals` type-only import 进程序；globals.d.ts 已按 preload 实测补齐                                                                 |
| `tsconfig.e2e.json`      | **0**  | `#e2e/*` subpath imports 已恢复；helpers 按「现存测试引用的最小闭包」自 a9fe401e 恢复/对齐                                                                 |
| `tsconfig.main.json`     | **67** | 存量定性见 `ad49abe4`：上游功能「类型层已进、实现层未合」（source-server 连接/任务全局历史/runtime-config 等），挂账随上游功能合并专项清偿，禁止零新增恶化 |
| `tsconfig.host.json`     | **6**  | 同上                                                                                                                                                       |

门禁口径：desktop 四分包错误数合计 **73** 为基线，同步/补齐批次只允许降不允许升（此前口径为「错误文件集合零新增」，本表起改为按分包错误数记账）。renderer 的 `window.zxcode` 声明唯一入口是 `desktopPlatform.ts` 顶部的 `import type {} from "@zcode/client/globals"`，禁止改为值导入（vite 运行时解析 .d.ts 会失败）。e2e 基建附带事实：`VITE_ZXCODE_E2E_STORE_BRIDGE` 为 fork 品牌拼写（读取侧 rebrand 在先），新引入注入侧行一律用 ZXCODE\_ 拼写；wdio 单 spec 冒烟已验证 `#e2e` 运行时解析与 session store bridge 安装，workspace-ready 级别的用例验收属 e2e admission 专项（另见 e2e-case-lifecycle 技能）。
