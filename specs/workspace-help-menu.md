# 工作区帮助菜单

## 产品规则

- 工作区标题栏右上角的帮助按钮（圆形问号图标）点击后弹出下拉菜单。
- 菜单项仅桌面端渲染，依次为：
  1. 资源管理器（打开资源管理器窗口）；
  2. 关于（打开自绘 About 对话框，见 `specs/desktop-about-dialog.md`）。
- Web 端没有桌面窗口与资源管理器，不渲染任何菜单项；按钮挂载与否由调用方通过 `isDesktop` 注入决定，组件内不做平台嗅探。
- 历史上菜单上方还有标题栏箭头菜单入口，该入口已下线；菜单顶部不得残留分隔线或空 item——菜单内容必须以第一个真实菜单项开头。

## 状态所有者与接口

- 所有者：`packages/ui/src/WorkspaceHelpMenuButton.tsx`（纯展示组件，无本地状态）。
- 动作通过 `IPlatformService.executeDesktopCommand` 分发（`OpenResourceManager` / `ShowAbout`），组件不直接依赖 Electron。
- 挂载点：`WorkspaceHeaderActionSection`（工作区标题栏）与 `SettingsPage`（设置页头部），均以 `isDesktop={Boolean(isDesktop)}` 注入。

## 不变量

- 菜单项命令 id 来自 `@zcode/shared` 的 `DesktopCommandIds`，不在组件内手写字符串。
- 测试锚点：触发按钮 `TID_WORKSPACE_HELP_MENU_TRIGGER`，资源管理器项 `TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER`。

## 验收场景

1. 桌面端点击帮助按钮：菜单第一项为「资源管理器」，第二项为「关于」，顶部无空行、无多余分隔线。
2. 桌面端点击「资源管理器」：打开资源管理器窗口；点击「关于」：打开 About 对话框。
3. Web 端：菜单不渲染任何菜单项（调用方也可选择不挂载按钮）。
