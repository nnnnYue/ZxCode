#!/usr/bin/env node
// 上游同步回潜门禁（见 specs/upstream-sync-policy.md「状态所有者与接口」）。
// 目的：每次从 zai-org/ZCode 合并后，防止 REMOVALS.md 已剔除的 z.ai 平台链路
// 借上游改动重新回到运行时代码。只扫描源码，不扫描构建产物与文档。
//
// 允许清单（产品保留项，见 REMOVALS.md「保留说明」与 specs/upstream-sync-policy.md）：
// - 模型 Provider 端点（api.z.ai / open.bigmodel.cn）随内置 provider 配置保留，不扫描；
// - cdn-zcode.z.ai（远程资源与插件市场 CDN）为保留项；
// - zcode.z.ai 仅允许出现在下列文件（默认常量、测试、记录性注释、构建脚本）。
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SCAN_ROOTS = ["packages", "apps", "scripts", "config"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs"]);
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "out",
  "dist-types",
  "bundled-agents",
  "win-unpacked",
  "mock-cdn",
  ".turbo",
  "coverage",
  "test-results",
]);

// zcode.z.ai 平台 origin 的合法落点（相对仓库根）。新增合法落点必须先更新本清单与 spec。
const ZCODE_ORIGIN_ALLOWED_FILES = new Set([
  "packages/shared/src/zcodeEndpoint.ts", // 默认 origin 常量，仅用于身份标识与 URL 重写
  "packages/shared/test/zcode-source-headers.test.ts", // 模型请求 Referer 测试
  "packages/web/src/communityUrl.ts", // 注释记录：原 /api/v1/client/configs 拉取链路已删
  "packages/desktop/src/main/remoteCdn.ts", // cdn-zcode.z.ai 子串，CDN 保留项
  "scripts/update-builtin-provider-config.mjs", // 构建脚本默认基址
  "scripts/fetch-official-marketplace.mjs", // 插件市场 CDN 保留项（cdn-zcode.z.ai）
  "packages/desktop/electron-builder.config.js", // 打包 homepage 元数据
  "scripts/check-no-zai-runtime-endpoints.mjs", // 本脚本自身的模式与注释
]);

// REMOVALS.md 已剔除链路的哨兵符号：任何回潜都应直接失败。
const SENTINEL_PATTERNS = [
  { pattern: /@arms\/rum/u, label: "ARMS RUM 遥测（已移除）" },
  { pattern: /electron-updater/u, label: "自动更新链路（已移除）" },
  { pattern: /\/event\/report/u, label: "通用事件上报端点（已移除）" },
  { pattern: /bigmodel-oauth/u, label: "BigModel OAuth 登录（已移除）" },
  { pattern: /official-coding-plan-gateway/u, label: "Coding Plan 网关改写（已移除）" },
  { pattern: /useOnboardingTelemetry/u, label: "引导遥测（已移除）" },
  { pattern: /officialMarketplaceAutoRefresh/u, label: "插件市场在线刷新（已移除）" },
];
const ZCODE_ORIGIN_PATTERN = /zcode\.z\.ai/u;

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      yield* walk(fullPath);
      continue;
    }
    if (!SCAN_EXTENSIONS.has(path.extname(entry.name))) continue;
    yield fullPath;
  }
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

const violations = [];
const repoRoot = process.cwd();

for (const root of SCAN_ROOTS) {
  const rootDir = path.join(repoRoot, root);
  if (!(await fileExists(rootDir))) continue;
  for await (const filePath of walk(rootDir)) {
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join("/");
    if (relativePath === "scripts/check-no-zai-runtime-endpoints.mjs") continue;
    let content;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    const checkLine = (lineIndex, pattern, label) => {
      if (pattern.test(lines[lineIndex])) {
        violations.push(
          `${relativePath}:${lineIndex + 1}: ${label}\n    ${lines[lineIndex].trim().slice(0, 160)}`,
        );
      }
    };
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (ZCODE_ORIGIN_PATTERN.test(lines[lineIndex])) {
        if (!ZCODE_ORIGIN_ALLOWED_FILES.has(relativePath)) {
          checkLine(lineIndex, ZCODE_ORIGIN_PATTERN, "zcode.z.ai 平台端点字面量（须先更新允许清单与 spec）");
        }
        continue;
      }
      for (const { pattern, label } of SENTINEL_PATTERNS) {
        checkLine(lineIndex, pattern, label);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`[check-no-zai-runtime-endpoints] 发现 ${violations.length} 处回潜：\n`);
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  console.error(
    "\n处置判据见 REMOVALS.md 与 specs/upstream-sync-policy.md：属 REMOVALS 领域的维持剔除；\n确属新保留项的，先更新本脚本的允许清单并同步 spec。",
  );
  process.exit(1);
}

console.log("[check-no-zai-runtime-endpoints] OK：无 z.ai 平台链路回潜");
