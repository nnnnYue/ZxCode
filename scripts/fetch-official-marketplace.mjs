#!/usr/bin/env node
/* eslint-disable max-lines -- 下载、校验、解压与代码生成集中一处，保持部署/回滚的原子性。 */
// 编译期官方插件市场离线化：下载 CDN 目录 + 全部插件 zip + 图标，落盘为随包资源，
// 并生成两份数据文件（bundled seed 条目、UI 本地图标映射）。
//
// 背景：插件商店去平台化后不再有任何运行时 CDN fetch 路径。官方市场的完整目录在
// 编译期物化为仓库快照：
//   packages/desktop/resources/official-marketplace/
//     plugins/<name>/<version>/   插件 zip 解压目录（随包分发，seed 的 filesystem 源）
//     assets/<name>/icon.png      目录图标快照
//     manifest.json               下载清单（sha256），幂等增量更新
// 生成文件：
//   apps/zcode-cli/packages/bootstrap/src/app/official-marketplace-offline-entries.ts
//     （合并进 OFFICIAL_PLUGIN_DEFINITIONS 的 bundled seed 条目，cachePath 语义与内置 seed 一致）
//   packages/ui/src/lib/officialPluginIcons.generated.ts
//     （插件 id -> 随包图标映射；UI 不再引用 cdn-zxcode 资源 URL）
//
// 用法：
//   node scripts/fetch-official-marketplace.mjs            # 增量下载 + 生成（幂等）
//   node scripts/fetch-official-marketplace.mjs --help
//
// 环境变量：
//   ZXCODE_MARKETPLACE_CDN_BASE_URL  CDN 基址覆盖（默认 https://cdn-zcode.z.ai）
//
// 网络失败 / 离线：无法取得目录 manifest 时打印警告并以 0 退出——仓库里已提交的
// 快照继续兜底；目录已取得但单个资源下载失败属数据完整性问题，直接报错退出。

import process from "node:process";
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "..");
const marketplaceResourceRoot = resolve(
  repositoryRoot,
  "packages/desktop/resources/official-marketplace",
);
const uiAssetsRoot = resolve(repositoryRoot, "packages/ui/src/assets/plugin-icons/official");
const uiGeneratedFile = resolve(
  repositoryRoot,
  "packages/ui/src/lib/officialPluginIcons.generated.ts",
);
const bootstrapGeneratedFile = resolve(
  repositoryRoot,
  "apps/zcode-cli/packages/bootstrap/src/app/official-marketplace-offline-entries.ts",
);
const manifestFile = join(marketplaceResourceRoot, "manifest.json");
const defaultCdnBaseUrl = "https://cdn-zcode.z.ai";
const manifestRelativePath = "zcode/official-plugin/marketplace.json";
const requestTimeoutMs = 30_000;
const downloadAttempts = 3;
const OFFICIAL_MARKETPLACE_ID = "zcode-plugins-official";

// 产品下架名单：以下插件不再随包分发。这些插件的数据能力全部挂载在
// ${ZXCODE_BASE_URL}/api/v1/mcp/server/* 官方 MCP 端点上，随产品移除对
// zcode.z.ai 的运行时依赖一并下架（specs/official-marketplace-removal-list.md）。
// 在计算 payload 哈希与 staging 之前过滤，保证重新生成快照不会使其复活。
const REMOVED_PLUGIN_NAMES = new Set([
  "run-fpa",
  "vet-companies",
  "assess-credit",
  "pick-funds",
  "find-clients",
  "watch-positions",
  "model-deals",
  "read-macro",
  "write-research",
  "finance-search",
  "hexin",
  "tianyancha",
  "wind",
  "video-agent-kit",
]);

const require = createRequire(import.meta.url);

// 内置插件（official-plugin-definitions.ts）图标也发布在同一 CDN assets 路径下。
// key 是 UI 的插件 id 前缀（name），value 是 CDN assets 目录名（computer-use 更名后
// 资源仍在 zcode-cua 目录）。documents/pdf/presentations/spreadsheets/image-search/
// plugin-creator 已有手工维护的本地图标，不在生成范围。
const builtinIconAssetDirs = {
  "android-emulator": "android-emulator",
  "browser-use": "browser-use",
  "computer-use": "zcode-cua",
  "ios-simulator": "ios-simulator",
  "restore-legacy-sessions": "restore-legacy-sessions",
  "skill-creator": "skill-creator",
  "zcode-guide": "zcode-guide",
};

function printHelp() {
  console.log(`Usage: node scripts/fetch-official-marketplace.mjs [--help]

下载官方插件市场 CDN 目录与全部插件包/图标，落盘为随包离线资源并生成
bundled seed 条目与 UI 图标映射两个数据文件。内容未变化时跳过写盘（幂等）。

Environment:
  ZXCODE_MARKETPLACE_CDN_BASE_URL  CDN 基址（默认 ${defaultCdnBaseUrl}）
`);
}

function cdnBaseUrl(env = process.env) {
  return (env.ZXCODE_MARKETPLACE_CDN_BASE_URL?.trim() || defaultCdnBaseUrl).replace(/\/+$/u, "");
}

async function fetchBufferWithRetry(
  url,
  { attempts = downloadAttempts, timeoutMs = requestTimeoutMs } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) throw new Error("empty response body");
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      console.warn(`  [warn] 下载失败 (${attempt}/${attempts}): ${url}`);
      console.warn(`  [warn] 原因: ${String(error)}`);
    }
  }
  throw lastError;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonIfChanged(path, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(path) && readFileSync(path, "utf8") === contents) {
    console.log(`  [skip] ${relativeToRepo(path)} unchanged`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
  console.log(`  [ok] ${relativeToRepo(path)}`);
}

function relativeToRepo(path) {
  const relative = path.slice(repositoryRoot.length + 1);
  return relative;
}

/** yauzl 解包（桌面/adapter 已有依赖，跨平台且不依赖系统 unzip）。 */
async function extractZip(zipPath, destinationDir) {
  const yauzl = require("yauzl");
  await new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (openError, zipfile) => {
      if (openError) {
        rejectPromise(openError);
        return;
      }
      zipfile.on("error", rejectPromise);
      zipfile.on("end", () => resolvePromise());
      zipfile.on("entry", (entry) => {
        if (entry.fileName.endsWith("/")) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamError, readStream) => {
          if (streamError) {
            rejectPromise(streamError);
            return;
          }
          const outputPath = join(destinationDir, entry.fileName);
          mkdirSync(dirname(outputPath), { recursive: true });
          pipeline(readStream, createWriteStream(outputPath))
            .then(() => zipfile.readEntry())
            .catch(rejectPromise);
        });
      });
      zipfile.readEntry();
    });
  });
}

/**
 * 解压 zip 并按 CDN 条目的 path 字段裁掉顶层目录，返回解压后的插件根目录。
 * 与运行时 zip 源的 stripRoot 语义一致：解压根必须是合法插件根（含 .zcode-plugin/plugin.json）。
 */
async function stageExtractedPlugin(zipPath, entry, targetRoot) {
  const stagingDir = mkdtempSync(join(tmpdir(), `zcode-marketplace-${entry.name}-`));
  try {
    await extractZip(zipPath, stagingDir);
    const topLevelEntries = readdirSync(stagingDir);
    const declaredRoot = typeof entry.source?.path === "string" ? entry.source.path : undefined;
    const rootCandidates = declaredRoot
      ? [declaredRoot]
      : topLevelEntries.filter((name) => !name.startsWith("."));
    const pluginRootName =
      rootCandidates.find((name) =>
        existsSync(join(stagingDir, name, ".zcode-plugin", "plugin.json")),
      ) ?? (existsSync(join(stagingDir, ".zcode-plugin", "plugin.json")) ? "." : undefined);
    if (!pluginRootName) {
      throw new Error(
        `插件包 ${entry.name}@${entry.version} 解压后找不到 .zcode-plugin/plugin.json（顶层: ${topLevelEntries.join(", ") || "空"}）`,
      );
    }
    const pluginRoot = join(stagingDir, pluginRootName);
    rmSync(targetRoot, { recursive: true, force: true });
    mkdirSync(dirname(targetRoot), { recursive: true });
    // 优先 rename 原子落位；跨设备（tmpdir 与仓库不同卷）时回退递归复制。
    try {
      renameSync(pluginRoot, targetRoot);
    } catch {
      cpSync(pluginRoot, targetRoot, { recursive: true });
    }
  } finally {
    rmSync(stagingDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/** 收集解压目录的顶层条目（内置 seed 白名单之外的额外资源），供 runtimeTopLevelPaths 透传。 */
function collectTopLevelPaths(pluginRoot) {
  const builtinAllowed = new Set([
    ".mcp.json",
    ".zcode-plugin",
    "README.md",
    "agents",
    "commands",
    "dist",
    "docs",
    "hooks",
    "output-styles",
    "package.json",
    "scripts",
    "skills",
    "templates",
  ]);
  const excluded = new Set([".DS_Store", ".venv", "__pycache__", "node_modules"]);
  return readdirSync(pluginRoot, { withFileTypes: true })
    .filter((item) => !excluded.has(item.name) && !item.name.startsWith("."))
    .map((item) => item.name)
    .filter((name) => !builtinAllowed.has(name))
    .sort((left, right) => left.localeCompare(right));
}

function toScriptString(value) {
  return JSON.stringify(value);
}

/** 对象/数组按 oxfmt 风格的多行缩进输出（生成文件进仓库前会被 oxfmt 归一化，这里尽量贴近）。 */
function toIndentedScriptValue(value, indent) {
  return JSON.stringify(value, null, 4).replaceAll("\n", `\n${indent}`);
}

function generateBootstrapEntries({ cdnEntries, generatedAt }) {
  const lines = [];
  lines.push("/* eslint-disable max-lines -- 生成的目录数据文件，条目数随官方市场增长。 */");
  lines.push("// 本文件由 scripts/fetch-official-marketplace.mjs 生成，请勿手工编辑。");
  lines.push(`// 数据来源：官方插件市场 CDN 目录快照（生成时间 ${generatedAt}）。`);
  lines.push("//");
  lines.push("// 去平台化后官方市场目录完全随包分发：条目与内置插件共用同一 filesystem seed");
  lines.push("// 机制（rootCandidates 指向随包解压目录，cachePath 由 bundled-plugins.ts 统一写入");
  lines.push("// 应用 storage cache），商店展示走 listing seed，图标由 UI 侧生成的本地映射解析，");
  lines.push("// 目录数据与图标 URL 均不再引用任何运行时 CDN 地址。");
  lines.push('import type { OfficialPluginDefinition } from "./official-plugin-definitions.js";');
  lines.push("");
  lines.push(
    "export const OFFICIAL_MARKETPLACE_OFFLINE_ENTRIES: readonly OfficialPluginDefinition[] = [",
  );
  for (const entry of cdnEntries) {
    lines.push("  {");
    lines.push(`    name: ${toScriptString(entry.name)},`);
    lines.push(`    version: ${toScriptString(entry.version)},`);
    lines.push(`    requiredSeedPaths: [".zcode-plugin/plugin.json"],`);
    lines.push("    rootCandidates: [");
    for (const candidate of entry.rootCandidates) {
      lines.push(`      ${toScriptString(candidate)},`);
    }
    lines.push("    ],");
    if (entry.runtimeTopLevelPaths.length > 0) {
      lines.push(
        `    runtimeTopLevelPaths: [${entry.runtimeTopLevelPaths.map(toScriptString).join(", ")}],`,
      );
    }
    const listingFields = [];
    for (const key of [
      "displayName",
      "displayName_i18n",
      "description_i18n",
      "category",
      "author",
      "homepage",
      "examplePrompts",
      "examplePrompts_i18n",
      "requiresPaidPlan",
    ]) {
      if (entry.listing?.[key] === undefined) continue;
      listingFields.push(`      ${key}: ${toIndentedScriptValue(entry.listing[key], "      ")},`);
    }
    if (listingFields.length > 0) {
      lines.push("    listing: {");
      lines.push(...listingFields);
      lines.push("    },");
    }
    lines.push("  },");
  }
  lines.push("];");
  return `${lines.join("\n")}\n`;
}

function generateUiIconMap({ iconEntries, heroEntries, generatedAt }) {
  const lines = [];
  lines.push("// 本文件由 scripts/fetch-official-marketplace.mjs 生成，请勿手工编辑。");
  lines.push(`// 官方插件图标的随包快照映射（生成时间 ${generatedAt}）。`);
  lines.push("// UI 对官方插件一律优先解析本映射，不再请求任何远端资源 URL。");
  for (const entry of iconEntries) {
    lines.push(
      `import ${entry.importName} from "@/assets/plugin-icons/official/${entry.fileName}";`,
    );
  }
  lines.push("");
  lines.push(
    "export const OFFICIAL_PLUGIN_ICON_BY_ID_GENERATED: Readonly<Record<string, string>> = {",
  );
  for (const entry of iconEntries) {
    lines.push(`  ${toScriptString(entry.pluginId)}: ${entry.importName},`);
  }
  lines.push("};");
  lines.push("");
  lines.push("// 详情页 hero 图随包快照；当前官方目录未发布 hero 资源，映射保持为空。");
  for (const entry of heroEntries) {
    lines.push(
      `import ${entry.importName} from "@/assets/plugin-icons/official/hero/${entry.fileName}";`,
    );
  }
  lines.push(
    "export const OFFICIAL_PLUGIN_HERO_BY_ID_GENERATED: Readonly<Record<string, string>> = {",
  );
  for (const entry of heroEntries) {
    lines.push(`  ${toScriptString(entry.pluginId)}: ${entry.importName},`);
  }
  lines.push("};");
  return `${lines.join("\n")}\n`;
}

function writeIfChanged(path, contents) {
  if (existsSync(path) && readFileSync(path, "utf8") === contents) {
    console.log(`  [skip] ${relativeToRepo(path)} unchanged`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
  console.log(`  [ok] ${relativeToRepo(path)}`);
}

/** 生成文件进仓库前用 oxfmt 归一化（与各 workspace 的 `fmt:check` 一致）；工具缺失时仅告警。 */
function normalizeGeneratedFormatting(...paths) {
  for (const path of paths) {
    try {
      const { execFileSync } = require("node:child_process");
      // apps/zcode-cli 是独立 workspace（自带 .oxfmtrc），必须用它自己的 oxfmt 归一化。
      const inCliWorkspace = path.startsWith(resolve(repositoryRoot, "apps/zcode-cli"));
      const oxfmtCli = inCliWorkspace
        ? join(repositoryRoot, "apps/zcode-cli", "node_modules", ".bin", "oxfmt")
        : join(repositoryRoot, "node_modules", "oxfmt", "bin", "oxfmt");
      execFileSync(process.execPath, [oxfmtCli, path], {
        cwd: inCliWorkspace ? join(repositoryRoot, "apps/zcode-cli") : repositoryRoot,
        stdio: "ignore",
      });
    } catch (error) {
      console.warn(`  [warn] oxfmt 归一化失败（文件仍为合法 TS）: ${String(error)}`);
    }
  }
}

function camelImportName(name) {
  const normalized = name.replace(/[^a-zA-Z0-9]+(.)?/g, (_, character) =>
    character ? character.toUpperCase() : "",
  );
  return `${normalized}Icon`;
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    printHelp();
    return;
  }
  const base = cdnBaseUrl();
  const manifestUrl = `${base}/${manifestRelativePath}`;
  console.log(`[fetch-official-marketplace] 下载目录: ${manifestUrl}`);
  let marketplace;
  try {
    marketplace = JSON.parse((await fetchBufferWithRetry(manifestUrl)).toString("utf8"));
  } catch (error) {
    // 离线是预期场景：仓库快照继续兜底，不阻断构建。
    console.warn(
      `[fetch-official-marketplace] [warn] 无法下载官方市场目录（保留仓库快照兜底）: ${String(error)}`,
    );
    return;
  }
  if (marketplace?.name !== OFFICIAL_MARKETPLACE_ID || !Array.isArray(marketplace.plugins)) {
    throw new Error(`目录 manifest 不合法（name 必须为 ${OFFICIAL_MARKETPLACE_ID}）`);
  }
  const beforeFilterCount = marketplace.plugins.length;
  // 只按下架名单过滤；name 缺失等非法条目仍交给下游逐条校验抛错，不在这里静默吞掉。
  marketplace.plugins = marketplace.plugins.filter((raw) => !REMOVED_PLUGIN_NAMES.has(raw.name));
  const removedCount = beforeFilterCount - marketplace.plugins.length;
  if (removedCount > 0) {
    console.log(
      `[fetch-official-marketplace] 按下架名单跳过 ${removedCount} 个插件: ${[...REMOVED_PLUGIN_NAMES].join(", ")}`,
    );
  }

  const previousManifest = readJson(manifestFile) ?? {};
  const previousEntries = new Map(
    (previousManifest.entries ?? []).map((entry) => [entry.name, entry]),
  );
  mkdirSync(marketplaceResourceRoot, { recursive: true });

  const generatedAt = new Date().toISOString();
  // 内容未变化时保持 generatedAt 稳定，保证 manifest 与生成文件字节级幂等。
  const marketplacePayloadSha256 = sha256(Buffer.from(JSON.stringify(marketplace)));
  const contentUnchanged = previousManifest.marketplacePayloadSha256 === marketplacePayloadSha256;
  const stableGeneratedAt =
    contentUnchanged && typeof previousManifest.generatedAt === "string"
      ? previousManifest.generatedAt
      : generatedAt;
  const stagedEntries = [];
  const iconEntries = [];
  let downloadedCount = 0;
  let skippedCount = 0;

  for (const raw of marketplace.plugins) {
    const name = typeof raw.name === "string" ? raw.name : undefined;
    const version = typeof raw.version === "string" && raw.version ? raw.version : "0.0.0";
    if (!name) throw new Error("目录条目缺少 name");
    const source = raw.source ?? {};
    const zipUrl = typeof source.url === "string" ? source.url : undefined;
    const expectedSha256 =
      typeof source.sha256 === "string" ? source.sha256.toLowerCase() : undefined;
    if (!zipUrl || !expectedSha256) {
      throw new Error(`目录条目 ${name} 缺少 zip url/sha256，离线化无法保证完整性`);
    }

    const previous = previousEntries.get(name);
    const targetRoot = join(marketplaceResourceRoot, "plugins", name, version);
    // staging 标记放在版本目录外，避免被 seed 当作插件内容复制进缓存。
    const markerPath = join(marketplaceResourceRoot, "plugins", name, `.staged-${version}.json`);
    const cacheHit =
      existsSync(markerPath) &&
      existsSync(join(targetRoot, ".zcode-plugin", "plugin.json")) &&
      previous?.zip?.sha256 === expectedSha256 &&
      readJson(markerPath)?.zipSha256 === expectedSha256;
    if (!cacheHit) {
      console.log(`  [download] ${name}@${version}`);
      const zipBytes = await fetchBufferWithRetry(zipUrl);
      const actualSha256 = sha256(zipBytes);
      if (actualSha256 !== expectedSha256) {
        throw new Error(
          `插件包 sha256 不匹配: ${name}@${version}（期望 ${expectedSha256}，实际 ${actualSha256}）`,
        );
      }
      const zipStaging = join(marketplaceResourceRoot, "plugins", name, `${version}.plugin.zip`);
      mkdirSync(dirname(zipStaging), { recursive: true });
      writeFileSync(zipStaging, zipBytes);
      await stageExtractedPlugin(zipStaging, { name, version, source }, targetRoot);
      rmSync(zipStaging, { force: true });
      writeFileSync(
        markerPath,
        `${JSON.stringify({ name, version, zipSha256: actualSha256, stagedAt: new Date().toISOString() }, null, 2)}\n`,
        "utf8",
      );
      downloadedCount += 1;
    } else {
      skippedCount += 1;
    }

    const runtimeTopLevelPaths = collectTopLevelPaths(targetRoot);
    stagedEntries.push({
      name,
      version,
      zip: { sha256: expectedSha256, url: zipUrl },
      rootCandidates: [
        // 打包态：glm 入口旁（resources/glm -> ../official-marketplace，extraResources 落位）。
        `official-marketplace/plugins/${name}/${version}`,
        `../official-marketplace/plugins/${name}/${version}`,
        // 仓库根 cwd（脚本/CLI 从仓库根运行）。
        `packages/desktop/resources/official-marketplace/plugins/${name}/${version}`,
        // 桌面 dev：bundled-agents/<platform>/glm 上溯到 packages/desktop。
        `../../../resources/official-marketplace/plugins/${name}/${version}`,
      ],
      runtimeTopLevelPaths,
      listing: {
        ...(typeof raw.displayName === "string" ? { displayName: raw.displayName } : {}),
        ...(raw.displayName_i18n && typeof raw.displayName_i18n === "object"
          ? { displayName_i18n: raw.displayName_i18n }
          : {}),
        ...(raw.description_i18n && typeof raw.description_i18n === "object"
          ? { description_i18n: raw.description_i18n }
          : {}),
        ...(typeof raw.category === "string" ? { category: raw.category } : {}),
        ...(raw.author !== undefined ? { author: raw.author } : {}),
        ...(typeof raw.homepage === "string" ? { homepage: raw.homepage } : {}),
        ...(Array.isArray(raw.examplePrompts) ? { examplePrompts: raw.examplePrompts } : {}),
        ...(raw.examplePrompts_i18n && typeof raw.examplePrompts_i18n === "object"
          ? { examplePrompts_i18n: raw.examplePrompts_i18n }
          : {}),
        ...(raw.requiresPaidPlan === true ? { requiresPaidPlan: true } : {}),
      },
    });

    const iconUrl = typeof raw.icon === "string" ? raw.icon : undefined;
    if (iconUrl) {
      const iconBytes = await fetchBufferWithRetry(iconUrl);
      const iconSha256 = sha256(iconBytes);
      const iconPath = join(uiAssetsRoot, `${name}.png`);
      if (!existsSync(iconPath) || sha256(readFileSync(iconPath)) !== iconSha256) {
        mkdirSync(uiAssetsRoot, { recursive: true });
        writeFileSync(iconPath, iconBytes);
        console.log(`  [ok] ${relativeToRepo(iconPath)}`);
        downloadedCount += 1;
      } else {
        skippedCount += 1;
      }
      iconEntries.push({
        pluginId: `${name}@${OFFICIAL_MARKETPLACE_ID}`,
        fileName: `${name}.png`,
        importName: camelImportName(name),
        sha256: iconSha256,
      });
    }
  }

  // 内置插件图标快照（UI 生成映射用；这些 id 不在 CDN 目录里）。
  for (const [pluginName, assetDir] of Object.entries(builtinIconAssetDirs)) {
    const iconUrl = `${base}/zcode/official-plugin/assets/${assetDir}/icon.png`;
    const iconBytes = await fetchBufferWithRetry(iconUrl);
    const iconSha256 = sha256(iconBytes);
    const iconPath = join(uiAssetsRoot, `${pluginName}.png`);
    if (!existsSync(iconPath) || sha256(readFileSync(iconPath)) !== iconSha256) {
      mkdirSync(uiAssetsRoot, { recursive: true });
      writeFileSync(iconPath, iconBytes);
      console.log(`  [ok] ${relativeToRepo(iconPath)}`);
      downloadedCount += 1;
    } else {
      skippedCount += 1;
    }
    iconEntries.push({
      pluginId: `${pluginName}@${OFFICIAL_MARKETPLACE_ID}`,
      fileName: `${pluginName}.png`,
      importName: camelImportName(pluginName),
      sha256: iconSha256,
    });
  }

  const heroEntries = [];
  for (const raw of marketplace.plugins) {
    if (typeof raw.heroImage !== "string" || !raw.heroImage) continue;
    const heroBytes = await fetchBufferWithRetry(raw.heroImage);
    const heroFileName = `${raw.name}.png`;
    const heroPath = join(uiAssetsRoot, "hero", heroFileName);
    if (!existsSync(heroPath) || sha256(readFileSync(heroPath)) !== sha256(heroBytes)) {
      mkdirSync(join(uiAssetsRoot, "hero"), { recursive: true });
      writeFileSync(heroPath, heroBytes);
      console.log(`  [ok] ${relativeToRepo(heroPath)}`);
    }
    heroEntries.push({
      pluginId: `${raw.name}@${OFFICIAL_MARKETPLACE_ID}`,
      fileName: heroFileName,
      importName: `${camelImportName(raw.name)}Hero`,
    });
  }
  const entriesForManifest = stagedEntries.map(
    ({ name, version, zip, rootCandidates, runtimeTopLevelPaths, listing }) => ({
      name,
      version,
      zip,
      rootCandidates,
      runtimeTopLevelPaths,
      listing,
    }),
  );
  writeJsonIfChanged(manifestFile, {
    generatedAt: stableGeneratedAt,
    marketplace: OFFICIAL_MARKETPLACE_ID,
    marketplacePayloadSha256,
    source: manifestUrl,
    entries: entriesForManifest,
    icons: iconEntries.map(({ pluginId, fileName, sha256: iconSha }) => ({
      pluginId,
      fileName,
      sha256: iconSha,
    })),
  });

  writeIfChanged(
    bootstrapGeneratedFile,
    generateBootstrapEntries({ cdnEntries: stagedEntries, generatedAt: stableGeneratedAt }),
  );
  writeIfChanged(
    uiGeneratedFile,
    generateUiIconMap({ iconEntries, heroEntries, generatedAt: stableGeneratedAt }),
  );
  normalizeGeneratedFormatting(bootstrapGeneratedFile, uiGeneratedFile);

  console.log(
    `[fetch-official-marketplace] 完成: ${stagedEntries.length} 个插件（本次下载 ${downloadedCount}，命中缓存 ${skippedCount}），图标 ${iconEntries.length} 个`,
  );
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryHref === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(
      `[fetch-official-marketplace] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
