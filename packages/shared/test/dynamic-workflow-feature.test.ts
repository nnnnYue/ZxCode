import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DYNAMIC_WORKFLOW_MODE,
  isDynamicWorkflowModeEnabled,
  normalizeDynamicWorkflowMode,
  resolveDynamicWorkflowClientConfig,
  ZXCODE_DYNAMIC_WORKFLOW_MODE_ENV,
} from "../src/dynamic-workflow-feature.js";

test("normalizeDynamicWorkflowMode 只接受三态合法值", () => {
  assert.equal(normalizeDynamicWorkflowMode("disabled"), "disabled");
  assert.equal(normalizeDynamicWorkflowMode(" onDemand "), "onDemand");
  assert.equal(normalizeDynamicWorkflowMode("alwaysOn"), "alwaysOn");
  assert.equal(normalizeDynamicWorkflowMode("true"), undefined);
  assert.equal(normalizeDynamicWorkflowMode(""), undefined);
  assert.equal(normalizeDynamicWorkflowMode(undefined), undefined);
  assert.equal(normalizeDynamicWorkflowMode(42), undefined);
});

test("isDynamicWorkflowModeEnabled 折叠为布尔开关", () => {
  assert.equal(isDynamicWorkflowModeEnabled("disabled"), false);
  assert.equal(isDynamicWorkflowModeEnabled("onDemand"), true);
  assert.equal(isDynamicWorkflowModeEnabled("alwaysOn"), true);
});

test("resolveDynamicWorkflowClientConfig：本地覆盖优先于远端", () => {
  const snapshot = resolveDynamicWorkflowClientConfig({
    remote: { mode: "disabled" },
    env: { [ZXCODE_DYNAMIC_WORKFLOW_MODE_ENV]: "alwaysOn" },
  });
  assert.deepEqual(snapshot, { mode: "alwaysOn", enabled: true, source: "override" });
});

test("resolveDynamicWorkflowClientConfig：无覆盖时取远端合法值", () => {
  const snapshot = resolveDynamicWorkflowClientConfig({
    remote: { mode: "onDemand" },
  });
  assert.deepEqual(snapshot, { mode: "onDemand", enabled: true, source: "remote" });
});

test("resolveDynamicWorkflowClientConfig：远端缺 key、非法或失败（null）都按 disabled", () => {
  for (const remote of [undefined, null, {}, { mode: "bogus" }, "alwaysOn"]) {
    const snapshot = resolveDynamicWorkflowClientConfig({ remote });
    assert.deepEqual(snapshot, {
      mode: DEFAULT_DYNAMIC_WORKFLOW_MODE,
      enabled: false,
      source: "default",
    });
  }
});

test("resolveDynamicWorkflowClientConfig：非法本地覆盖被丢弃，回落远端", () => {
  const snapshot = resolveDynamicWorkflowClientConfig({
    remote: { mode: "onDemand" },
    env: { [ZXCODE_DYNAMIC_WORKFLOW_MODE_ENV]: "yes" },
  });
  assert.deepEqual(snapshot, { mode: "onDemand", enabled: true, source: "remote" });
});

test("resolveDynamicWorkflowClientConfig：缺省档位为 disabled（fail-closed）", () => {
  assert.equal(DEFAULT_DYNAMIC_WORKFLOW_MODE, "disabled");
});
