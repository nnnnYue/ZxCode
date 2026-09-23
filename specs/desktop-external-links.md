# 桌面端外链（更新日志 / 下载）

## 产品规则

- 桌面端所有对外跳转的“更新日志”与“下载”入口统一指向 GitHub Releases 页：
  `https://github.com/nnnnYue/ZxCode/releases`。
- 不再按应用语言（zh-CN / en）或 ZxCode Endpoint origin 分流到官网页面；外链为固定常量，与应用语言、endpoint 设置解耦。
- 覆盖入口：
  1. 应用菜单「帮助 → 更新日志」（`DesktopCommandIds.OpenChangelog`）；
  2. 架构不匹配弹窗的「前往下载」按钮（检测到 ARM 翻译运行时提示安装原生版本）。

## 状态所有者与接口

- 唯一事实源：`packages/desktop/src/main/desktopExternalLinks.ts` 导出的常量 `ZXCODE_RELEASES_URL`。
- 更新日志：`openChangelog()`（`desktopCommandHandlers.ts`）用 `shell.openExternal` 打开该常量；菜单项只触发命令 id，不自行拼 URL。
- 下载：`maybeWarnArchitectureMismatch`（`desktopArchitectureGuard.ts`）在用户确认后打开同一常量。

## 不变量

- 外链常量只定义一处；两个入口都引用它，不允许再出现按 locale/origin 拼接 changelog 或下载地址的分支。
- 外链打开必须走 `shell.openExternal`（主进程），渲染层不直接持有该地址。

## 验收场景

1. 中文/英文界面下点击应用菜单「更新日志」：均打开 GitHub Releases 页。
2. 在 Apple Silicon 上以 x64（Rosetta 转译）运行并触发架构警告，点击「前往下载」：打开同一 GitHub Releases 页。
3. 修改 endpoint 为自定义地址后再次点击「更新日志」：仍打开 GitHub Releases 页，不受 endpoint 影响。
