# 文件预览编辑

## 产品规则

- 左侧文件树点击文件后在右侧预览（side pane code-viewer tab）。预览工具栏 more（三个点）按钮左侧提供「编辑」按钮：
  - 点击「编辑」后文件进入可编辑状态，按钮变为「保存」；
  - 点击「保存」将内容写回磁盘，成功后回到预览状态，按钮变回「编辑」；
  - 编辑期间 Cmd/Ctrl+S 等价于点击「保存」。
- 有未保存改动（脏）时关闭文件（tab X / 中键 / 右键菜单 / Cmd+W / 预览自身关闭按钮 / 关闭其他与全部标签页）弹确认框三选：保存并关闭 / 直接离开 / 取消。脏状态下同一文件被重复打开（原位刷新 source）前同样拦截。
- 编辑态退出方式只有三种：保存成功、more 菜单「放弃更改」、关闭确认框选「直接离开」。header 不提供第三个按钮。
- 可编辑条件（全部满足才显示编辑按钮）：
  - `source.type === "file"` 且有 path；
  - 本地 workspace（远程 SSH/WSL source 第一期隐藏编辑入口）；
  - workspace 可写（只读工作区隐藏）；
  - 纯文本：非图片 / PDF / Office / PPTX / 媒体，读取结果非二进制，且未因超过 `FILE_VIEWER_MAX_TEXT_BYTES`（256KB）被截断。
- 保存语义为以编辑器内容整体覆盖磁盘文件；第一期不做 mtime 冲突检测（编辑期间文件被 agent / 外部程序修改时，保存以编辑器内容为准）。

## 状态所有者与接口

- 编辑状态（`editing` / `baseline` / `draft` / `saving`）唯一属于 `packages/ui/src/PreviewPane.tsx` 顶层 state，生命周期跟随 source（切换 source 即重置）；side pane tab state（`workspaceSidePane.ts`）与 `taskSidePaneMemory` 不存编辑内容。
- 写盘接口：`IFileService.writeTextFile({ path, content })`（`packages/services/src/file/file.ts`），由 `fileService.ts` 落盘；调用方经 `useWorkspaceServices` 按 workspace scope 路由。
- 未保存守卫登记：`packages/ui/src/store/previewEditGuardStore.ts` 按 side pane tab id 登记 `{ isDirty, save }` 回调；draft 本体仍在 PreviewPane，store 只持有守卫回调。
- 关闭拦截：`packages/ui/src/hooks/useAppPanels.ts` 的用户关闭/复用入口（`handleCloseSidePaneTab`、`handleCloseCodeViewer`、`handleOpenCodeViewer` 复用分支、closeOther/closeAll）先经守卫确认再提交状态变更。
- 确认框：`confirmDialogStore.requestChoice` 三选（confirm=保存并关闭 / discard=直接离开 / cancel|dismiss=取消）。

## 不变量

- 守卫覆盖所有移除 code-viewer tab 或原位替换其 source 的用户路径；生命周期自动清理（stale tab、父任务结束、浏览器联动）不拦截。
- 保存失败时保持编辑态，draft 不丢失，关闭仍被拦截。
- 不可编辑类型不显示编辑按钮；只读工作区与远程 workspace 不显示编辑按钮。
- 编辑态下 markdown/svg 视图切换不可用（强制源码），code comment 选区禁用。

## 验收场景

1. 纯文本文件：编辑 → 按钮变保存 → 修改内容 → 保存 → 回预览态、磁盘内容更新、文件树/git 状态经既有 watcher 刷新。
2. 脏状态点 tab X：弹三选框——「保存并关闭」写盘后关闭；「直接离开」丢弃并关闭；「取消」留在编辑态。
3. 脏状态在同一文件上触发重复打开（原位刷新 source）：先弹三选框，确认后才刷新。
4. 保存失败（如目录只读）：toast 错误、保持编辑态，关闭仍被拦截。
5. 不可编辑类型（PDF / 图片 / Office / PPTX / 媒体 / 二进制 / 截断大文件 / 无 path source / 远程 / 只读工作区）：不显示编辑按钮。
6. 编辑态 Cmd/Ctrl+S 触发保存；预览态不拦截系统快捷键。
7. more 菜单「放弃更改」：draft 丢弃并回到预览态，磁盘不变。
8. 「关闭其他标签页 / 关闭全部」包含脏 code-viewer tab 时逐个确认。
