# Composer 模型选择样式对齐上游（specs/composer-model-menu-upstream-style.md）

## 背景

3.16.2 合并时 composer 工具栏/模型选择一套文件「取低错误侧」，上游新样式（合并式模型菜单、
渐变思考强度滑条、provider/连接二级菜单）整个未进入 fork。用户决策：补齐样式层；
plan 权益/用量商业化层（额度圈、团队商品、升级漏斗、配额重置）fork 有意剥离，继续不引入。

## 产品规则

- 模型选择入口仍是 composer 工具栏上的模型触发器；新样式为「合并菜单」：provider/连接、
  模型列表、思考强度（离散滑条，含 Highspeed 气泡动效）在一个弹层内完成。
- 思考档位仍是离散档（不引入连续滑条）；档位候选只来自目标 Host 的 ModelSelectionView。
- 连接切换（provider/plan 二级菜单选中）复用上游 `useComposerConnectionSwitch` owner：
  pending 期间禁选、失败可重试、展示以 presentation revision 为准。
- 其他 `ModelConfigSelect` 使用点（设置 Subagents、自动化编辑、工作流配置弹层）不传
  `composerOptions`，交互保持原样（上游 props 是 fork 用法的超集，向后兼容）。
- 上下文用量圈保持 fork 现状（`contextUsage.tsx` 不取上游）：不显示 coding plan 剩余额度、
  start plan 余额、配额重置入口；相关 props 在调用点不传。

## 状态所有者

| 状态                         | 所有者                                          | 说明                                      |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------- |
| 菜单开合、picker 排他        | `activeConfigPicker`（renderer-local，同现状）  | 不变                                      |
| 连接切换 pending/错误        | `useComposerConnectionSwitch`（新增，上游原样） | owner/lease：pending 期间 toolbarDisabled |
| 模型/思考选择 intent         | Composer owner（`ConversationComposer`，不变）  | toolbar 只消费投影                        |
| plan 权益 snapshot、团队商品 | 不引入（fork 剥离）                             | `subscribedTeamProducts` 恒为 `[]`        |

## 接口与文件

- 整取上游：`ModelConfigSelect.tsx`、`chat-input-toolbar/{ComposerModelMenu,ComposerEffortHeading,ComposerProviderMenu,ComposerTriggerTransition}.tsx`、`composer-thought-slider.css`、`{thoughtLevelLabels,modelSelection,display,display-help,thoughtLevelOptions,ThoughtLevelCycleControl,ChatModeSwitchControl}.ts(x)`、`lib/composerPlanGroups.ts`、`lib/teamPlanDisplayName.ts`、`lib/providerFamilyConnectionTransition.ts`、`hooks/useComposerConnectionSwitch.ts`、`ControlShortcutBadge.tsx`、`components/ui/dropdown-menu.tsx`（SubTrigger 增加可选 indicator 插槽）。
- 保留 fork 版：`lib/modelSelectionGroups.ts`（fork 已下线账号型 Provider，分组不再有 account presentation 与 labels 通道）与 `chat-input-toolbar/contextUsage.tsx`（用量圈现状）。
- 适配（fork 数据模型/服务面差异）：
  - `composerPlanGroups.ts`：删除 zhipu-account「未激活个人套餐」回补分支（fork 无账号型 Provider）；`buildComposerPlanGroups` 签名去掉 `agentProvider`/`labels` 形参；团队商品由调用方传 `[]`。
  - `V4ComposerToolbar.tsx`：剥离权益/用量簇（useCodingPlanEntitlements、useEnterpriseCodingPlanProducts、useUsageEntitlement、CodingPlanUpgradeDialogProvider、codingPlanFunnelTelemetry、codingPlanUsageSources、sidebarUsageCodingPlanProviderPreference、accountProviderAccess、StartPlanContextBalance、CodingPlanContextUsage 与三个本地 plan 连接解析 helper）；`ZCODE_AGENT_PROVIDER` → fork 的 `ZXCODE_AGENT_PROVIDER`；`ModelSelectionState` 无 `catalog`/`refreshError`，菜单可用性退回 `status === "ready"` 门控、连接切换不传 presentationErrorRevision；`useSettings()` 走全局 services（fork 版不支持 workspace 级注入）。
  - `useComposerConnectionSwitch.ts`：`useSettings({services})` → `useSettings()`。
- 不取上游：`contextUsage.tsx` 及整个配额重置/升级弹窗/账单折扣族；其孤儿依赖 `contextPanelAction.ts`/`contextQuotaMeterGrid.ts` 不引入。

## 验收场景

1. composer 弹层为合并菜单：模型分组、provider/连接二级、思考强度滑条（渐变轨道+白色滑块）、
   Highspeed 激活时锁定模型并展示倒计时。
2. Ctrl+M / Ctrl+T 热键行为不变；Ctrl+Shift+M 模式循环不受影响。
3. 设置页 Subagents、自动化编辑、工作流配置弹层的模型选择交互与合并前一致。
4. 个人 coding plan（bigmodel/zai）连接分组正常显示与切换；团队商品区不出现（fork 无该数据面）。
5. 上下文用量圈显示行为与合并前一致（无额度数字、无重置入口）。
6. `pnpm typecheck`（ui 包）与受影响单测通过。
