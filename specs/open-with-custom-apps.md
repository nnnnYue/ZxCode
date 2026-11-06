# Open-with 自定义应用

## 产品规则

- 入口：workspace 顶部「选择打开方式」下拉（`WorkspaceEditorButtonGroup`）末尾新增「选择应用程序…」项，点击弹出系统文件对话框（macOS 选 `.app` bundle，Windows 选 `.exe`），确认后注册为自定义打开方式并立即成为当前选中项（仅选中，不自动打开 workspace）。
- 自定义应用条目行尾带删除按钮，点击即删（无确认弹窗）；删除的恰是当前选中项时，选择回退到可用列表第一项。
- 自定义应用全局生效：合并在 `GetInstalledEditors` 通道返回值里，文件树、任务右键、消息内 open-with 等所有消费 `getInstalledEditors()` 的菜单自动可见。
- 选择记录沿用现有 `zcode-last-editor-id` localStorage（显式选择才持久化），不新增第二份选中态。
- 作用范围：仅桌面端（macOS / Windows）。Web / Linux 平台不提供该能力（`IPlatformService` 可选方法 + 能力探测隐藏入口）。
- Office 模式下隐藏「选择应用程序…」（该模式只展示文件管理器，新加应用不可见，避免误导）；远程 workspace（SSH/WSL/Docker）下自定义条目被现有 id 白名单过滤天然排除，主进程侧再加一道 remoteTarget 拒绝兜底。

## 状态所有者与接口

- 唯一持久化所有者：desktop main 的自定义应用注册表（`packages/desktop/src/main/customEditors.ts`），落盘 `~/.zxcode/v2/custom-editors.json`（经 `getAppConfigDir()`，原子写：tmp + rename；读失败按空表，不阻断功能）。
- 条目结构：`{ id: "custom:<uuid>", appPath, name, iconDataUrl }`（`CustomEditorEntry extends EditorInfo`）。`id` 统一 `custom:` 前缀，与静态白名单 id 空间互不冲突。
- 写路径只有两条，都在 main：`addCustomEditor(appPath)`（按 appPath 去重；名称 macOS 取 `CFBundleDisplayName || CFBundleName || 文件名`，Windows 取文件名去 `.exe`；图标复用 `getAppIconDataUrl`）与 `removeCustomEditor(editorId)`。**renderer 永远不向 main 传可执行路径**——文件对话框由 main 进程弹出（父窗口为 sender window），IPC 只传注册表 id。
- 读路径：`GetInstalledEditors` handler 返回 `[...静态检测缓存, ...注册表现读]`；静态缓存逻辑不变、无需失效（注册表每次调用现读 JSON）。`OpenInEditor` 查找顺序：静态 defs → 注册表。
- IPC 通道（`packages/shared/src/channels.ts`）：`SelectAndAddCustomEditor`（request void → `EditorInfo | null`，null = 用户取消或路径非法）、`RemoveCustomEditor`（request `{ editorId }` → `{ success }`，zod 校验）。
- 平台接口：`IPlatformService.selectAndAddCustomEditor?()` / `removeCustomEditor?(editorId)`（可选，仿 `selectFiles?` 先例，web 零改动）；`window.zxcode` 声明同步可选。UI 以 `platform.selectAndAddCustomEditor` 存在性探测入口。

## 不变量

- 注册表唯一所有者在 main 进程；renderer 无注册表副本，只持有 `getInstalledEditors()` 快照并按命令刷新。
- 自定义 id 恒以 `custom:` 开头；静态白名单永不产生该前缀 id。
- 静态检测缓存与自定义注册表互不污染：缓存只含静态条目，注册表只含自定义条目，合并在 IPC 边界完成。
- `openInEditor` 对自定义条目：带 `remoteTarget` 一律失败关闭（本地应用无法消费远端路径）；打开前 `existsSync(appPath)` 预检，应用被移动/删除返回明确错误，条目保留在列表中由用户手动删除。
- 相同 appPath 重复添加幂等：返回已有条目，不产生重复记录。
- 取消对话框无任何副作用（不写盘）。

## 验收场景

1. macOS 下拉点「选择应用程序…」→ 选择 `/Applications/XXX.app` → 条目出现在下拉（含真实图标与 bundle 显示名），立即成为选中项，其它 open-with 菜单（文件树 / 任务右键）同步可见。
2. 点击自定义条目 → 用 `open -a <appPath> <workspace>` 打开当前 workspace。
3. 点击条目行尾删除按钮 → 菜单不关闭、条目消失；若删除的是当前选中项，按钮回退为列表第一项且 localStorage 偏好被清除。
4. 重复选择同一 `.app` → 返回已有条目，注册表无重复。
5. 对话框取消 → 下拉与注册表无变化。
6. 选中的 `.app` 之后被移动/删除 → 打开返回失败并带 `application not found` 错误；条目仍在列表中可手动删除。
7. SSH/WSL/Docker 远程 workspace：下拉不出现自定义条目；绕过 UI 直接以自定义 id + remoteTarget 调 `openInEditor` → 失败关闭。
8. Web 端 / Office 模式：不出现「选择应用程序…」入口。
9. 注册表 JSON 损坏 → 列表按空注册表处理，静态条目不受影响。
10. 重启应用后自定义条目与选中偏好仍生效。

## 与系统应用查询共存（上游 v3.17.2 补齐后）

- 自定义应用列表**保留**，与上游系统应用查询在同一「打开方式」菜单共存：合并顺序固定为**系统应用（isDefault 置顶）→ 自定义应用（`custom:`）→ 静态编辑器**；目录/远程工作区回退纯 editors 列表（自定义条目按既有 remoteTarget 白名单过滤天然排除）。完整设计见 [file-open-apps-enhancement](./file-open-apps-enhancement.md)。
- `zcode-last-editor-id` 偏好边界收紧：偏好只作用于 custom:/静态编辑器段；选择系统应用（`file-app:` 前缀 id）不读写该偏好，避免系统应用哈希 id 污染编辑器偏好。
- 自定义条目的注册表所有者、`SelectAndAddCustomEditor`/`RemoveCustomEditor` IPC 与安全边界（renderer 永不传可执行路径）不变；系统应用查询是独立的 `GetFileApplications`/`OpenFileWithApplication` 通道，二者在 UI 合并、在 main 各自成模块。
