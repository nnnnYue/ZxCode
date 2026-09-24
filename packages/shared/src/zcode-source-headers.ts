import { DEFAULT_ZXCODE_ENDPOINT_ORIGIN } from "./zcodeEndpoint.js";

// 仅保留 OpenRouter 官方归因字段（HTTP-Referer / X-Title）与标准 User-Agent。
// 环境/统计指纹头（X-Platform/X-Os-*/X-Release-Channel/X-Client-*/X-ZxCode-App-Version/X-Device-Mid）
// 已随去平台化清理删除。
export const ZXCODE_SOURCE_HEADERS = {
  "User-Agent": "ZxCode/unknown",
  "HTTP-Referer": DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
  "X-Title": "ZxCode@electron",
} as const;

export interface BuildZCodeSourceHeadersFromContextOptions {
  appVersion?: string;
  endpointOrigin?: string;
  sourceTitle?: string;
}

export function normalizeZCodeSourceHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^[\x20-\x7e]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function buildZCodeSourceHeadersFromContext(
  options: BuildZCodeSourceHeadersFromContextOptions = {},
): Record<string, string> {
  const appVersion = normalizeZCodeSourceHeaderValue(options.appVersion);
  const endpointOrigin =
    normalizeZCodeSourceHeaderValue(options.endpointOrigin) ?? DEFAULT_ZXCODE_ENDPOINT_ORIGIN;
  const sourceTitle = normalizeZCodeSourceHeaderValue(options.sourceTitle) ?? "electron";

  return {
    ...ZXCODE_SOURCE_HEADERS,
    "HTTP-Referer": endpointOrigin,
    "User-Agent": `ZxCode/${appVersion ?? "unknown"}`,
    "X-Title": `ZxCode@${sourceTitle}`,
  };
}

// ── 用户自定义模型请求头（specs/custom-request-headers.md） ──

export interface CustomModelRequestHeaderEntry {
  name: string;
  value: string;
}

// 模型请求默认头中的 agent 代号头；取值与 CLI bootstrap 保持同一常量，
// 避免设置页展示的默认值与 agent 实际发送分叉。
export const MODEL_REQUEST_AGENT_HEADER_NAME = "X-ZxCode-Agent";
export const MODEL_REQUEST_AGENT_HEADER_VALUE = "glm";

export interface ModelRequestDefaultHeaderOptions {
  appVersion?: string;
  endpointOrigin?: string;
  sourceTitle?: string;
}

/**
 * 模型 API 请求的默认来源头（specs/custom-request-headers.md）。
 * agent 侧 `buildCliZCodeSourceHeaders` 构造实际发送头与设置页 `getModelRequestHeaderDefaults`
 * 展示预填值共用本实现；键插入顺序即展示顺序。来源归因头（`buildZCodeSourceHeadersFromContext`）
 * 是后端链路的另一份语义，不包含 agent 代号头，两者不合并。
 */
export function buildModelRequestDefaultHeaders(
  options: ModelRequestDefaultHeaderOptions = {},
): Record<string, string> {
  const appVersion = normalizeZCodeSourceHeaderValue(options.appVersion);
  const endpointOrigin =
    normalizeZCodeSourceHeaderValue(options.endpointOrigin) ?? DEFAULT_ZXCODE_ENDPOINT_ORIGIN;
  const sourceTitle = normalizeZCodeSourceHeaderValue(options.sourceTitle) ?? "electron";

  return {
    "HTTP-Referer": endpointOrigin,
    "User-Agent": `ZxCode/${appVersion ?? "unknown"}`,
    "X-Title": `ZxCode@${sourceTitle}`,
    [MODEL_REQUEST_AGENT_HEADER_NAME]: MODEL_REQUEST_AGENT_HEADER_VALUE,
  };
}

/** 默认头的有序条目形态，供设置页按稳定顺序预填编辑行。 */
export function listModelRequestDefaultHeaderEntries(
  headers: Readonly<Record<string, string>> = buildModelRequestDefaultHeaders(),
): CustomModelRequestHeaderEntry[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

// RFC 7230 header 名 token 约束；冒号、空白等分隔符不允许出现在名字里。
const MODEL_REQUEST_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// 值与来源头同约束：仅可打印 ASCII，避免多字节字符在 SDK/网关侧被不可控地转码。
const MODEL_REQUEST_HEADER_VALUE_PATTERN = /^[\x20-\x7e]+$/;
export const CUSTOM_MODEL_REQUEST_HEADERS_MAX_ENTRIES = 32;

export function isValidModelRequestHeaderName(name: string): boolean {
  return MODEL_REQUEST_HEADER_NAME_PATTERN.test(name);
}

export function isValidModelRequestHeaderValue(value: string): boolean {
  return MODEL_REQUEST_HEADER_VALUE_PATTERN.test(value);
}

/**
 * 解析 `ZXCODE_MODEL_CUSTOM_HEADERS` env（JSON `Array<{name, value}>`）。
 * 环境变量属于用户可手写入口，任何非法条目（形状错误、名字/值不合法、超上限、重复名）
 * 都只剔除该条目，不让整次解析失败影响模型请求。
 */
export function parseCustomModelRequestHeadersEnv(
  raw: string | undefined,
): CustomModelRequestHeaderEntry[] {
  if (!raw?.trim()) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const entries: CustomModelRequestHeaderEntry[] = [];
  const seenNames = new Set<string>();
  for (const item of parsed) {
    if (entries.length >= CUSTOM_MODEL_REQUEST_HEADERS_MAX_ENTRIES) break;
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const value = typeof record.value === "string" ? record.value.trim() : "";
    if (!isValidModelRequestHeaderName(name) || !isValidModelRequestHeaderValue(value)) continue;
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    entries.push({ name, value });
  }
  return entries;
}

/**
 * 把用户自定义头按名覆盖到默认来源头之上（不区分大小写；列表顺序靠后的同名条目胜出）。
 * 只返回新对象，不改写传入的 source。
 */
export function applyCustomModelRequestHeaders(
  source: Readonly<Record<string, string>>,
  custom: readonly CustomModelRequestHeaderEntry[],
): Record<string, string> {
  if (custom.length === 0) {
    return { ...source };
  }
  const headers: Record<string, string> = { ...source };
  for (const entry of custom) {
    for (const existing of Object.keys(headers)) {
      if (existing.toLowerCase() === entry.name.toLowerCase()) {
        delete headers[existing];
      }
    }
    headers[entry.name] = entry.value;
  }
  return headers;
}

/**
 * 设置页预填行（specs/custom-request-headers.md「默认展示」）：
 * 默认头逐条展开，命中的已存覆盖显示覆盖值（默认头顺序不变），未命中任何默认头的已存条目按原顺序追加。
 * 返回的是 UI 草稿，不落盘；持久层仍只保存差量覆盖条目。
 * 同名条目（不区分大小写）靠后者胜出，与 `applyCustomModelRequestHeaders` 一致。
 */
export function mergeCustomModelRequestHeaderRows(
  defaults: Readonly<Record<string, string>>,
  stored: readonly CustomModelRequestHeaderEntry[],
): CustomModelRequestHeaderEntry[] {
  const overrides = new Map<string, CustomModelRequestHeaderEntry>();
  for (const entry of stored) {
    const name = entry.name.trim();
    const value = entry.value.trim();
    if (!name || !value) continue;
    overrides.set(name.toLowerCase(), { name, value });
  }
  const isDefaultName = new Map<string, boolean>();
  for (const name of Object.keys(defaults)) {
    isDefaultName.set(name.toLowerCase(), true);
  }
  const rows: CustomModelRequestHeaderEntry[] = Object.entries(defaults).map(([name, value]) => ({
    name,
    value: overrides.get(name.toLowerCase())?.value ?? value,
  }));
  for (const [key, entry] of overrides) {
    if (!isDefaultName.has(key)) {
      rows.push(entry);
    }
  }
  return rows;
}

/**
 * 设置页差量捕获（specs/custom-request-headers.md「差量捕获」）：
 * 与默认值完全相同的行不落盘，避免把版本号 / origin 钉死在用户配置里（升级后仍跟随新默认值）；
 * 只保留真正的同名覆盖与新增条目。行允许临时带空白，这里先裁剪；空行跳过；
 * 同名（不区分大小写）靠后的行胜出。
 */
export function diffCustomModelRequestHeadersAgainstDefaults(
  defaults: Readonly<Record<string, string>>,
  rows: readonly CustomModelRequestHeaderEntry[],
): CustomModelRequestHeaderEntry[] {
  const merged = new Map<string, CustomModelRequestHeaderEntry>();
  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name || !value) continue;
    merged.set(name.toLowerCase(), { name, value });
  }
  const defaultValues = new Map<string, string>();
  for (const [name, value] of Object.entries(defaults)) {
    defaultValues.set(name.toLowerCase(), value);
  }
  const entries: CustomModelRequestHeaderEntry[] = [];
  for (const [key, entry] of merged) {
    if (defaultValues.get(key) !== entry.value) {
      entries.push(entry);
    }
  }
  return entries;
}
