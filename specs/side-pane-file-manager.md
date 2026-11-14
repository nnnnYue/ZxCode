# Side Pane 文件管理面板（file-manager tab）

左侧任务列表「查看文件」（`workspaceSidebar.showFileTree`）打开的是右侧 Side Pane 的 `file-manager` tab。本 spec 固化它的渲染契约与数据链路；v3.18.0 上游合并曾把 fork 收口期剔除的 `FileManagerPane` 以空占位形式带回（面板打开后全白），2026-11-14 已恢复，本 spec 防止再次合并回退。

## 产品规则

- `file-manager` tab 必须渲染 `packages/ui/src/workspace-file-tree/FileManagerPane.tsx`（对照上游 b95ebaff 的 `FileManagerPane`）：左侧目录树（`WorkspaceFileTree`，无"返回任务"按钮）+ 右侧预览（`PreviewPane`）+ 可拖拽分隔线。
- `plugin-market` / `new-tab` 两类 tab 保持空占位，不在本 spec 范围。
- `code-viewer` tab 在 fork 保持独立 `PreviewPane` 渲染（fork 有自己的 `onCloseCodeViewer` 行为），不并入 `FileManagerPane`；上游把两者合并渲染，合并时此处属 fork 行为 keep-ours。
- fork 的 `PreviewPane` 无 `headerContainer`（header 自渲染），`FileManagerPane` 顶栏仅承载空态标题 `fileManager.title` 与目录显隐切换，不做 header portal。

## 状态所有者与接口

- tab 数据所有者：`packages/ui/src/lib/workspaceSidePane.ts`（`FileManagerSidePaneTab`：`target: FileManagerTarget`、`source: CodeViewerSource | null`；`openFileManagerSidePane` / `navigateFileManagerSidePane`）。
- 打开入口所有者：`packages/ui/src/hooks/useAppPanels.ts`（`handleOpenFileManager`；跨 workspace 走 `requestFileManager` → `pendingFileManagerTarget` effect）。project-sidebar 的覆盖面板（`b74a6271` 兜底）在桌面 shell 下是死代码——shell 恒提供 `onOpenFileManager`，但保留作 web/无宿主兜底。
- 目录导航回调：`App.tsx` 传 `handleNavigateFileManager` → `WorkspaceShellLayout` 解构并转发 `onNavigateFileManager` → `AnimatedSidePanePanel`；点文件换预览、xlsx 等 office 文件分流到查看器 tab（`routeOfficeViewerFile`）。
- 目录显隐偏好所有者：`packages/ui/src/store/index.ts` `fileManagerNavigationOpenByWorkspace`（localStorage key `zcode-file-manager-navigation-preferences`，按 workspaceKey 记忆）。
- `WorkspaceFileTreeProps.onClose` 可选：侧栏内嵌场景传（显示"返回任务"），`FileManagerPane` 不传（不渲染）。

## i18n

`fileManager.title` / `fileManager.empty` / `fileManager.showNavigation` / `fileManager.hideNavigation` / `fileManager.resizeNavigation` 五键必须五个 locale 齐全（`SidePaneTabTrigger` 的 tab 标题引用 `fileManager.title`，缺键时 tab 名显示原始 id）。

## 验收场景

1. 任务列表项目「查看文件」→ Side Pane 出现 `file-manager` tab，左侧目录树列出 workspace 文件（不再空白）。
2. 点文件 → 预览区加载；点 `.xlsx` → 分流到 office 查看器 tab。
3. 顶栏切换按钮可收起/展开目录树，偏好按 workspace 记忆（重开面板保持）。
4. tab 标题显示"文件"（非 `fileManager.title` 原文）。

## 回归 fixture

`packages/ui/test/browser/manual-review/pending/side-pane-file-manager.test.mjs`（SFM-1/SFM-2，node --test 直跑）：SFM-1 断言 file-manager tab 渲染 `FileManagerPane` 与目录树桩、不落空占位、i18n 文案生效；SFM-2 断言目录导航经 `onNavigateFileManager` 贯穿到 tab.source 更新。项目行入口的防呆（死目录 `primaryRootStatus` 禁用「查看文件」按钮）属 project-sidebar 既有逻辑，不在本 fixture 范围。
