# @zcode/relay — 自部署手机远控 Relay

单进程公网 relay：桌面 ZCode 主动出站连接，手机浏览器经一次性授权链接遥控桌面已有会话。relay 不解析 RPC、不保存任务队列/快照等业务状态；重启只丢在线态与未使用票据。

## 架构

```
手机浏览器                      relay（本包，公网单进程）                桌面 Electron
  │ ① GET /?remote=<grant> ──→ 静态页面（packages/web 构建产物）           │
  │                          ←── 控制连接 /ws/host-control ────────────── │ desktopRelayClient（main 单例）
  │ ② 打开授权链接              │（presence + 一次性 grant 签发）           │
  │   GET /ws/remote/<grant> → 校验 grant → 控制连接下发 attach request ──→ │
  │                          ←── 桌面回连 /ws/host-attach/<ticket> ─────── │ AttachServicePort(replayable)
  │ ←———————— SocketProtocol 帧端到端字节管道（relay 不解析）——————————→ │ / attachRemoteWorkspaceSessionHost
```

鉴权模型：deployment token（可选，`ZCODE_RELAY_TOKEN`）保护桌面控制连接；手机侧只使用一次性 grant（默认 10 分钟有效、单次消费）。

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
ZCODE_RELAY_WEB_ROOT=/path/to/web/dist \
ZCODE_RELAY_TOKEN=$(openssl rand -base64 32) \
node packages/relay/dist/main.js
```

### 3. Docker

```bash
docker build -f packages/relay/Dockerfile -t zcode-relay ./packages/relay
docker run -d --name zcode-relay \
  -p 8787:8787 \
  -e ZCODE_RELAY_TOKEN=<your-token> \
  -v /srv/zcode-web-dist:/web-root:ro \
  zcode-relay
```

### 4. 桌面端配置

ZCode 桌面端 → 设置 → 手机远控：填 relay 地址（如 `https://relay.example.com`）与 token，开启开关；随后「生成手机授权链接」，扫码或手机打开即可。

## 环境变量

| 变量                                           | 默认           | 说明                                                                         |
| ---------------------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `ZCODE_RELAY_HOST`                             | `0.0.0.0`      | 监听地址                                                                     |
| `ZCODE_RELAY_PORT`                             | `8787`         | 监听端口                                                                     |
| `ZCODE_RELAY_TOKEN`                            | （空）         | deployment token；设置后桌面控制连接必须携带 `Authorization: Bearer <token>` |
| `ZCODE_RELAY_WEB_ROOT`                         | （内置引导页） | 手机静态页面根目录（`packages/web` 构建产物）                                |
| `ZCODE_RELAY_TLS_CERT` / `ZCODE_RELAY_TLS_KEY` | （空）         | 预留；当前版本建议由 nginx/caddy 终结 TLS                                    |

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

relay 运营者可以看到手机与桌面之间的 RPC 字节流（等效于网络接入点）。请将 relay 部署在自己信任的服务器并启用 TLS；deployment token 防止他人把桌面连到你的 relay，grant 的一次性语义限制手机侧票据的泄漏面。

## 测试

```bash
pnpm --filter @zcode/relay test
```
