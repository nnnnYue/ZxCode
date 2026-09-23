# 桌面 About 对话框

## 产品规则

- 桌面端「关于」入口（应用菜单、托盘菜单、应用内帮助菜单）统一打开自绘 About 对话框，三端（macOS / Windows / Linux）共用同一份 HTML 模板。
- 对话框展示内容：
  - 应用图标（Z 字标）；
  - 应用名 `ZxCode Desktop App` 与版本号（版本标签随 locale 显示「版本 / version」）；
  - Apple Silicon 优化行（仅 macOS arm64 显示「已针对 Apple Silicon 优化。/ Optimized for Apple Silicon.」）；
  - 「确定 / OK」按钮，Esc / Enter 关闭。
- **对话框不展示任何版权信息**（不含「版权所有 © … / Copyright © …」等版权行）。仓库内用户可见的版权文本以此为准：除法律文件（`LICENSE`、`NOTICE.md`、`THIRD-PARTY-NOTICES.md`）外，UI 不得出现版权、许可声明类文案。

## 状态所有者与接口

- 所有者：`packages/desktop/src/main/about.ts`（`showAboutDialog`）负责组装内容并创建窗口；`packages/desktop/src/main/aboutWindow.ts`（`createCustomAboutDialogHtml`）只负责 HTML 模板渲染，不持有状态。
- 文案来源：`about.ts` 内 `ABOUT_MESSAGES`（zh-CN / en-US 双语），locale 由 `desktopCommandHandlers.ts` 的 `ShowAbout` 处理链传入。
- 导出诊断日志（`formatAboutDetail`，导出日志中的 `about.txt`）只含版本与环境信息，同样不含版权文本。

## 不变量

- About 窗口尺寸固定（256x312，卡片内容区 256x280），不随文案行数变化。
- 无版权行时 `.meta` 区域可能为空（非 Apple Silicon 平台），不得渲染可见占位或空行。

## 验收场景

1. zh-CN 下打开 About：显示应用名、版本、（Apple Silicon 上）优化行与 OK 按钮，无版权文本。
2. en-US 下打开 About：同上，英文文案正确。
3. 非 macOS arm64 平台打开 About：无优化行、无版权文本，布局无破版、无多余空白占位。
4. 全仓库用户可见 UI（启动页、侧栏页脚、设置页、Web 端、CLI）均无版权、许可声明文案。
