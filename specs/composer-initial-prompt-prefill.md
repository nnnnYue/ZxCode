# Composer initialPrompt 预填合同（root 写入 ↔ composer 读取）

2026-11-14 创建。修复「创建插件」点击后秒退回对话页、预填丢失的断链；本文件是 root 侧
新建任务预填写入 composer 草稿的唯一合同，防止下次上游合并再劈叉。

## 背景与根因

- 症状（真机复现，安装版 3.18.0）：插件市场「创建插件」→ 切回聊天页、草稿会话创建、
  composer 聚焦，但预填文本（`$plugin-creator ` mention）从未出现在 composer。
- 根因：v3.18.0 合并（de3051cf）把写侧 `useRootWorkspaceActions.ts` 留成 fork 旧版
  （`persistV4ComposerDraft` 不传 scope → 写 per-workspace key + 裸 `__draft__`），
  读侧（`useDraftConfigControl.ts` / `SessionPane.tsx`，fork bug 3a 设计）统一带
  `resolveComposerScope(null, workspaceIdentity)` 读 project key。写读 key+scope 不一致，
  且 fallback 仅 `scope.projectId` 非空才认领旧 key → 预填永远读不到。
- 上游（b95ebaff 起）无此断链：其 `startDraftInWorkspace` 写读两侧都构造同一 scope。

## 合同

1. **唯一事实源**：新建任务的 initialPrompt 预填通过 composer 草稿持久化传递，
   key = project 草稿 key（`zcode-v4-composer-project-drafts:v1:<composerScopeKey>`），
   scope id = `__draft__`（V4_DRAFT_SCOPE_ROOT）。
2. **写读同 scope**：root 侧写入（`persistV4ComposerDraft`）与 composer 侧读取
   （`readV4ComposerDraft`）必须传**同一个** `resolveComposerScope(null, workspaceIdentity)`
   结果。fork 的 bug 3a 设计（草稿归属恒 null projectId，不经 ComposerScope 记忆）不变。
3. **即时插入仅是优化**：`requestComposerTextInsert` 只为「当前已挂载 composer 立即可见」；
   其接线守卫（`SessionPane` 的 `focused && sessionId === null`）与上游逐字节一致，
   不得为修预填而放宽——remount/首次挂载都从草稿事实源恢复。
4. **不做兜底堆叠**：禁止用超时重试、双写双读兼容等手段掩盖写读不一致。

## 影响入口（全部走 Root.handleCreateTask → startNewTaskFromActiveWorkspace，一次修复全覆盖）

插件市场「创建插件」（usePluginCreator/pluginCreatorPrefill）、插件详情示例提示词
（PluginStorePage/PluginsSection 的 buildPluginStoreTryPrompt）、SkillsSection 试用、
自动化入聊（handleCreateAutomationInChat）、动态工作流 settlement.promptText 回填、
扩展 `workbench.startDraft`（App.tsx）。

## 验收

1. `packages/desktop/test/e2e/plugins/marketplace/plugin-localization-creator.test.ts`
   的 `expectCreatorDraft`：composer 可见文本含 `$plugin-creator`、含 `SKILL.md)`、
   尾空格、聚焦、不自动发送；并**加一条** localStorage 硬断言——
   `zcode-v4-composer-project-drafts:v1:<scope>` 的 `scopes["__draft__"].text`
   含 `$plugin-creator`（把「写读同 key」钉进验收）。
2. E2E helper `conversation-session-store.ts` 的 draft 态快照读 project key
   （与实现同步，修复前该 helper 与实现已断裂）。
3. 回归：conversation-session-composer-recent-mode / model-provider-plan-surface
   （断言 project-key 前缀）/ composer-draft-switching 等 E2E。
4. 工程门禁：`pnpm typecheck`、`pnpm lint`（Oxlint hooks 规则复核）。

## 附带修复（同域 i18n 断链）

`PluginsSection.tsx` 两处 `settings.plugin.plugins.browse`（5 个 locale 均无定义，
按钮显示 key 原文）改回上游 key `chat.plugins.browseMarketplace`（locale 已有定义）。
