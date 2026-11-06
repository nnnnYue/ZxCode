# File-open-apps 系统应用查询与「另存为」

上游 v3.17.2 补齐（Phase 2b）。系统关联应用是唯一事实源；fork 既有 open-with（自定义应用 + 静态编辑器）保留，与系统应用查询在同一菜单共存，不是替换。

## 产品规则

- 「打开方式」类菜单（文件树行右键、OpenSplitButton 下拉、消息内文件链接右键）在**本地真实文件**场景展示合并列表，顺序固定：**系统应用（isDefault 置顶）→ fork 自定义应用（`custom:` 前缀）→ 静态编辑器**；前 3 项平铺，其余进「更多打开方式」子菜单（6 行虚拟高度 + 滚动提示）。
- 目录与远程工作区回退**纯 editors 列表**（沿用既有 `resolveWorkspaceEditorSelection` 过滤链路），不查询系统关联。
- 产物 tab 头部「作为文件打开」分段按钮（`file-menu/ArtifactOpenAsFileButton.tsx`）的 chevron 菜单仅列**系统应用**（副本是 main 物化的本机临时文件，与自定义/静态编辑器清单无关），其后是「另存当前版本」「在工作区显示」「复制绝对路径」。
- 「另存为」（`FileSaveAsMenuItem`）出现在文件树行、消息文件链接、OpenSplitButton 下拉、产物 chevron 菜单：50 MiB 上限，经所属 workspace Host 的 `stat/readFileRange` 分片（1 MiB）读取原字节后交给 `platform.saveFile`；读取前后核对 size 与 mtime，不做文本解码。Web 只有下载确认，不报“已保存”。

## 状态所有者与接口

- **desktop main**：`packages/desktop/src/main/file-open-apps/`（architecture-policy 登记模块 `file-open-apps`，adapters 层，requires shared）。`createFileApplicationService({ getIcon, logger })` 提供两个 IPC 入口：
  - `GetFileApplications(target) → FileApplicationInfo[]`：只接受本机真实文件（`pathKind === "file"`、绝对路径、`stat` 为文件、无 `remoteTarget`/`workspaceIdentity`——IPC 入口不信任 renderer 的 pathKind）；目录、远端身份、错误路径一律返回 `[]`。
  - `OpenFileWithApplication({ applicationId, target })`：每次重查系统关联并按 id（`file-app:` + sha256(key)）重新匹配后才启动；**不执行 renderer 提供的路径/命令作为应用**。
- 原生适配：macOS 走 NSWorkspace（osascript JXA），Windows 走 Shell `IAssocHandler` 枚举 + PowerShell 内嵌 C#（图标在查询进程内批量提取，返回有界 PNG；失败显式无图，不用 exe 文件图标冒充），Linux 走 GIO/xdg-mime desktop entry。进程间传参一律走环境变量（`ZXCODE_FILE_APP_*`），不插值进脚本源码。
- 图标：macOS/Linux 复用 `editors.ts` 的 `getAppIconDataUrl` 注入；Windows 由查询进程自带资源解析。
- **preload / renderer**：`window.zxcode.getFileApplications/openFileWithApplication`（`packages/client/src/globals.d.ts` 可选声明），`desktopPlatform.ts` 透传并置 `canOpenLocalFiles: true`；Web 平台保持 `canOpenLocalFiles: false` 且不提供两方法。
- **ui**：`packages/ui/src/file-menu/`（登记模块 `ui-file-menu`，requires shared + ui）。`useFileApplications`（懒查询 + 请求序号竞态防护 + 能力探测 `canOpenLocalFiles && getFileApplications && openFileWithApplication`）、`FileApplicationChoices`（泛型列表，兼容 `FileApplicationInfo`/`EditorInfo`，`iconDataUrl` 缺省补空串）、`FileApplicationSubmenu`、`FileApplicationIcon`（加载失败回退 AppWindow）、`DefaultFileApplicationLabel`、`FileSaveAsMenuItem`、`fileCopy.ts`、`ArtifactOpenAsFileButton`。

## 合并菜单的分流规则（消费面）

- `onSelect` 按 id 前缀分流：`file-app:` → `platform.openFileWithApplication`（不写 `zcode-last-editor-id` 偏好）；`custom:` 与静态 id → 既有 `openInEditor` 链路（显式选择仍持久化偏好）。
- `zcode-last-editor-id` 偏好**仅作用于 editors/custom 段**：系统应用永远按 isDefault 置顶，不受偏好重排；偏好值也不会被系统应用 id 污染。
- 查询时机：菜单打开（`onOpenChange`）才触发 `load()`；系统关联每次打开重查，无跨文件/跨工作区缓存。

## 不变量

- renderer 永不向 main 传可执行路径或命令；应用身份是不透明 id，打开动作由 main 重查关联后匹配执行。
- 系统关联查询无持久状态、不写系统设置（不修改默认关联）；失败返回空数组失败关闭。
- 另存为先完整读取再弹保存对话框：选择源路径自身不会先截断源文件；`file_too_large`/`file_size_unavailable`/`file_changed` 有明确错误文案。
- 「更多打开方式」子菜单高度有界（6 行），菜单宽度 `w-64 max-w-[calc(100vw-1rem)]`，受 radix popper 可用高度约束。

## 验收场景

1. 本地文件树行右键：菜单顶部出现系统应用（默认应用带「默认」标记与图标），其后是自定义应用与静态编辑器；>3 项时收进「更多打开方式」。
2. 选系统应用 → 用该应用打开文件；选自定义/静态项 → 走原 openInEditor，行为与偏好持久化不变。
3. 远程（SSH/WSL/Docker）或目录行：菜单回退纯 editors 列表，无系统应用段，无「另存为」（目录）。
4. 消息内文件链接右键：新增「打开方式」与「另存为」；目录链接不出现「另存为」。
5. 另存为 >50MiB 文件 → toast「文件过大」；另存到源路径 → 文件内容不变。
6. 产物 chevron 菜单：系统应用打开 + 另存当前版本 + 在工作区显示 + 复制绝对路径；Web 只有保存时仍显示按钮（`useCanSaveArtifactAsFile`），「在工作区显示」留在头部独立按钮。
7. 卸载某应用后重开菜单：旧条目消失（每次重查，无缓存）。
8. Web 端：无系统应用查询（能力探测失败），本地文件菜单回退 editors；另存为退化为「开始下载」语义。
