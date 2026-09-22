import { readFile, stat } from "node:fs/promises";
import { join, normalize, resolve, sep } from "node:path";
import type { Context } from "hono";

/** 手机静态页面托管（SPA fallback）；与控制/数据面 WS 端点分离，便于独立演进缓存策略。 */
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

const FALLBACK_PAGE_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZxCode Relay</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;margin:0;
align-items:center;justify-content:center;background:#0b0d12;color:#e6e8ee}
section{max-width:28rem;padding:2rem;border-radius:12px;background:#151922;border:1px solid #262c38}
code{background:#0b0d12;padding:.15em .4em;border-radius:4px;font-size:.9em}</style></head>
<body><section><h1 style="font-size:1.1rem;margin:0 0 .75rem">ZxCode Relay 正在运行</h1>
<p style="line-height:1.7;margin:0">手机页面未部署：请将 <code>packages/web</code> 构建产物放到
<code>ZXCODE_RELAY_WEB_ROOT</code> 指向的目录后重启 relay；随后在桌面端生成授权链接并在手机上打开。</p></section></body></html>`;

function lookupContentType(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** SPA 静态解析：优先精确文件，miss 时回退 index.html；结果必须仍在 webRoot 内。 */
async function resolveStaticFile(webRoot: string, pathname: string): Promise<string | null> {
  const root = resolve(webRoot);
  let filePath = normalize(join(root, decodeURIComponent(pathname)));
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    return null;
  }
  if ((await stat(filePath).catch(() => null))?.isFile()) {
    return filePath;
  }
  const fallback = join(root, "index.html");
  return (await stat(fallback).catch(() => null))?.isFile() ? fallback : null;
}

/** 注册 GET /* 手机页面路由；webRoot 缺省时返回内置引导页。 */
type StaticRouteApp = {
  get(path: string, handler: (context: Context) => Promise<Response>): unknown;
};

export function registerRelayStaticRoute(
  app: StaticRouteApp,
  webRoot: string | undefined,
  logger: Pick<Console, "error">,
): void {
  app.get("*", async (context) => {
    if (!webRoot) {
      return context.html(FALLBACK_PAGE_HTML, 200, { "Cache-Control": "no-store" });
    }
    try {
      const pathname = new URL(context.req.url).pathname;
      const filePath = await resolveStaticFile(webRoot, pathname);
      if (!filePath) {
        return context.notFound();
      }
      const body = await readFile(filePath);
      return context.body(body, 200, {
        "Content-Type": lookupContentType(filePath),
        // index.html 禁缓存，避免 relay 升级后手机端继续跑旧 bundle。
        "Cache-Control":
          pathname === "/" || pathname.endsWith(".html") ? "no-store" : "public, max-age=86400",
      });
    } catch (error) {
      logger.error("[relay] static serving failed:", error);
      return context.text("relay static serving failed", 500);
    }
  });
}
