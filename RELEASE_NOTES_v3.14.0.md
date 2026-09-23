# ZxCode v3.14.0 发布说明

## 新特性

- 手机远程控制：新增自部署公网 Relay，手机浏览器通过一次性授权链接直连桌面已有会话；Relay 仅做鉴权与字节转发，不保存任务队列、快照等业务状态。
- 预览面板：支持直接编辑并保存文本文件（UTF-8 覆盖写回，单文件上限 1MB）；关闭或刷新前拦截未保存修改并弹窗确认。
- 设置页：支持自定义模型请求头，随 Agent 启动注入（`ZXCODE_MODEL_CUSTOM_HEADERS`），同名条目可覆盖默认来源头。
- 官方插件：新增 `android-emulator` 与 `documents` 插件。

## 变更

- 品牌重塑：产品标识由 ZCode 全面更名为 ZxCode（appId、productName、协议 scheme、进程名、路径与 `ZXCODE_*` 环境变量前缀等），并更新桌面 / Web / 共享品牌资产中的全部 Logo 与图标。
- 移除平台账号登录、zcode.z.ai 运行时调用、自动更新链路与全部遥测上报，客户端完全离线运行；GLM 推理经 API Key（Z.ai / BigModel）接入。
- 插件商店改为本地默认排序，不再从远端下发排序。
- 关于对话框不再展示版权信息。

## 修复

- 修复品牌更名后启动 CSS 类名不匹配导致的已打包应用打开灰屏、启动动画丢失的问题。
- 桌面端外链统一指向 GitHub Releases，并修复设置页无限重渲染。

## 内部改进

- 外链常量统一命名为 `ZXCODE_RELEASES_URL`。
- 清理各包未使用的导入与死代码；移除已下线官方插件（assess-credit 等）的残留资源。
- 新增 `REMOVALS.md`，记录账号、遥测、指纹上报等移除项清单。

## 下载

| 平台 | 文件 |
| ---- | ---- |
| Windows x64 | `ZxCode-3.14.0-win-x64.exe` |
| macOS Apple Silicon | `ZxCode-3.14.0-mac-arm64.dmg` / `ZxCode-3.14.0-mac-arm64.zip` |

> 本次安装包未做签名 / 公证：Windows 首次安装可能触发 SmartScreen 提示（选择“仍要运行”），macOS 首次打开需在“系统设置 → 隐私与安全性”中放行。
