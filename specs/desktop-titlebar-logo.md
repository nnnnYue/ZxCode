# Windows/Linux 自绘标题栏的品牌 Logo

## 产品规则

- Windows/Linux 走自绘 caption 区（`DesktopTopOverlay` 的 `usesCustomCaptionArea` 分支），左上角切换侧边栏按钮在非 hover 态显示品牌 logo，hover/focus 态切换为侧栏图标；macOS 用系统红绿灯，按钮只渲染 `SidebarToggleIcon`，不显示 logo。
- logo 必须用 `ZCodeStartupLogoBadge` 的 `size="titlebar"` 紧凑变体（20px 容器 + `w-3.25` 位图，`packages/ui/src/root/RootStartupLoading.tsx`）；启动页/引导用 `size="default"`（96px 容器 + `w-14`）。
- 禁止把 `default` 大徽章塞进标题栏槽位：按钮（28px，`overflow-hidden rounded-lg`）会把它裁成中央碎片。v3.18.0 合并曾删除 titlebar 变体导致此回归（Windows 上表现为"logo 显示过大、像 logo 中间一部分"），2026-11-14 已恢复（对照上游 b95ebaff）。

## 验收场景

1. Windows/Linux 标题栏左上角显示完整 20px 劈裂 Z 徽章，笔画完整、无裁切。
2. hover 时 logo 隐去、侧栏切换图标出现；点击可切换侧栏。
3. macOS 左上角无 logo（只有红绿灯后的切换按钮图标）。
