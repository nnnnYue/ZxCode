import { readFileSync } from "node:fs";
import { createRelayHttpServer } from "./http.js";

/**
 * 自部署 relay 入口。环境变量：
 * - ZXCODE_RELAY_HOST / ZXCODE_RELAY_PORT：监听地址（默认 0.0.0.0:8787）。
 * - ZXCODE_RELAY_TOKEN：deployment token；设置后桌面控制连接必须携带 Bearer token。
 * - ZXCODE_RELAY_WEB_ROOT：手机静态页面根目录（packages/web 构建产物）。
 * - ZXCODE_RELAY_TLS_CERT / ZXCODE_RELAY_TLS_KEY：可选自签 TLS；主推 nginx/caddy 终结 TLS。
 */
function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const portValue = readEnv("ZXCODE_RELAY_PORT");
const port = portValue ? Number.parseInt(portValue, 10) : 8787;
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[relay] invalid ZXCODE_RELAY_PORT: ${portValue}`);
  process.exit(1);
}

const logger: Pick<Console, "info" | "warn" | "error"> = {
  info: (...args: unknown[]) => console.log("[relay]", ...args),
  warn: (...args: unknown[]) => console.warn("[relay]", ...args),
  error: (...args: unknown[]) => console.error("[relay]", ...args),
};

let shuttingDown = false;
const relay = await createRelayHttpServer({
  host: readEnv("ZXCODE_RELAY_HOST") ?? "0.0.0.0",
  port,
  token: readEnv("ZXCODE_RELAY_TOKEN"),
  webRoot: readEnv("ZXCODE_RELAY_WEB_ROOT"),
  logger,
});

if (readEnv("ZXCODE_RELAY_TLS_CERT") && readEnv("ZXCODE_RELAY_TLS_KEY")) {
  // 自带 TLS 的部署入口：证书常量读取只做存在性校验，实际终结建议交给反代。
  readFileSync(readEnv("ZXCODE_RELAY_TLS_CERT") as string);
  logger.warn(
    "[relay] ZXCODE_RELAY_TLS_CERT/KEY detected: current build terminates TLS at the reverse proxy; these variables are reserved",
  );
}

logger.info(
  `zxcode-relay ready: host=${relay.host} port=${relay.port} token=${
    readEnv("ZXCODE_RELAY_TOKEN") ? "enabled" : "disabled"
  } webRoot=${readEnv("ZXCODE_RELAY_WEB_ROOT") ?? "(builtin page)"}`,
);

const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[relay] ${signal} received; shutting down`);
  void relay
    .close()
    .catch((error: unknown) => {
      logger.error("[relay] close failed:", error);
    })
    .finally(() => {
      process.exit(0);
    });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
