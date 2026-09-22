# 自部署手机远控 Relay — 规格（SPEC）

## 1. 产品规则

- 用户在自己的公网服务器上部署 `@zcode/relay`（单进程），桌面 ZCode 主动出站连接 relay，手机浏览器经 relay 遥控桌面已有会话。
- 鉴权模型：**一次性授权链接**。桌面生成 grant（默认 TTL 10 分钟、单次使用），手机打开 `https://<relay>/?remote=<grantId>` 即连；不使用长期共享 token 做手机侧鉴权。
- 覆盖范围：本地工作区与远程（SSH/WSL/Docker）工作区都支持；手机附着**同一窗口 Host**，复用会话运行时，不另起 Agent、Local Host 或远程会话。
- 页面托管：relay 单进程内置托管手机静态页面（`ZCODE_RELAY_WEB_ROOT` 指向 `packages/web` 构建产物）+ WS 转发，同进程同端口。
- relay 不解析 RPC、不保存任务队列/快照等业务状态；断电即断链（内存注册表 + 一次性票据）。

## 2. 状态所有者

| 状态                                                                                          | 所有者                                  | 说明                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| deployment token 校验、设备注册表、心跳                                                       | relay `/ws/host-control` 连接           | `ZCODE_RELAY_TOKEN` + deviceId；心跳超时（60s）收割设备                |
| 一次性 grant（手机接入票据）                                                                  | relay `grantStore`                      | randomBytes(32)、TTL 10min、一次性消费                                 |
| 一次性 attach ticket（桌面回连接票）                                                          | relay `grantStore`（独立 TTL 30s 实例） | 桌面回连 `/ws/host-attach/:ticket` 时消费                              |
| relay 客户端生命周期（启停/重连/心跳）                                                        | desktop main 单例 `desktopRelayClient`  | 由设置 `mobileRelay{enabled,serverUrl}` 驱动；app ready 启动、退出销毁 |
| 窗口 workspace 映射 `windowId → {workspacePath, workspaceIdentity, workspaceKey}`             | desktop main                            | renderer 经 `SyncWindowWorkspace` IPC 上报；main 不回查 renderer       |
| attach 执行（local: AttachServicePort replayable / remote: attachRemoteWorkspaceSessionHost） | desktop main `desktopRelayClient`       | 校验 target 与当前映射一致后才执行                                     |
| 手机端连接                                                                                    | 手机 Web（零改动）                      | `?remote=<grantId>` → `/ws/remote/<grantId>` → 既有 ChannelClient      |

## 3. 接口

### 3.1 relay HTTP/WS 面（`packages/relay`）

- `GET /*` — 手机静态页面（SPA fallback）
- `GET /api/server-info` — 兼容手机端 bootstrap（`{serverId, version, authRequired:false, workspaces:[], capabilities}`）
- `GET /ws/host-control` — 桌面控制连接；header `Authorization: Bearer <ZCODE_RELAY_TOKEN>`；消息 = `zcode-relay-protocol` 控制帧
- `GET /ws/host-attach/:ticket` — 桌面数据回连（ticket 一次性、30s）
- `GET /ws/remote/:grantId` — 手机接入（grant 一次性、TTL 10min；等桌面回连 15s 超时）
- 环境变量：`ZCODE_RELAY_PORT`/`ZCODE_RELAY_HOST`、`ZCODE_RELAY_TOKEN`、`ZCODE_RELAY_WEB_ROOT`、`ZCODE_RELAY_TLS_CERT`/`ZCODE_RELAY_TLS_KEY`（可选，主推 nginx/caddy 终结 TLS）

### 3.2 共享协议（`@zcode/shared/zcode-relay-protocol`）

控制帧（桌面 ↔ relay，JSON over WS）：

- `RelayControlHello{deviceId, relayToken, version}` → `RelayControlAck{deviceId}`
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

- `zcode:sync-window-workspace`（renderer → main，on）— 上报 active workspace 三元组
- `zcode:get-mobile-relay-status`（invoke）
- `zcode:request-mobile-relay-grant`（invoke）

## 4. 事件顺序（attach）

```
手机打开授权 URL
  → relay 校验 grant（一次性消费）→ 通过控制连接向桌面发 RelayAttachRequest{ticket, target}
  → 桌面校验 target（windowId 的当前 workspaceKey 一致 / remoteSessionId 路由存在且 attachable）
  → 桌面回连 /ws/host-attach/<ticket>（30s 内）→ relay 校验 ticket（一次性消费）
  → relay 把两端 ISocket 字节对接；桌面侧同时执行 attach：
      local:  Host AttachServicePort{clientMode:"web-remote-replayable", scope:{kind:"local"}} → port1
      remote: attachRemoteWorkspaceSessionHost() → port
  → SocketProtocol(wrapWebSocket(ws)) ↔ port 双向泵；任一侧 close → 关另一侧
  → 桌面发 RelayAttachResult；失败时 relay 关闭手机连接并回错误
```

幂等/陈旧防护：grant 与 ticket 均一次性（重放即失效）；target 校验失败拒绝 attach；桌面回连超时 15s relay 主动断开手机并回收 ticket。

## 5. 验收场景

1. **设置驱动启停**：未配置 `mobileRelay.enabled` 时无任何出站连接；开启后建立控制连接并上报 presence；关闭后断开。
2. **本地工作区授权链路**：生成授权链接 → 第二浏览器窗口打开 → 手机 UI 正常渲染、replayable 快照恢复、busy 输入走 CommandInbox 串行。
3. **远程工作区授权链路**：SSH/WSL remote workspace 的 grant 打开后手机可附着同一远程会话。
4. **票据失效**：grant 过期/重放、ticket 重放、desktop 15s 未回连，均拒绝并给手机端明确错误。
5. **断线恢复**：手机端断网重连走既有 resync；relay 重启后桌面控制连接按指数退避重连。
6. **桌面链路不受影响**：desktop-continuous 直连行为零变化（relay 桥接为旁路新增）。
7. **relay 无业务状态**：重启 relay 不丢数据（只丢在线态）；不解析 RPC 帧。
