# 侧栏项目恢复引导：存量空 projects 表用户的一次性引导

## 背景

3.17.2-ce.1 侧栏换骨架后，项目列表首次直接读 `tasks-index.sqlite` 的 `projects` 表。fork 因
rebrand 切数据根（`.zcode`→`.zxcode`），一批存量用户的首次项目迁移（0005）运行时种子
`lastWorkspaceSession` 为空，`projects` 表种出 0 行；任务行由 CLI 事实冷种子正常重建（未归类）。
结果是侧栏项目区空白、任务区正常——表现为「升级后左侧项目目录变空」，且新建任务因解析不到
项目归属（I17 首次归位只判一次）全部落入任务区。上游 v3.17.2 没有本机引导代码（仅 remote owner
分支按任务目录建项目）；I17 裁决禁止自动建项目（防复活已移除 workspace）。本 spec 定义
**一键式一次性引导**：检测目标态 → 侧栏空态卡片 → 点击卡片即确认恢复全部候选目录
（2026-11-10 拍板由「勾选对话框」简化为一键，入口不得因误点 X 丢失交互成本）。

## 产品规则

- **触发条件**（全部满足才显示横幅）：
  1. 侧栏目录首次读取完成（非 loading、无 error），避免衍生投影瞬时空态误判（localUsageEvidence
     2026-10 误弹事故教训：索引空 ≠ 新用户）；
  2. 本地（`host_id='local'`）未删除项目数为 0；远端入口不参与判定；
  3. 设置 `projectRestoreGuideDismissed !== true`；
  4. 候选目录清单非空（见下）。清单为空则不显示、**不写标记**（保持零成本重评）。
- **候选目录规则**（与 migrate-projects remote 分支同构，但双拼写排除）：
  - 来源：tasks 表 `host_id='local' AND project_id IS NULL AND deleted=0 AND coalesce(cli_deleted,0)=0`
    按 `coalesce(root_path, workspace_path)` 分组；
  - 排除系统会话目录：路径归一反斜杠后 `NOT GLOB '*/.zxcode/workspace/*'` **且**
    `NOT GLOB '*/.zcode/workspace/*'`（0005/0006 存量 migration 只排了 `.zcode`，属 I10 不可变
    残留，本代码不修 migration、自行双排除）；
  - **存在性过滤（2026-11-11 修复，装包实测 bug 1）**：服务层对仓储结果逐路径做
    `readPrimaryRootStatus` 校验，非 available（已删除/不可访问）的目录不进候选——死目录
    不建议、也不可恢复，其任务保留任务区（合法未归类，I17）；仓储层保持纯 SQL；
  - 展示：目录 basename 为默认项目名、任务数；按最近活动倒序。
- **一键恢复**（2026-11-10 拍板，替代勾选对话框）：
  - 点击卡片主按钮 = 确认恢复**全部**候选目录；不做部分勾选（候选即按目录聚合，全量收编
    才能把「项目下新建任务落任务区」的存量状态一次清干净）；
  - 点击即调 `restoreProjects({ paths: 全部候选 })`；恢复中按钮与「不再提示」均禁用；
  - **跳过语义（2026-11-11 修复，装包实测 bug 1/2）**：恢复期目录缺失/不可用**不构成失败**——
    逐路径跳过并在返回值 `skipped` 汇总（missing/unavailable），其余路径照常恢复；
    **部分写入也触发 `state:projects` 广播**（try/finally：只要有写入就广播）——旧实现
    整批 throw 造成「报错但项目已迁入」且当次会话不可见、重启才出现；
  - 成功（含跳过）写 `projectRestoreGuideDismissed=true` 并刷新侧栏树；有跳过时 toast
    提示跳过数（`projectRestore.restoreSkipped`）；卡片随项目非空自然消失，无独立成功 UI；
  - 失败不写标记，卡片内联报错可重试（命令幂等：saveProject reuseExistingRoot 复用未删项目）；
  - 恢复只针对**当前快照**的候选：查询后新增目录随下次启动重评（一次性引导可接受陈旧度）。
- **一次性语义**（`projectRestoreGuideDismissed`，default false，per-install 一次）：
  - 写 `true` 仅两处：一键恢复成功后；用户点「不再提示」（X）。保留永久关闭语义
    （明确不想要项目的用户不被常驻打扰）；
  - 恢复失败不写标记，可重试；
  - 注意：X 关闭后无再入口（无对话框、无常驻菜单入口）；带引导的包尚未发布，公开用户
    setting 中不存在该键，下个正式版首启自然出现引导，无需 re-arm 迁移（2026-11-10 裁决）。
- **恢复动作**：单一 host 命令 `restoreProjects({paths})`——逐 path
  `saveProject({roots:[path], primaryRoot:path, defaultName:basename, reuseExistingRoot:true})`，
  再把该目录下未归类任务整目录归入（`restoreUnclassifiedDirectory`）。
- **I17 合规**：自动部分 = 用户点击卡片即确认（确认前零写入）；归入只改 `project_id`
  （组织态），绝不触碰 cwd、CLI 时间镜像、标题等事实列（I2/I6 红线）。

## 状态所有者

| 状态                           | 所有者                                                         | 写入时机                   |
| ------------------------------ | -------------------------------------------------------------- | -------------------------- |
| `projectRestoreGuideDismissed` | setting.json（settingService）                                 | 恢复成功 / 显式不再提示    |
| 候选清单                       | org 库 tasks 只读派生                                          | 横幅可见时惰性查询，不落盘 |
| 恢复写入                       | `restoreProjects` 单命令（saveProject+整目录归入复用既有仓储） | 用户点击卡片               |

事件顺序：横幅挂载 → 惰性查候选（含存在性过滤）→ 用户点击卡片 → restoreProjects
（逐路径：缺失跳过并记 skipped；有写入即广播 `state:projects`）→ 成功写标记（有跳过
则先 toast）→ 侧栏重读树（跨窗口收敛：项目非空横幅自然消失）；
失败 → 内联报错、标记不写、可重试。

## 验收场景

1. 本机目标态（projects 0 行 + 未归类任务）启动：横幅出现，候选数正确；**已删除目录
   的任务不进候选**（任务保留任务区）；
2. 一键恢复：全部候选目录建项目、任务归入、排序时间不变、标记写入、横幅消失、项目入栏；
3. 恢复中某目录在候选查询后又被删除：该目录跳过（返回 skipped），其余照常恢复、
   **部分写入当次会话即广播可见**、toast 提示跳过数、标记写入、横幅消失；
4. 恢复失败（非目录缺失的意外错误）：内联报错、不写标记、横幅保留；修正后重试成功
   （幂等：reuseExistingRoot 复用）；
5. 横幅「不再提示」：标记写入且不调恢复，重启不出现；此后手动清空项目也不再弹（per-install 一次）；
6. 新装用户（无任务）：无横幅；全部任务已归类：无横幅；
7. 会话目录（`.zxcode/workspace/*` 与 `.zcode/workspace/*` 双拼写）不出现在候选中；
8. 恢复中重复点击无效（按钮禁用）。

## 明确不做

- 不自动建项目（确认前零写入）、不迁移/复活 remote entry、不改 0005/0006 存量 migration 的
  `.zcode` GLOB；
- 不做部分勾选恢复（一键全量，2026-11-10 拍板）；
- 不做 X 关闭后的常驻再入口（无对话框形态；如未来需要，走项目管理页入口专项）；
- 不按用户/设备多实例区分（单一布尔标记）。
