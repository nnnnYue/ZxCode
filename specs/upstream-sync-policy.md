# 上游同步策略（fork 维护）

本仓库是 `zai-org/ZCode` 的长期定制 fork（origin = `nnnnYue/ZxCode`）。本 spec 约束每次从上游同步代码的方式与判据，避免定制内容被覆盖或上游功能被误剔除。

## 产品规则

- 同步方式：**分支 + `git merge upstream/main`**。上游 remote 固定为 `upstream = https://github.com/zai-org/ZCode.git`（fetch 其 `main` 分支）。禁止用 rebase 重放定制历史、禁止在 `main` 上直接试验合并。
- 同步节奏：上游每发布一个版本即合并一次，不攒批。每个同步在历史中表现为一个 merge commit；"合并时主动剔除上游功能"必须拆成合并后的**独立 commit**，与合并提交分离，保证剔除项在历史中可查。
- 合并冲突判据（按序裁定）：
  1. 上游改动落入 [REMOVALS.md](../REMOVALS.md) 任一类别（账号登录、平台运行时调用、自动更新、遥测上报、指纹上报、相关依赖）→ **keep-ours**，维持剔除状态；上游对已删文件的新增修改用 `git rm` 保持删除。
  2. 品牌与外链（Z 品牌位图、启动/关于页标志、外链指向 `ZXCODE_RELEASES_URL` 等 GitHub Releases）→ **keep-ours**。
  3. 其余改动（workflow、编辑器、协议演进、修复等）→ **取上游版本**，再叠加本地适配；本地适配放在合并 commit 的冲突解决内完成。
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
- 合并完成的判定：`pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 全部通过，且回潜门禁脚本通过，方可将同步分支 fast-forward 回 `main`。

## 验收场景

1. 执行一次上游合并后：REMOVALS.md 六大类领域无代码回归（门禁脚本通过；grep 无登录/遥测/自动更新符号复活）。
2. 上游与本地同时修改任一品牌保护文件时，合并结果保留本地版本，无需人工干预。
3. 合并后锁文件由 `pnpm install` 重新生成，本地新增依赖（如 CodeMirror）与上游新增依赖同时可用，typecheck 通过。
