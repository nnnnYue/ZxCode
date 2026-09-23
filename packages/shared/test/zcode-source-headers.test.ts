import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCustomModelRequestHeaders,
  parseCustomModelRequestHeadersEnv,
} from "../src/zcode-source-headers.js";

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
