# 官方插件市场内容移除名单

## 产品规则

- 官方插件市场随包快照（`packages/desktop/resources/official-marketplace/`）中，下列插件已产品下架，不得以任何形式随包分发或展示：
  - `run-fpa`（经营分析）、`vet-companies`（企业尽调）、`assess-credit`（固收研究）
  - `pick-funds`（基金研究）、`find-clients`（对公获客）、`watch-positions`（持仓跟踪）
  - `model-deals`（交易测算）、`read-macro`（宏观阅读）、`write-research`（研报写作）
  - `finance-search`（金融搜索）、`hexin`（同花顺）、`tianyancha`（天眼查）、`wind`（万得）、`video-agent-kit`（视频代理套件）
- 下架原因：这些插件的数据能力挂载在 `${ZXCODE_BASE_URL}/api/v1/mcp/server/*`（默认解析为 `https://zcode.z.ai`）官方 MCP 端点上（前 9 个为全部能力挂载；`video-agent-kit` 仅官方语音通道挂载、缺 env 时可降级），随产品移除对 `zcode.z.ai` 的运行时依赖一并下架（见 [REMOVALS.md](../REMOVALS.md)）。
- 引用下架插件的**产品推荐语料**同步下架：`packages/ui/src/v4/featureSuggestedPrompts.ts` 中引用名单内插件的推荐提示词条目（含 `plugin.stableId` 指向或 prompt 正文引用）不得保留，避免 UI 推荐不可用的插件。
- 名单是**永久下架**而非版本回退：CDN 目录后续即使继续提供这些插件，重新生成快照也不得恢复。

## 状态所有者与接口

- 唯一所有者：`scripts/fetch-official-marketplace.mjs` 的 `REMOVED_PLUGIN_NAMES`。脚本在下载 CDN 目录后、计算 payload 哈希与 staging 之前过滤名单条目，因此 manifest、bundled seed 条目、UI 图标映射三份产物天然不含名单内插件。
- 快照产物（均由脚本生成或落盘，手工编辑仅限本次一次性清理）：
  - `packages/desktop/resources/official-marketplace/plugins/<name>/<version>/`（解压目录）与 `.staged-*.json`（staging 标记）
  - `packages/desktop/resources/official-marketplace/manifest.json`（构建期清单，运行时不读取）
  - `apps/zcode-cli/packages/bootstrap/src/app/official-marketplace-offline-entries.ts`（生成文件）
  - `packages/ui/src/lib/officialPluginIcons.generated.ts` 与 `packages/ui/src/assets/plugin-icons/official/<name>.png`（生成映射与图标）
- 运行时行为：bundled seed 的 `rootCandidates` 指向随包目录，目录缺失时条目自动跳过（见 `electron-builder.config.js` 官方市场快照注释）；商店展示走条目 `listing`，图标走本地映射。因此条目删除即商店完全不可见，无需额外运行时开关。

## 不变量

- `REMOVED_PLUGIN_NAMES` 内的 name 不得出现在 manifest `entries` / `icons`、两个生成文件、随包解压目录与图标 png 中。
- 重新运行 `node scripts/fetch-official-marketplace.mjs` 不得重新下载、staging 或恢复名单内插件的任何产物。
- 其他市场插件的文档中可能出现对名单内插件的文字提及（如 accounting-and-reporting 对 `run-fpa` / `write-research` 的分工说明），属于该插件自身提示词内容，不构成本名单约束的对象；随上游 zip 更新会被覆盖，不做守护。
- 名单外仍依赖 `${ZXCODE_BASE_URL}` 的随包内容：无（名单已覆盖市场内全部官方 MCP 端点依赖方）。

## 验收场景

1. 打开设置 → 插件商店页：搜索上述 14 个插件名，均无结果；商店其余插件展示与安装不受影响。
2. 全仓库检索 14 个插件名：除本 spec、`REMOVED_PLUGIN_NAMES` 名单与其他插件自身文档提及外，无任何残留。
3. 新开工作台查看推荐提示词（office / coding 两模式）：不出现引用名单内插件的条目。
4. 重新运行 fetch 脚本（可访问 CDN 时）：脚本跳过名单内条目，manifest 与生成文件中不出现它们，已删除的目录与图标不被重建。
