# 移动端远程控制入口收口自部署 relay（specs/mobile-remote-entry-relay-only.md）

## 背景

左下角「移动端远程控制」入口此前走上游官方云端链路（`webRemoteControlManager` →
`https://zcode.z.ai/remote/<version>` 二维码 + `wss://zcode.z.ai/ws` 中继 + OAuth 设备凭据），
与 removes 规范（剔除 zcode.z.ai 平台运行时调用）冲突。用户决策：入口二维码改为自部署
relay 生成的授权链接；未开启并配置 relay 时入口不显示。官方链路 main 代码删除为第二步
专项，本 spec 只覆盖第一步（UI 层收口）。

## 产品规则

- 入口显隐：`getMobileRelayStatus()` 返回 `supported && enabled && connected` 才渲染
  左下角入口；未配置、未开启或连接失败一律不出现（不显示灰色"未开启"态）。
- 弹层打开即自动调 `requestMobileRelayGrant({workspacePath, workspaceIdentity, remoteSessionId})`
  生成授权链接并渲染二维码（指向自部署 relay，如 `http://<relay>/?remote=<grant>`）。
- 链接语义对齐「链接即凭证」：签发后 10 分钟内未打开失效；打开后每次接入/断开重算闲置
  窗口（默认 24h）。弹层倒计时展示「未使用失效」时间（grant.expiresAt）。
- 「重新生成」直接签发新 grant，不做确认弹窗——旧链接在自身闲置窗口内继续有效，
  重新生成不会使已发出的链接失效（与官方 sid/hash 语义不同）。
- 复制链接 = 复制 grant url。
- relay 连接失败（enabled 但 lastError）时入口保留、图标红色、tooltip 显示错误；
  弹层生成失败时展示错误与重试。
- Bot Channel 右栏（BotsDialog 入口）与本链路无关，保持不变。

## 状态所有者

| 状态                                      | 所有者                                 | 说明                                                            |
| ----------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| relay 连接（enabled/connected/lastError） | desktop main `desktopRelayClient` 单例 | UI 经 `getMobileRelayStatus` 只读；入口 gate 与触发器颜色消费它 |
| grant 生命周期（签发/续期/过期）          | relay 服务器票据存储                   | UI 只展示 `expiresAt` 倒计时，不维护副本                        |
| 入口显隐                                  | renderer-local                         | 由 relay status 派生，无独立状态                                |
| 生成请求竞态                              | 弹层内 requestSeq 序号                 | 复用设置页 MobileRelaySettingsSection 模式                      |

## 接口变化（UI 层）

- `WorkspaceWebRemoteControlTrigger`：移除 `useWebRemoteControlStatus`（官方链路轮询）
  与 `getWebRemoteControlTriggerPresentation`；gate 与颜色改由 `useMobileRelayStatus`
  （新 hook，轮询 `getMobileRelayStatus`，间隔 5s，弹层打开时不加速）驱动。
- `WebRemoteControlDialog`：移除对 `startWebRemoteControl` / `stopWebRemoteControl` /
  `refreshWebRemoteControlPairing` / `getWebRemoteControlStatus` 的调用与
  `isSameWebRemoteControlTarget` / `isReusableWebRemoteControlSession` /
  `getWebRemoteControlStatusTagLabel` 等 helper；扫码卡改为 grant 展示
  （二维码 + 链接 + 复制 + 重新生成 + 倒计时 + relay 状态行）。
- `useWebRemoteControlStatus` hook 与 `WorkspaceSidebar` 的 `mobileActiveTaskKey`
  （官方链路 mobileViewState 高亮）第一阶段保留不动——relay 链路下其状态恒为
  idle、无行为影响；随第二步官方链路删除一并清理。

## 验收场景

1. 未配置 relay：左下角无「移动端远程控制」入口；设置页开启并连接后入口出现。
2. 打开弹层自动生成链接，二维码指向自部署 relay（url 非 `zcode.z.ai`）；
   手机扫码可打开手机页（复用既有 relay 链路，含刷新可用语义）。
3. 复制链接得到 grant url；重新生成得到新链接且旧链接仍可用；倒计时到 0 显示已失效。
4. relay 控制连接断开：入口图标红、tooltip 显示错误；弹层内生成失败显示错误。
5. UI 层对官方链路平台 API（start/stop/refresh/getStatus）零引用。
6. ui 包 typecheck/lint 与相关测试（trigger presentation、dialog layout）更新后通过。
