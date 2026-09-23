import assert from "node:assert/strict";
import test from "node:test";
import { ZXCODE_MODEL_CUSTOM_HEADERS_ENV } from "@zcode/shared";
import { createRuntimeAiSdkModelExecutionConfig } from "../src/model-config.js";

const DEFAULT_USER_AGENT = "ZxCode/unknown";

// 测试进程 argv 不含 app-server/agent-server，detectDefaultProviderSourceTitle 判为 "cli"；
// 桌面链路由 zcode-protocol-entrypoint 显式传 sourceTitle: "electron"，不经过这里的默认探测。
function buildDefaultHeaders(env: Record<string, string | undefined>): Record<string, string> {
  return createRuntimeAiSdkModelExecutionConfig(env).defaultHeaders ?? {};
}

test("未配置自定义头时保持默认来源头", () => {
  const headers = buildDefaultHeaders({ ZXCODE_APP_VERSION: "3.14.0" });
  assert.equal(headers["User-Agent"], "ZxCode/3.14.0");
  assert.equal(headers["X-Title"], "ZxCode@cli");
  assert.equal(headers["X-ZxCode-Agent"], "glm");
  assert.ok(headers["HTTP-Referer"]);
});

test("开关 env 载入合法自定义头时同名覆盖默认来源头", () => {
  const headers = buildDefaultHeaders({
    ZXCODE_APP_VERSION: "3.14.0",
    [ZXCODE_MODEL_CUSTOM_HEADERS_ENV]: JSON.stringify([
      { name: "User-Agent", value: "MyApp/1.0" },
      { name: "X-Custom", value: "v" },
    ]),
  });
  assert.equal(headers["User-Agent"], "MyApp/1.0");
  assert.equal(headers["X-Custom"], "v");
  // 其余默认来源头保留。
  assert.equal(headers["X-Title"], "ZxCode@cli");
  assert.equal(headers["X-ZxCode-Agent"], "glm");
});

test("非法自定义条目被剔除，不影响默认头", () => {
  const headers = buildDefaultHeaders({
    [ZXCODE_MODEL_CUSTOM_HEADERS_ENV]: JSON.stringify([
      { name: "Bad Name", value: "v" },
      { name: "X-Ok", value: "中文" },
    ]),
  });
  assert.equal(headers["User-Agent"], DEFAULT_USER_AGENT);
  assert.equal("X-Ok" in headers, false);
  assert.equal("Bad Name" in headers, false);
});

test("损坏的 env JSON 不影响默认头", () => {
  const headers = buildDefaultHeaders({ [ZXCODE_MODEL_CUSTOM_HEADERS_ENV]: "{{not json" });
  assert.equal(headers["User-Agent"], DEFAULT_USER_AGENT);
  assert.equal(headers["X-Title"], "ZxCode@cli");
});
