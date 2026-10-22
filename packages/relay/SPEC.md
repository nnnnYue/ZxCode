# 自部署手机远控 Relay — 规格（SPEC）

## 1. 产品规则

- 用户在自己的公网服务器上部署 `@zcode/relay`（单进程），桌面 ZxCode 主动出站连接 relay，手机浏览器经 relay 遥控桌面已有会话。
- 鉴权模型：**链接即凭证**。桌面生成 grant（randomBytes(32)），手机打开 `https://<relay>/?remote=<grantId>` 即连；grant 只校验不消费，失效只由超时决定：签发后 10 分钟内无任何接入即失效；首次接入后切换为闲置窗口（默认 24h），每次手机 WS 建立/断开都从当前时刻重算，持续使用则一直有效。同一链接支持页面刷新与多台浏览器同时接入；不使用长期共享 token 做手机侧鉴权。泄露窗口与闲置时长一致，属产品接受的取舍。
- 覆盖范围：本地工作区与远程（SSH/WSL/Docker）工作区都支持；手机附着**同一窗口 Host**，复用会话运行时，不另起 Agent、Local Host 或远程会话。
- 页面托管：relay 单进程内置托管手机静态页面（`ZXCODE_RELAY_WEB_ROOT` 指向 `packages/web` 构建产物）+ WS 转发，同进程同端口。
- relay 不解析 RPC、不保存任务队列/快照等业务状态；断电即断链（内存注册表 + 内存票据，重启后所有授权链接失效）。

## 2. 状态所有者

| 状态                                                                                          | 所有者                                                                     | 说明                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| deployment token 校验、设备注册表、心跳                                                       | relay `/ws/host-control` 连接                                              | `ZXCODE_RELAY_TOKEN` + deviceId；心跳超时（60s）收割设备                                                                                                                  |
| grant（手机接入票据，链接即凭证）                                                             | relay `grantStore`                                                         | randomBytes(32)、未使用 TTL 10min；接入后闲置 TTL 24h（每次 WS 建立/断开重算），只 peek/touch 不消费                                                                      |
| 一次性 attach ticket（桌面回连接票）                                                          | relay `grantStore`（独立 TTL 30s 实例）                                    | 桌面回连 `/ws/host-attach/:ticket` 时消费                                                                                                                                 |
| relay 客户端生命周期（启停/重连/心跳）                                                        | desktop main 单例 `desktopRelayClient`                                     | 由设置 `mobileRelay{enabled,serverUrl}` 驱动；app ready 启动、退出销毁                                                                                                    |
| 窗口 workspace 映射 `windowId → {workspacePath, workspaceIdentity, workspaceKey}`             | desktop main                                                               | renderer 经 `SyncWindowWorkspace` IPC 上报；main 不回查 renderer                                                                                                          |
| attach 执行（local: AttachServicePort replayable / remote: attachRemoteWorkspaceSessionHost） | desktop main `desktopRelayClient`                                          | 校验 target 与当前映射一致后才执行                                                                                                                                        |
| 远程 session presence 快照                                                                    | desktop main `desktopRemoteSessions` manager `listRemoteWorkspaceSessions` | 从 `routesBySessionId` 现算只读快照（windowId 反查 BrowserWindow），缺 workspace 身份的 route 跳过；presence 与 grant target 校验都消费它，manager 返回对象必须保留该方法 |
| 手机端连接                                                                                    | 手机 Web（零改动）                                                         | `?remote=<grantId>` → `/ws/remote/<grantId>` → 既有 ChannelClient                                                                                                         |

## 3. 接口

### 3.1 relay HTTP/WS 面（`packages/relay`）

- `GET /*` — 手机静态页面（SPA fallback）
- `GET /api/server-info` — 兼容手机端 bootstrap（`{serverId, version, authRequired:false, workspaces:[], capabilities}`）
- `GET /api/remote/bootstrap/:grantId` — 手机端工作区 bootstrap：回 grant payload（桌面签发时声明的 attach target）里的工作区事实 `{workspacePath, workspaceIdentity?, workspaceKey, expiresAt}`；**只读不续期**（失效只由超时决定）；未知/过期 grant 返回 404
- `GET /ws/host-control` — 桌面控制连接；header `Authorization: Bearer <ZXCODE_RELAY_TOKEN>`；消息 = `zcode-relay-protocol` 控制帧
- `GET /ws/host-attach/:ticket` — 桌面数据回连（ticket 一次性、30s）
- `GET /ws/remote/:grantId` — 手机接入（grant 只校验不消费：未使用 10min / 接入后闲置 24h；等桌面回连 15s 超时）
- 环境变量：`ZXCODE_RELAY_PORT`/`ZXCODE_RELAY_HOST`、`ZXCODE_RELAY_TOKEN`、`ZXCODE_RELAY_WEB_ROOT`、`ZXCODE_RELAY_TLS_CERT`/`ZXCODE_RELAY_TLS_KEY`（可选，主推 nginx/caddy 终结 TLS）

### 3.2 共享协议（`@zcode/shared/zcode-relay-protocol`）

控制帧（桌面 ↔ relay，JSON over WS）：

- `RelayControlHello{deviceId, relayToken, version}` → `RelayControlAck{deviceId}`（鉴权只看 HTTP `Authorization` 头；`relayToken` 允许为空串，仅为兼容字段保留）
- `RelayHeartbeat{at}` / `RelayHeartbeatAck{at}`
- `RelayPresenceUpdate{windows[]}`（windowId/workspacePath/workspaceIdentity/workspaceKey）
- `RelayIssueGrantRequest{requestId, target}` → `RelayIssueGrantResponse{requestId, ok, grantId?, expiresAt?, error?}`
- `RelayAttachRequest{ticket, target}`（relay → 桌面：手机已接入，要求回连）
- `RelayAttachResult{ticket, ok, error?}`（桌面 → relay：回连结果）

`RelayAttachTarget = {kind:"local", windowId, workspacePath, workspaceIdentity?, workspaceKey} | {kind:"remote", +remoteSessionId}`。

### 3.3 应用设置（`AppSettings.mobileRelay`）

`{enabled: boolean = false, serverUrl?: string, token?: string}`；main 启动读一次 + `SyncAppSettings` 即时生效（启停/换服务器重建控制连接）。

### 3.4 平台服务（`IPlatformService`，Desktop 实现，Web 返回 unsupported）

- `getMobileRelayStatus(): Promise<MobileRelayStatus>` — `{supported, enabled, connected, serverUrl?, lastError?}`
- `requestMobileRelayGrant(target): Promise<MobileRelayGrantResult>` — `{success, url?, expiresAt?, error?}`；UI 用返回 url 展示二维码。

### 3.5 桌面 IPC 通道

- `zxcode:sync-window-workspace`（renderer → main，on）— 上报 active workspace 三元组
- `zxcode:get-mobile-relay-status`（invoke）
- `zxcode:request-mobile-relay-grant`（invoke）

## 4. 事件顺序（attach）

```
手机打开授权 URL
  → 手机 GET /api/remote/bootstrap/<grant>（只读）→ 拿到该显示的工作区事实 → Root 注入 workspace tab
  → 手机连 /ws/remote/<grant> → relay 只校验不消费（peek），并 touch 把闲置 TTL 从当前时刻重算
  → relay 通过控制连接向桌面发 RelayAttachRequest{ticket, target}
  → 桌面校验 target（windowId 的当前 workspaceKey 一致 / remoteSessionId 路由存在且 attachable）
  → 桌面回连 /ws/host-attach/<ticket>（30s 内）→ relay 校验 ticket（一次性消费）
  → relay 把两端 ISocket 字节对接；桌面侧同时执行 attach：
      local:  Host AttachServicePort{clientMode:"web-remote-replayable", scope:{kind:"local"}} → port1
      remote: attachRemoteWorkspaceSessionHost() → port
  → SocketProtocol(wrapWebSocket(ws)) ↔ port 双向泵；任一侧 close → 关另一侧
  → 桌面发 RelayAttachResult；失败时 relay 关闭手机连接并回错误
  → 手机 WS 断开（刷新/断网/锁屏）时 relay 再 touch 一次：闲置从最后一次断开重算
  → 刷新或另一台浏览器打开同一 URL：grant 仍在闲置窗口内 → 重复上述流程重新 attach，链接继续有效
```

幂等/陈旧防护：ticket 一次性（重放即失效）；grant 只在校验通过时续期，过期后 touch 返回 null，不允许复活；target 校验失败拒绝 attach；桌面回连超时 15s relay 主动断开手机并回收 ticket。多端同时接入同一 grant 各自独立 attach，输入竞争由桌面 CommandInbox 串行收口；已知边界：单次连接持续超过闲置 TTL 且期间无重连、断开后才刷新的极端时序会因未续期被拒，需重新扫码。

## 5. 验收场景

1. **设置驱动启停**：未配置 `mobileRelay.enabled` 时无任何出站连接；开启后建立控制连接并上报 presence；关闭后断开。
2. **本地工作区授权链路**：生成授权链接 → 第二浏览器窗口打开 → 手机端先经 `/api/remote/bootstrap/<grant>` 拿到工作区事实并注入 workspace tab（否则 Root 无 tab、页面只剩空壳）→ 手机 UI 正常渲染、replayable 快照恢复、busy 输入走 CommandInbox 串行。
3. **远程工作区授权链路**：SSH/WSL remote workspace 的 grant 打开后手机可附着同一远程会话。
4. **票据失效**：grant 签发后 10 分钟无接入失效；接入后闲置超过 24h（可配）失效；过期后 touch/peek 均拒绝、不允许复活。ticket 重放、desktop 15s 未回连，均拒绝并给手机端明确错误。
5. **刷新与多端复用**：同一授权链接在闲置窗口内，页面刷新、另一台电脑浏览器打开、断网恢复后重连，均重新 attach 成功，无需重新扫码；桌面离线期间接入被拒（503）但 grant 不失效，桌面恢复后同一链接可继续接入。
6. **断线恢复**：手机端断网重连走既有 resync；relay 重启后桌面控制连接按指数退避重连。注意 grant 在 relay 内存中，relay 重启后所有链接失效，需重新扫码（断电即断链语义）。
7. **桌面链路不受影响**：desktop-continuous 直连行为零变化（relay 桥接为旁路新增）。
8. **relay 无业务状态**：重启 relay 不丢数据（只丢在线态）；不解析 RPC 帧。
