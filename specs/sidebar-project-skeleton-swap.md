# 侧栏换骨架：project-sidebar 项目树架构（v3.17.2 补齐 Phase 3）

## 背景

fork 桌面侧栏是 v3.15 时代旧骨架（`SortableWorkspaceSidebar` + 1928 行 `WorkspaceSidebar.tsx` + `useWorkspaceTaskLists` 第二套任务读取路径）。上游 v3.16.2 起切换到 `project-sidebar/` 项目树架构（v3.17.2 快照 74 文件），两次同步均按域收口保留旧骨架。本次拍板：**整体换骨架，把 fork 功能移植进新骨架，放弃 workspace tab 展开视图**。

上游参考快照：`a9fe401e`。行为参照文档：`docs/superpowers/specs/2026-10-24-project-management.md`（上游仓库自带）。

## 产品规则

- **项目树是唯一组织视图**：视图枚举 `projects / grouped / timeline / unread`（列表头下拉切换，偏好持久化，含旧 organizeBy 迁移）。上游未读视图按更新时间倒序 + 日期分组 + 20 条/页分页，角标与列表同源。
- **设置页新增「项目管理」分区**：搜索/未使用过滤/三种排序/六列表格行（设备 tag、相对时间、疑似可清理黄标）；删除确认弹窗按设备拆分后果、勾选删数据需输入确认词；删除后可撤销 toast；「已删除项目」折叠恢复区。项目节点菜单新增「管理项目…」跳设置。
- **fork 保留功能（移植进新骨架）**：
  - automations 入口 → `TaskGroupedView` 的 `onOpenAutomations`（grouped 工具栏位）。
  - 手机远控（自部署 relay）→ 新骨架 `HomeOnlyWorkspaceRows` 的 homeOnly switcher 挂点接 fork relay 工作区列表；`WebRemoteControlTaskIndex` 形态适配后退役或挂接（以接线成本定，报告说明）。
  - conversations purpose 分区 → 复用上游 `PurposeSections` 模式扩展（fork 的 conversation-purpose tab 时间线保留）。
  - archived 平铺视图 + 「全部清除」→ 上游 `ArchiveManagement` 管理页等价覆盖（fork `DeleteAllArchivedTasksButton` 退役）。
- **放弃（拍板）**：workspace tab 展开视图整块（`WorkspaceSidebarItem` 1207 行 + `useWorkspaceTaskLists` 700+ 行双数据源）；上游裁决「项目树是唯一组织视图，workspace tab 只负责导航与执行目录」。
- **远程设备管理不合并（拍板）**：source-server 域 19 文件不引入；`remoteProjectService.readDirectory` 做最小桩（返回空目录），`readProjectSidebarTree` 走纯本机路径；远程连接向导域（remote-connection-flow）按 UI 依赖最小落地，连接实际不可达时入口降级隐藏或空态（报告说明）。

## 状态所有者与不变量（session-management 红线，全程遵守）

- **单一写者**：CLI 写 db.sqlite（软删/标题/时间镜像）；Host tasks-index 写组织态（`project_id`/pinned/archived/`unread_at`+CAS/`sort_order`/projects/roots/hosts）。侧栏任何组件不得 `Date.now()` 写 `cli_*` 镜像列、不得从 snapshot 推导行存在。
- **I5 行集合**：由 app 库（tasks-index）决定；sessions-index 只补实时字段（phase/lastActivityAt）。上游 `applyProjectTaskActivities` 即此模式，不得反转。
- **I6 排序**：pin/archive/rename/未读不改排序时间；排序时间只取 CLI 创建/活动镜像。fork optimistic overlay 模式保留「不改时间」约束。
- **I7 未读 CAS**：只有 Host 显式 unreadSignal 才制造未读（`useProjectUnreadSignals` expectedUnreadAt/marker）；fork `taskStatusUnreadSync` 的前台补记+防闪烁语义并入新链路时不回退 CAS——手机已读不得被桌面覆盖。
- **I8 标题**：快照永不覆盖 override；rename 走 renameSession 命令→镜像。
- **I9 删除**：删除=CLI 软删除，app `deleted` 是镜像；冷种子/listSessions 必须过滤。
- **I1/I2/I3 workspace 身份**：`workspaceKey = identity||path` 只做隔离，执行路径永远 workspacePath；项目移动只改 project_id，session cwd 永不变；roots 只作 additionalDirectories。
- **I12 手机远控**：bridge/queue/snapshot key 只用 workspaceKey；homeOnly switcher 与 fork relay 数据对接不得引入其他 key。
- **分组裁决**：控制端 Host 唯一持有跨设备分组（`ITaskGroupService`/org database）。fork 旧 grouped 数据（若有落盘）不迁移，接受用户手工重建（分组数据面从 zcodeTaskService grouped view 切到 ITaskGroupService）。
- **ProjectDirectoryProvider 常驻性**：unread 角标与 `countProjectTreeUnreadTasks`→`platform.syncWindowUnreadCount`（托盘角标）挂在 Provider owner（Root 顶层常驻），不随侧栏卸载停更。

## 接口

- `WorkspaceSidebar.tsx` shim 化为 3 行（`export { ProjectSidebar as WorkspaceSidebar } from "@/project-sidebar/index.js"`）；`WorkspaceShellLayout` 顶层包 `ProjectDirectoryProvider`；Root/RootWorkspaceContent/SettingsPage/v4 等 9 处 import 缝合（清单见实现）。
- IProjectService/ITaskGroupService/IRemoteProjectService 经 host overrides 暴露给 renderer accessor；手机远控 Replayable 时侧栏组织服务**不随 attachment 换库**（`overrides.set(IProjectService.channelName, ...)`）。
- `readProjectSidebarTree`（project-tree-reader.ts）：本机 `projectService.readTree({includeDeleted,includeDeletedTasks})` + remote host 并行 readTree（桩=空）+ `mergeProjectTrees`；实时层 sessions-index 只补活动 + windowController 修订号驱动重读 + 未读 CAS。
- services 先对齐上游 `project/`（data/ 重构）；fork 的 `project-storage` 增补 ~500 行保留。
- **创建归属传递（2026-11-11 补记，装包实测 bug 3a 修复）**：项目下新建任务的归属链为
  `startDraft({projectId})` →（首条消息提交）`SessionPane.dispatchCommand` createSession 分支读
  `draftProjectId` → `ConversationTransport.sendCommand(envelope, {projectId})` → RPC params
  `ZCodeAgentConversationCommandParams.projectId`（仅 Host 消费；**绝不进 CLI 可见的 wire
  payload**，I4）→ Host `reserveCreatedTask` 在 CLI 首发前原子写 project_id+bit8。
  显式 `null` = 全局任务。约束：漏传时 Host 按「全局任务」写 NULL+bit8，本地行按 I17
  永不重算归属——任务永久落任务区。刷新后重放以 `clientContext.projectId`（提交时刻快照）
  为准，不读当前草稿。已保存工作流直启/提升（useSavedWorkflowLauncher/useSavedWorkflowPromote）
  同口径：`SavedWorkflowLaunchTarget.projectId`（源自 useSavedWorkflowProjectOptions）。
- **文件树面板挂点（2026-11-11 补记，装包实测 bug 3b 修复）**：`WorkspaceFileTree` 以侧栏内
  覆盖面板形式挂载在 `project-sidebar/index.tsx`（相对容器的第二子层，translate-x 过渡），
  复刻换骨架前 WorkspaceSidebar 的范式。入口统一收口到 `useProjectFileTree`：
  项目/任务「查看文件」（openFiles/openTaskFiles）与 shell 命令式请求
  （`fileTreeOpenRequest`，markdown 目录链接与 Git reveal 走 `openFileTreeRequest`）共用同一
  面板；`props.onOpenFileManager` 外部提供时优先，缺省落到内部面板（此前全仓无提供方，
  「查看文件」是静默 no-op 死按钮）。开合经 `onFileTreeOpenChange` 回传 shell（顶部
  New Task 按钮显隐依赖 `isSidebarFileTreeOpen`）。预览打开沿用旧语义：source 附加目标
  workspace 作用域后走 `onOpenCodeViewer`，不切换当前 workspace。

## 验收场景

1. 桌面侧栏四视图（projects/grouped/timeline/unread）切换、偏好持久化、未读角标与托盘 `syncWindowUnreadCount` 一致。
2. 置顶/归档/未读 CAS 手机+桌面交叉：手机已读不被桌面覆盖；pin/archive 不改排序时间。
3. 项目管理设置页全流程：搜索/过滤/排序、删除确认（勾删数据输确认词）、删除后撤销 toast、已删除区恢复。
4. 虚拟项目分组与 roots 不变量：项目移动只改 project_id；session cwd 不变。
5. 手机远控：relay 工作区列表在新骨架可见可切，workspaceKey 唯一；bridge/snapshot 不串工作区。
6. automations 入口、conversations 分区、ArchiveManagement 管理页可用。
7. 项目下新建任务（含已保存工作流直启/提升）：任务出生即在项目折叠下（tasks.project_id
   实证），刷新后重放归属不变；全局新建任务显式落任务区。
8. 门禁：分包 tsc（删 tsbuildinfo）零新增错；desktop main/host tsc 错误文件集合与基线零新增；`pnpm architecture:check --changed` 通过；`pnpm test:engineering` 相关包绿；CDP 冒烟覆盖侧栏四视图+手机远控链路。

## 明确不做

- workspace tab 展开视图、`useWorkspaceTaskLists`、`DeleteAllArchivedTasksButton`（退役删除）。
- source-server 连接管理/远程设备页/数据同步设置面（剔除域，只留最小桩）。
- `activity/` 子目录（上游已删）、fork 旧骨架文件的兼容层。
