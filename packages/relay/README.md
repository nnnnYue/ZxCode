# @zcode/relay — 自部署手机远控 Relay

单进程公网 relay：桌面 ZxCode 主动出站连接，手机浏览器经授权链接遥控桌面已有会话。relay 不解析 RPC、不保存任务队列/快照等业务状态；重启只丢在线态与未使用票据。

## 架构

```
手机浏览器                      relay（本包，公网单进程）                桌面 Electron
  │ ① GET /?remote=<grant> ──→ 静态页面（packages/web 构建产物）           │
  │                          ←── 控制连接 /ws/host-control ────────────── │ desktopRelayClient（main 单例）
  │ ② 打开授权链接              │（presence + grant 签发）                  │
  │   GET /ws/remote/<grant> → 校验 grant → 控制连接下发 attach request ──→ │
  │                          ←── 桌面回连 /ws/host-attach/<ticket> ─────── │ AttachServicePort(replayable)
  │ ←———————— SocketProtocol 帧端到端字节管道（relay 不解析）——————————→ │ / attachRemoteWorkspaceSessionHost
```

鉴权模型：deployment token（可选，`ZXCODE_RELAY_TOKEN`）保护桌面控制连接；手机侧使用 grant 授权链接，**链接即凭证**——grant 只校验不消费，同一链接在失效前可被刷新页面与多台设备重复使用。

- 签发后 10 分钟内没有任何接入即失效；
- 首次接入后切换为闲置窗口（默认 24 小时），每次手机连接建立/断开都从当前时刻重算，期间持续使用则一直有效；
- 过期后 grant 不允许复活，需要重新签发。

代价：授权链接在闲置窗口内等同长期凭证，泄露窗口与闲置时长一致，请勿把链接贴到公开渠道。

## 部署

### 1. 构建手机页面

```bash
# 仓库根目录
pnpm --filter @zcode/web exec vite build --base=/
```

构建产物默认在 `packages/web/dist`。

### 2. 运行 relay

```bash
# 开发/直跑
pnpm --filter @zcode/relay start

# 或构建单文件产物后直接 node 运行
pnpm --filter @zcode/relay run build
ZXCODE_RELAY_WEB_ROOT=/path/to/web/dist \
ZXCODE_RELAY_TOKEN=$(openssl rand -base64 32) \
node packages/relay/dist/main.js
```

### 3. Docker

```bash
docker build -f packages/relay/Dockerfile -t zxcode-relay ./packages/relay
docker run -d --name zxcode-relay \
  -p 8787:8787 \
  -e ZXCODE_RELAY_TOKEN=<your-token> \
  -v /srv/zcode-web-dist:/web-root:ro \
  zxcode-relay
```

### 4. 桌面端配置

ZxCode 桌面端 → 设置 → 手机远控：填 relay 地址（如 `https://relay.example.com`）与 token，开启开关；随后「生成手机授权链接」，扫码或手机打开即可。

左下角的「移动端远程控制」入口也走这条链路：**未开启并配置 relay 时该入口不显示**；开启后打开入口即自动签发授权链接并展示二维码（同样可在设置页生成链接）。

### 5. 升级部署

relay 与手机页面产物（`packages/web` 构建产物）需**一起更新**，二者版本错配会出现页面空白或协议不匹配：

```bash
pnpm --filter @zcode/web exec vite build --base=/   # 手机页面
pnpm --filter @zcode/relay run build                 # relay 单文件产物
# 替换后重启 relay 进程
```

注意：grant 票据只存在于 relay 内存中，**relay 重启后所有已签发的授权链接立即失效**，需重新扫码/生成。桌面端控制连接会按指数退避自动重连，无需重启桌面端。

## 环境变量

| 变量                                             | 默认           | 说明                                                                         |
| ------------------------------------------------ | -------------- | ---------------------------------------------------------------------------- |
| `ZXCODE_RELAY_HOST`                              | `0.0.0.0`      | 监听地址                                                                     |
| `ZXCODE_RELAY_PORT`                              | `8787`         | 监听端口                                                                     |
| `ZXCODE_RELAY_TOKEN`                             | （空）         | deployment token；设置后桌面控制连接必须携带 `Authorization: Bearer <token>` |
| `ZXCODE_RELAY_WEB_ROOT`                          | （内置引导页） | 手机静态页面根目录（`packages/web` 构建产物）                                |
| `ZXCODE_RELAY_TLS_CERT` / `ZXCODE_RELAY_TLS_KEY` | （空）         | 预留；当前版本建议由 nginx/caddy 终结 TLS                                    |

## TLS

主推反代终结 TLS（relay 监听明文、只绑定 `127.0.0.1`）：

```nginx
server {
  listen 443 ssl;
  server_name relay.example.com;
  ssl_certificate     /etc/letsencrypt/live/relay.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;
  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

caddy 等效配置：`relay.example.com { reverse_proxy 127.0.0.1:8787 }`（自动 HTTPS）。

## 数据边界

relay 运营者可以看到手机与桌面之间的 RPC 字节流（等效于网络接入点）。请将 relay 部署在自己信任的服务器并启用 TLS；deployment token 防止他人把桌面连到你的 relay。

手机侧的 grant 链接在闲置窗口内等同长期凭证（见上文鉴权模型），泄露窗口等于闲置时长；如需更短的有效期可缩短闲置窗口，或在不再使用时让桌面端停用 relay。

## 测试

```bash
pnpm --filter @zcode/relay test
```
