import assert from "node:assert/strict";
import test from "node:test";
import { ZXCODE_MODEL_CUSTOM_HEADERS_ENV } from "@zcode/shared";
import { buildAgentCustomModelHeadersEnv } from "../src/runtime-tools/agentProxyEnv.js";

test("开关关闭或缺省时不注入 env", () => {
  assert.deepEqual(buildAgentCustomModelHeadersEnv({ enabled: false, headers: [] }), {});
  assert.deepEqual(buildAgentCustomModelHeadersEnv({ enabled: undefined, headers: undefined }), {});
  assert.deepEqual(
    buildAgentCustomModelHeadersEnv({
      enabled: false,
      headers: [{ name: "User-Agent", value: "MyApp/1.0" }],
    }),
    {},
  );
});

test("开关开启但列表为空时不注入 env", () => {
  assert.deepEqual(buildAgentCustomModelHeadersEnv({ enabled: true, headers: [] }), {});
  assert.deepEqual(buildAgentCustomModelHeadersEnv({ enabled: true, headers: undefined }), {});
});

test("开关开启且列表非空时注入 JSON env", () => {
  const env = buildAgentCustomModelHeadersEnv({
    enabled: true,
    headers: [
      { name: "User-Agent", value: "MyApp/1.0" },
      { name: "X-Trace-Id", value: "abc-123" },
    ],
  });
  assert.deepEqual(Object.keys(env), [ZXCODE_MODEL_CUSTOM_HEADERS_ENV]);
  assert.deepEqual(JSON.parse(env[ZXCODE_MODEL_CUSTOM_HEADERS_ENV]), [
    { name: "User-Agent", value: "MyApp/1.0" },
    { name: "X-Trace-Id", value: "abc-123" },
  ]);
});
