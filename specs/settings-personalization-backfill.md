# 设置页「个性化」（用户自定义指令）补齐

## 背景

上游 v3.17.x 新增设置页「个性化」分区（Agent 能力组第一项，编辑用户级自定义指令）。
v3.17.2 同步时 UI 组件随 ui 域收口整体回退，但服务端实现已在类型缝合时有意保留：

- `packages/services/src/setting/settingService.ts` 的 `getUserInstructions()` /
  `saveUserInstructions()`（含写队列排空语义），接口声明在
  `packages/services/src/setting/setting.ts`；
- 事实源文件路径已按 fork 品牌落位：`~/.zxcode/AGENTS.md`
  （`packages/services/src/paths.ts` `getAgentUserInstructionsFilePath`）；
- 100KB 上限常量 `USER_INSTRUCTIONS_MAX_BYTES`（`packages/shared/src/userInstructions.ts`）；
- i18n 双语文案（`settings.personalization.*`）已随 locale 并集带入。

本 spec 记录补齐 UI 层的产品规则与验收。上游设计细节见
[docs/ui/settings-personalization.md](../docs/ui/settings-personalization.md)（其中
`~/.zcode` 路径以 fork 的 `~/.zxcode` 为准）。

## 产品规则

- 设置页侧栏「Agent 能力」组**第一项**「个性化」，位于「记忆」之前；单层直达，
  点击即进入编辑器，无列表 → 二级页跳转。
- 编辑器读写的唯一事实源是 `~/.zxcode/AGENTS.md`（CLI `resolveUserInstructions`
  的 user scope 指令源）；不新增存储、不加协议命令。文件缺失等价于未配置。
- 仅桌面本地入口可编辑（`isDesktop`）；Web 端与手机远控只显示「前往本地桌面端设置」
  指引，不发起任何读写（远程 Source 的 settingService 指向远端机器，编辑会写错机器）。
- 显式「保存/取消」：保存仅脏态且未超限可用，取消丢弃修改恢复基线；
  `Ctrl/Cmd+S` 与保存按钮等价；超 100KB（UTF-8 字节）阻断保存并提示。

## 状态所有者与接口

- 表单状态（草稿/基线/在途保存）唯一所有者：`PersonalizationSection.tsx` 的模块级
  zustand store，组件卸载不失活——保存中切走分区后失败草稿可重进重试；
  文件被外部改动（不再等于基线）时文件优先。
- 双层失效边界：`generation` 绑定 settingService 实例身份（连接边界，实例变化整体
  重置）；`loadRequestId` 标记每次读取（请求边界，迟到旧读取不得覆盖新草稿/基线）。
  `beginSave` 同时使在途读取失效（保存后返回的读取是旧快照）。
- 读写接口：`ISettingService.getUserInstructions()`（读取前排空写队列，文件缺失返回
  空串）/ `saveUserInstructions(content)`（服务端 FIFO 排队 + 原子锁 + 私有权限写入，
  超限抛 `user_instructions_too_large`）。

## 不变量

- UI 不持有第二份持久化状态：文件是唯一事实源，store 只承载编辑期草稿。
- 不读取/写入 `~/.zcode`（上游路径）；一切路径经 `getAgentUserInstructionsFilePath()`。
- Web/手机远控路径零 IO：未连 bridge 的 stub 抛 unsupported 仅作防御，不作为功能路径。

## 验收场景

以 `packages/desktop/test/e2e/settings/settings-personalization.test.ts` 为准（上游
用例已随 e2e 域收进 fork）：

1. 「个性化」是 Agent 能力组第一项；点击直接出现编辑器（无二级页、无卡片）。
2. 首次进入文件不存在时显示空编辑器；输入不落盘，保存后才创建文件。
3. 离开再进入内容回显（文件为唯一事实源）；取消丢弃修改、文件不变。
4. 清空保存后文件被清空。
5. 超 100KB（含多字节字符）保存被阻断并提示，回到限内恢复。
6. 未保存草稿跨分区切换存活；保存 in-flight 时切走分区、写入失败后重进草稿恢复且可重试。

工程门禁：`pnpm typecheck`（不新增错误）、`pnpm lint`、
`pnpm architecture:check --changed` 通过。
