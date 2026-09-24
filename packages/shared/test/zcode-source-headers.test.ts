import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCustomModelRequestHeaders,
  buildModelRequestDefaultHeaders,
  diffCustomModelRequestHeadersAgainstDefaults,
  listModelRequestDefaultHeaderEntries,
  mergeCustomModelRequestHeaderRows,
  parseCustomModelRequestHeadersEnv,
} from "../src/zcode-source-headers.js";
import { DEFAULT_ZXCODE_ENDPOINT_ORIGIN } from "../src/zcodeEndpoint.js";

test("parseCustomModelRequestHeadersEnv 透传空输入", () => {
  assert.deepEqual(parseCustomModelRequestHeadersEnv(undefined), []);
  assert.deepEqual(parseCustomModelRequestHeadersEnv(""), []);
  assert.deepEqual(parseCustomModelRequestHeadersEnv("   "), []);
});

test("parseCustomModelRequestHeadersEnv 容忍非法 JSON 与非数组形状", () => {
  assert.deepEqual(parseCustomModelRequestHeadersEnv("not json"), []);
  assert.deepEqual(parseCustomModelRequestHeadersEnv('{"name":"User-Agent"}'), []);
  assert.deepEqual(parseCustomModelRequestHeadersEnv('"str"'), []);
});

test("parseCustomModelRequestHeadersEnv 剔除非法条目、保留合法条目", () => {
  const raw = JSON.stringify([
    { name: "User-Agent", value: "MyApp/1.0" },
    { name: "Bad Name", value: "ok" }, // 名字含空格，非 token
    { name: "X-Ok", value: "值含中文" }, // 值含非 ASCII
    { name: "", value: "" }, // 空行
    { name: 42, value: "ok" }, // 形状错误
    { name: "X-Trim ", value: " v " }, // 前后空白被裁剪
  ]);
  assert.deepEqual(parseCustomModelRequestHeadersEnv(raw), [
    { name: "User-Agent", value: "MyApp/1.0" },
    { name: "X-Trim", value: "v" },
  ]);
});

test("parseCustomModelRequestHeadersEnv 重名不区分大小写只保留首条", () => {
  const raw = JSON.stringify([
    { name: "X-Title", value: "first" },
    { name: "x-title", value: "second" },
  ]);
  assert.deepEqual(parseCustomModelRequestHeadersEnv(raw), [{ name: "X-Title", value: "first" }]);
});

test("parseCustomModelRequestHeadersEnv 超上限截断到 32 条", () => {
  const raw = JSON.stringify(
    Array.from({ length: 40 }, (_unused, index) => ({
      name: `X-H${String(index).padStart(2, "0")}`,
      value: "v",
    })),
  );
  const parsed = parseCustomModelRequestHeadersEnv(raw);
  assert.equal(parsed.length, 32);
});

test("applyCustomModelRequestHeaders 空列表返回 source 副本", () => {
  const source = { "User-Agent": "ZxCode/1", "X-Title": "ZxCode@electron" };
  const merged = applyCustomModelRequestHeaders(source, []);
  assert.deepEqual(merged, source);
  // 不得改写传入对象，也不得与其共享引用。
  assert.notEqual(merged, source);
});

test("applyCustomModelRequestHeaders 同名不区分大小写覆盖，其余默认头保留", () => {
  const source = {
    "HTTP-Referer": "https://zcode.z.ai",
    "User-Agent": "ZxCode/1.0",
    "X-Title": "ZxCode@electron",
    "X-ZxCode-Agent": "glm",
  };
  const merged = applyCustomModelRequestHeaders(source, [
    { name: "user-agent", value: "MyApp/1.0" },
    { name: "X-Custom", value: "v" },
  ]);
  assert.deepEqual(merged, {
    "HTTP-Referer": "https://zcode.z.ai",
    // 覆盖条目保留用户传入的名字大小写；HTTP 语义不区分大小写，默认键不得残留。
    "user-agent": "MyApp/1.0",
    "X-Title": "ZxCode@electron",
    "X-ZxCode-Agent": "glm",
    "X-Custom": "v",
  });
  assert.equal("User-Agent" in merged, false);
});

test("buildModelRequestDefaultHeaders 输出四条默认头且顺序稳定", () => {
  const headers = buildModelRequestDefaultHeaders({
    appVersion: "3.14.0",
    endpointOrigin: "https://zcode.example.com",
    sourceTitle: "electron",
  });
  assert.deepEqual(Object.keys(headers), [
    "HTTP-Referer",
    "User-Agent",
    "X-Title",
    "X-ZxCode-Agent",
  ]);
  assert.equal(headers["HTTP-Referer"], "https://zcode.example.com");
  assert.equal(headers["User-Agent"], "ZxCode/3.14.0");
  assert.equal(headers["X-Title"], "ZxCode@electron");
  assert.equal(headers["X-ZxCode-Agent"], "glm");
});

test("buildModelRequestDefaultHeaders 缺省输入回退默认 origin/electron/unknown", () => {
  const headers = buildModelRequestDefaultHeaders();
  assert.equal(headers["HTTP-Referer"], DEFAULT_ZXCODE_ENDPOINT_ORIGIN);
  assert.equal(headers["User-Agent"], "ZxCode/unknown");
  assert.equal(headers["X-Title"], "ZxCode@electron");
});

test("listModelRequestDefaultHeaderEntries 与 builder 键序一致", () => {
  const entries = listModelRequestDefaultHeaderEntries(
    buildModelRequestDefaultHeaders({ appVersion: "9.9.9" }),
  );
  assert.deepEqual(entries, [
    { name: "HTTP-Referer", value: DEFAULT_ZXCODE_ENDPOINT_ORIGIN },
    { name: "User-Agent", value: "ZxCode/9.9.9" },
    { name: "X-Title", value: "ZxCode@electron" },
    { name: "X-ZxCode-Agent", value: "glm" },
  ]);
});

test("mergeCustomModelRequestHeaderRows 预填默认头、命中覆盖显示覆盖值", () => {
  const defaults = buildModelRequestDefaultHeaders({ appVersion: "3.14.0" });
  const rows = mergeCustomModelRequestHeaderRows(defaults, [
    { name: "user-agent", value: "MyApp/1.0" },
    { name: "X-Custom", value: "v1" },
  ]);
  assert.deepEqual(rows, [
    { name: "HTTP-Referer", value: DEFAULT_ZXCODE_ENDPOINT_ORIGIN },
    { name: "User-Agent", value: "MyApp/1.0" },
    { name: "X-Title", value: "ZxCode@electron" },
    { name: "X-ZxCode-Agent", value: "glm" },
    { name: "X-Custom", value: "v1" },
  ]);
});

test("mergeCustomModelRequestHeaderRows 无覆盖时原样展开默认值", () => {
  const defaults = buildModelRequestDefaultHeaders({ appVersion: "3.14.0" });
  assert.deepEqual(mergeCustomModelRequestHeaderRows(defaults, []), [
    { name: "HTTP-Referer", value: DEFAULT_ZXCODE_ENDPOINT_ORIGIN },
    { name: "User-Agent", value: "ZxCode/3.14.0" },
    { name: "X-Title", value: "ZxCode@electron" },
    { name: "X-ZxCode-Agent", value: "glm" },
  ]);
});

test("diffCustomModelRequestHeadersAgainstDefaults 只保留覆盖与新增", () => {
  const defaults = buildModelRequestDefaultHeaders({ appVersion: "3.14.0" });
  const entries = diffCustomModelRequestHeadersAgainstDefaults(defaults, [
    { name: "HTTP-Referer", value: DEFAULT_ZXCODE_ENDPOINT_ORIGIN }, // 与默认相同 → 不落盘
    { name: "User-Agent", value: "MyApp/1.0" }, // 覆盖 → 保留
    { name: "X-Title", value: "ZxCode@electron" }, // 与默认相同 → 不落盘
    { name: "X-Custom", value: "v1" }, // 新增 → 保留
    { name: "x-custom", value: "v2" }, // 同名靠后胜出
    { name: "", value: "" }, // 空行跳过
  ]);
  assert.deepEqual(entries, [
    { name: "User-Agent", value: "MyApp/1.0" },
    { name: "x-custom", value: "v2" },
  ]);
});

test("diffCustomModelRequestHeadersAgainstDefaults 全默认行返回空列表", () => {
  const defaults = buildModelRequestDefaultHeaders({ appVersion: "3.14.0" });
  assert.deepEqual(
    diffCustomModelRequestHeadersAgainstDefaults(
      defaults,
      listModelRequestDefaultHeaderEntries(defaults),
    ),
    [],
  );
});

test("merge + diff 组合可逆：无编辑时差量为空，保留原覆盖", () => {
  const defaults = buildModelRequestDefaultHeaders({ appVersion: "3.14.0" });
  const stored = [{ name: "User-Agent", value: "MyApp/1.0" }];
  const rows = mergeCustomModelRequestHeaderRows(defaults, stored);
  assert.deepEqual(diffCustomModelRequestHeadersAgainstDefaults(defaults, rows), stored);
});
