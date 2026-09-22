#!/usr/bin/env node
// 编译期内置 Provider 配置更新：下载远端 Release -> 去平台化清洗 -> 运行时 Schema 校验 -> 写回仓库快照。
//
// 背景：产品已完成去平台化改造，内置 Provider 配置只保留「API Key / 静态套餐 Key」形态。
// 远端配置服务仍可能下发平台时代的账号型（zhipu-account）Provider、zcode.z.ai 网关模板和
// 官方 Key 管理页外跳链接；这些内容要么过不了 decodeZCodeBuiltinRelease 校验，要么把用户
// 指向已下线的平台页面。因此编译期拉取远端配置后必须先清洗再写回，保证仓库快照始终是
// 可通过构建校验链的兜底数据。
//
// 用法：
//   node scripts/update-builtin-provider-config.mjs                 # 默认：下载远端 + 清洗 + 校验 + 写回
//   node scripts/update-builtin-provider-config.mjs --local         # 只清洗本地快照（无网络，幂等）
//   node scripts/update-builtin-provider-config.mjs --check         # 只校验当前快照，不写回
//   node scripts/update-builtin-provider-config.mjs --out <file>    # 写到指定文件（默认 config/provider/zxcode-builtin.json）
//   node scripts/update-builtin-provider-config.mjs --force         # 跳过 revision 不回退保护（测试用）
//
// 环境变量：
//   ZXCODE_BASE_URL            配置服务基址（默认 https://zcode.z.ai）
//   ZXCODE_BUILTIN_PROVIDER_CONFIG_UPDATE_TARGET  目标文件覆盖（优先级低于 --out）
//
// 网络失败 / 离线：打印警告并以 0 退出——仓库快照继续兜底，不阻断构建。

import process from "node:process";
import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { runCommand } from "./spawn-command.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "..");
const defaultTargetPath = resolve(repositoryRoot, "config/provider/zxcode-builtin.json");
const maxReleaseBytes = 10 * 1024 * 1024;
const requestTimeoutMs = 20_000;
const downloadAttempts = 3;

// z.ai / bigmodel.cn 是已下线平台方的 Key 管理域名；其余厂商（openai/anthropic/opencode 等）保留。
const retiredApiKeyManagementUrlHosts = new Set(["z.ai", "bigmodel.cn"]);
// zcode.z.ai 是平台网关 baseUrl（zcode-plan / off-peak），宿主产品不再直连。
const retiredGatewayHost = "zcode.z.ai";
// 账号型（zhipu-account）Provider 已随登录/Coding Plan 网关下线（见 packages/provider/src/config/schema.ts）。
const retiredAccessTypes = new Set(["zhipu-account"]);

function printHelp() {
  console.log(`Usage: node scripts/update-builtin-provider-config.mjs [options]

下载远端内置 Provider 配置（Release JSON），执行去平台化清洗并通过运行时
decodeZCodeBuiltinRelease 校验后写回仓库快照；网络失败时保留快照并退出 0。

Options:
  (none)   下载远端配置并更新本地快照（默认行为）
  --local  跳过网络，只对本地快照执行清洗 + 校验 + 写回（幂等）
  --check  只校验当前快照能否通过 decode 校验链，不写回
  --out <file>           写入目标文件（默认 config/provider/zxcode-builtin.json）
  --force                跳过「远端 revision 不得回退」比较，强制写回
  -h, --help             显示本帮助

Environment:
  ZXCODE_BASE_URL       配置服务基址（默认 https://zcode.z.ai）
`);
}

function parseArgs(argv) {
  const options = { mode: "remote", out: undefined, force: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--local") {
      options.mode = "local";
    } else if (arg === "--check") {
      options.mode = "check";
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) throw new Error("--out 需要一个文件路径参数");
      options.out = resolve(process.cwd(), value);
      index += 1;
    } else {
      throw new Error(`未知参数: ${arg}（使用 --help 查看用法）`);
    }
  }
  return options;
}

function baseUrl(env = process.env) {
  return (env.ZXCODE_BASE_URL?.trim() || "https://zcode.z.ai").replace(/\/+$/u, "");
}

async function fetchTextWithRetry(
  url,
  { attempts = downloadAttempts, timeoutMs = requestTimeoutMs } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // 与 scripts/prepare-prebuilds.mjs 的 downloadWithRetry 同一策略：3 次重试 + 超时。
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      console.warn(`  [warn] 下载失败 (${attempt}/${attempts}): ${url}`);
      console.warn(`  [warn] 原因: ${String(error)}`);
    }
  }
  throw lastError;
}

async function fetchJsonWithLimit(url, maxBytes = maxReleaseBytes) {
  const text = await fetchTextWithRetry(url);
  const byteLength = Buffer.byteLength(text, "utf8");
  if (byteLength > maxBytes) {
    throw new Error(`响应超过 ${maxBytes} 字节上限 (${byteLength}): ${url}`);
  }
  return JSON.parse(text);
}

function isHostOnDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isRetiredApiKeyManagementUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname;
    return [...retiredApiKeyManagementUrlHosts].some((domain) => isHostOnDomain(hostname, domain));
  } catch {
    return false;
  }
}

function hitsRetiredGatewayHost(rawUrl) {
  try {
    return isHostOnDomain(new URL(rawUrl).hostname, retiredGatewayHost);
  } catch {
    // 非 URL 形态（如空值）按不命中处理。
    return false;
  }
}

/**
 * 去平台化清洗（纯函数，可复用）：
 * 1. 删除 api.baseUrl 命中 zcode.z.ai 的模板 / Provider 规则（zcode-plan、off-peak 网关）。
 * 2. 删除账号型（zhipu-account）Provider 规则——登录/Coding Plan 网关已下线，且该 access
 *    形态已被 provider-data-schema 拒绝，留着会让整份 Release 过不了 decode。
 * 3. 删除 z.ai / bigmodel.cn 域名下的 apiKeyManagementUrl 外跳；其余厂商保留。
 * 4. 级联清理引用已删 Provider/Template 的模型规则（builtinProviderModelRules、
 *    templateModelRules）与命中已删网关的 providerSiteRules。
 * revision / schemaVersion 不做任何改动（revision 回退保护由调用方负责）。
 */
export function sanitizeZCodeBuiltinProviderConfig(input) {
  const config = structuredClone(input);
  if (config?.config?.providerConfigRules == null || config?.config?.modelConfigRules == null) {
    throw new Error("Release JSON 缺少 config.providerConfigRules / config.modelConfigRules");
  }

  const providerConfigRules = config.config.providerConfigRules;
  const modelConfigRules = config.config.modelConfigRules;
  const removed = {
    templates: [],
    providers: [],
    apiKeyManagementUrls: [],
    providerSiteRules: 0,
    templateModelRules: 0,
    builtinProviderModelRules: 0,
  };

  const isRetiredApiBaseUrl = (rule) => hitsRetiredGatewayHost(rule?.config?.api?.baseUrl ?? "");
  const isRetiredAccess = (rule) => retiredAccessTypes.has(rule?.config?.access?.type ?? "");
  const stripRetiredApiKeyManagementUrl = (rule) => {
    const access = rule?.config?.access;
    if (access?.apiKeyManagementUrl === undefined) return;
    if (isRetiredApiKeyManagementUrl(access.apiKeyManagementUrl)) {
      removed.apiKeyManagementUrls.push(
        `${rule.templateId ?? rule.providerId}: ${access.apiKeyManagementUrl}`,
      );
      delete access.apiKeyManagementUrl;
    }
  };

  if (Array.isArray(providerConfigRules.templateRules)) {
    providerConfigRules.templateRules = providerConfigRules.templateRules.filter((rule) => {
      const retired = isRetiredApiBaseUrl(rule) || isRetiredAccess(rule);
      if (retired) removed.templates.push(rule.templateId);
      return !retired;
    });
    providerConfigRules.templateRules.forEach(stripRetiredApiKeyManagementUrl);
  }
  if (Array.isArray(providerConfigRules.providerRules)) {
    providerConfigRules.providerRules = providerConfigRules.providerRules.filter((rule) => {
      const retired = isRetiredApiBaseUrl(rule) || isRetiredAccess(rule);
      if (retired) removed.providers.push(rule.providerId);
      return !retired;
    });
    providerConfigRules.providerRules.forEach(stripRetiredApiKeyManagementUrl);
  }

  const liveProviderIds = new Set(
    (providerConfigRules.providerRules ?? []).map((rule) => rule.providerId),
  );
  const liveTemplateIds = new Set(
    (providerConfigRules.templateRules ?? []).map((rule) => rule.templateId),
  );

  if (Array.isArray(modelConfigRules.providerSiteRules)) {
    const before = modelConfigRules.providerSiteRules.length;
    // baseUrlMatch 是把 URL 转义后的正则源码（"zxcode\\.z\\.ai"）；去掉转义再判断域名命中。
    modelConfigRules.providerSiteRules = modelConfigRules.providerSiteRules.filter(
      (rule) =>
        !String(rule?.baseUrlMatch ?? "")
          .replaceAll("\\", "")
          .includes(retiredGatewayHost),
    );
    removed.providerSiteRules = before - modelConfigRules.providerSiteRules.length;
  }
  if (Array.isArray(modelConfigRules.templateModelRules)) {
    const before = modelConfigRules.templateModelRules.length;
    modelConfigRules.templateModelRules = modelConfigRules.templateModelRules.filter((rule) =>
      liveTemplateIds.has(rule.templateId),
    );
    removed.templateModelRules = before - modelConfigRules.templateModelRules.length;
  }
  if (Array.isArray(modelConfigRules.builtinProviderModelRules)) {
    const before = modelConfigRules.builtinProviderModelRules.length;
    modelConfigRules.builtinProviderModelRules = modelConfigRules.builtinProviderModelRules.filter(
      (rule) => liveProviderIds.has(rule.providerId),
    );
    removed.builtinProviderModelRules = before - modelConfigRules.builtinProviderModelRules.length;
  }

  return { config, removed };
}

/** 用与构建链相同的路径（tsx 动态加载 runtime decode）做内存校验，失败时不落盘。 */
async function decodeReleaseInMemory(release) {
  const { decodeZCodeBuiltinRelease } = await tsImport(
    pathToFileURL(resolve(repositoryRoot, "packages/provider-node/src/zcode-builtin-release.ts"))
      .href,
    import.meta.url,
  );
  decodeZCodeBuiltinRelease(release);
}

/** 写回后走 scripts/builtin-provider-config.mjs 的既有校验链（显式指向目标文件，避免被
 * 应用外壳注入的 ZXCODE_BUILTIN_PROVIDER_CONFIG_FILE 带偏）。 */
async function validateWrittenFile(targetPath) {
  const { loadBuiltinProviderConfig } = await import("./builtin-provider-config.mjs");
  await loadBuiltinProviderConfig({
    root: repositoryRoot,
    env: { ...process.env, ZXCODE_BUILTIN_PROVIDER_CONFIG_FILE: targetPath },
  });
}

/** oxfmt 归一化格式，保持与 `pnpm fmt:check` 一致；工具缺失时仅告警（文件仍是合法 JSON）。 */
function normalizeFormatting(targetPath) {
  try {
    runCommand(
      process.execPath,
      [resolve(repositoryRoot, "node_modules/oxfmt/bin/oxfmt"), targetPath],
      {
        cwd: repositoryRoot,
      },
    );
  } catch (error) {
    console.warn(`  [warn] oxfmt 归一化失败（文件仍为合法 JSON）: ${String(error)}`);
  }
}

async function readLocalRevision(targetPath) {
  try {
    return JSON.parse(await readFile(targetPath, "utf8"))?.revision ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const targetPath = options.out
    ? options.out
    : process.env.ZXCODE_BUILTIN_PROVIDER_CONFIG_UPDATE_TARGET?.trim()
      ? resolve(process.env.ZXCODE_BUILTIN_PROVIDER_CONFIG_UPDATE_TARGET)
      : defaultTargetPath;

  if (options.mode === "check") {
    await validateWrittenFile(targetPath);
    console.log(`[update-builtin-provider-config] 校验通过: ${targetPath}`);
    return;
  }

  let release;
  if (options.mode === "remote") {
    const version = JSON.parse(
      await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    ).version;
    const platform = `${process.platform}-${process.arch}`;
    const configsUrl = `${baseUrl()}/api/v1/client/configs?app_version=${encodeURIComponent(version)}&platform=${encodeURIComponent(platform)}`;
    console.log(`[update-builtin-provider-config] 拉取配置索引: ${configsUrl}`);
    const index = await fetchJsonWithLimit(configsUrl);
    const releaseUrl = index?.data?.configs?.builtin_provider_config_json;
    if (typeof releaseUrl !== "string" || !releaseUrl) {
      throw new Error("配置索引缺少 data.configs.builtin_provider_config_json");
    }
    console.log(`[update-builtin-provider-config] 下载 Release: ${releaseUrl}`);
    release = await fetchJsonWithLimit(releaseUrl);

    const localRevision = await readLocalRevision(targetPath);
    if (!options.force && typeof release.revision === "number" && localRevision !== null) {
      if (release.revision <= localRevision) {
        console.log(
          `[update-builtin-provider-config] [skip] 远端 revision ${release.revision} 不高于本地 ${localRevision}，保留本地快照`,
        );
        return;
      }
    }
  } else {
    release = JSON.parse(await readFile(targetPath, "utf8"));
  }

  const { config, removed } = sanitizeZCodeBuiltinProviderConfig(release);
  console.log(
    [
      `[update-builtin-provider-config] 清洗结果:`,
      `  删除模板: ${removed.templates.join(", ") || "无"}`,
      `  删除 Provider 规则: ${removed.providers.join(", ") || "无"}`,
      `  删除外跳 URL: ${removed.apiKeyManagementUrls.length}`,
      `  删除 providerSiteRules: ${removed.providerSiteRules}`,
      `  删除 templateModelRules: ${removed.templateModelRules}`,
      `  删除 builtinProviderModelRules: ${removed.builtinProviderModelRules}`,
    ].join("\n"),
  );

  await decodeReleaseInMemory(config);

  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  const original = await readFile(targetPath, "utf8").catch(() => null);
  // 先写临时文件再原子替换，避免半截 JSON 被并发的构建读取。
  const stagingPath = `${targetPath}.tmp-${process.pid}`;
  await writeFile(stagingPath, serialized, "utf8");
  await rename(stagingPath, targetPath);

  try {
    await validateWrittenFile(targetPath);
  } catch (error) {
    // 校验失败回滚原内容，保证仓库快照不被坏数据污染。
    if (original !== null) {
      await writeFile(targetPath, original, "utf8");
      console.warn(`  [warn] 校验失败，已回滚 ${targetPath}`);
    }
    throw error;
  }
  if (original !== serialized) {
    normalizeFormatting(targetPath);
    await validateWrittenFile(targetPath);
  }
  console.log(`[update-builtin-provider-config] 已写回并通过 decode 校验: ${targetPath}`);
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryHref === import.meta.url) {
  try {
    await main();
  } catch (error) {
    // 网络失败 / 离线属于预期场景：仓库快照兜底，警告后按成功退出，不阻断构建。
    const message = error instanceof Error ? error.message : String(error);
    if (
      /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|AbortSignal|timeout|timed out|HTTP \d+/iu.test(
        message,
      )
    ) {
      console.warn(
        `[update-builtin-provider-config] [warn] 网络不可用，保留仓库快照兜底: ${message}`,
      );
      process.exit(0);
    }
    console.error(`[update-builtin-provider-config] ${message}`);
    process.exit(1);
  }
}
