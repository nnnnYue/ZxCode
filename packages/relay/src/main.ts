import { readFileSync } from "node:fs";
import { createRelayHttpServer } from "./http.js";

/**
 * 自部署 relay 入口。环境变量：
 * - ZCODE_RELAY_HOST / ZCODE_RELAY_PORT：监听地址（默认 0.0.0.0:8787）。
 * - ZCODE_RELAY_TOKEN：deployment token；设置后桌面控制连接必须携带 Bearer token。
 * - ZCODE_RELAY_WEB_ROOT：手机静态页面根目录（packages/web 构建产物）。
 * - ZCODE_RELAY_TLS_CERT / ZCODE_RELAY_TLS_KEY：可选自签 TLS；主推 nginx/caddy 终结 TLS。
 */
function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const portValue = readEnv("ZCODE_RELAY_PORT");
const port = portValue ? Number.parseInt(portValue, 10) : 8787;
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[relay] invalid ZCODE_RELAY_PORT: ${portValue}`);
  process.exit(1);
}

const logger: Pick<Console, "info" | "warn" | "error"> = {
  info: (...args: unknown[]) => console.log("[relay]", ...args),
  warn: (...args: unknown[]) => console.warn("[relay]", ...args),
  error: (...args: unknown[]) => console.error("[relay]", ...args),
};

let shuttingDown = false;
const relay = await createRelayHttpServer({
  host: readEnv("ZCODE_RELAY_HOST") ?? "0.0.0.0",
  port,
  token: readEnv("ZCODE_RELAY_TOKEN"),
  webRoot: readEnv("ZCODE_RELAY_WEB_ROOT"),
  logger,
});

if (readEnv("ZCODE_RELAY_TLS_CERT") && readEnv("ZCODE_RELAY_TLS_KEY")) {
  // 自带 TLS 的部署入口：证书常量读取只做存在性校验，实际终结建议交给反代。
  readFileSync(readEnv("ZCODE_RELAY_TLS_CERT") as string);
  logger.warn(
    "[relay] ZCODE_RELAY_TLS_CERT/KEY detected: current build terminates TLS at the reverse proxy; these variables are reserved",
  );
}

logger.info(
  `zcode-relay ready: host=${relay.host} port=${relay.port} token=${
    readEnv("ZCODE_RELAY_TOKEN") ? "enabled" : "disabled"
  } webRoot=${readEnv("ZCODE_RELAY_WEB_ROOT") ?? "(builtin page)"}`,
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
