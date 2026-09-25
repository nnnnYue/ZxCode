import assert from "node:assert/strict";
import test from "node:test";
import { resolveDynamicWorkflowModeHostEnv } from "../src/main/desktopDynamicWorkflowTier.js";

const ENV_KEY = "ZXCODE_DYNAMIC_WORKFLOW_MODE";

test("dev：shell 合法覆盖优先，透传不改动", () => {
  for (const mode of ["alwaysOn", "onDemand", "disabled"]) {
    assert.deepEqual(
      resolveDynamicWorkflowModeHostEnv({
        inheritedValue: mode,
        isPackaged: false,
        isPreview: false,
        userEnabled: false,
      }),
      { [ENV_KEY]: mode },
    );
  }
});

test("dev：非法覆盖被丢弃，回落用户设置", () => {
  assert.deepEqual(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "bogus",
      isPackaged: false,
      isPreview: false,
      userEnabled: true,
    }),
    { [ENV_KEY]: "alwaysOn" },
  );
  assert.deepEqual(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "bogus",
      isPackaged: false,
      isPreview: false,
      userEnabled: false,
    }),
    {},
  );
});

test("dev：无覆盖时按用户设置", () => {
  assert.deepEqual(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: undefined,
      isPackaged: false,
      isPreview: false,
      userEnabled: true,
    }),
    { [ENV_KEY]: "alwaysOn" },
  );
  assert.deepEqual(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: undefined,
      isPackaged: false,
      isPreview: false,
      userEnabled: false,
    }),
    {},
  );
});

test("preview：固定 alwaysOn，忽略 shell 与用户设置", () => {
  assert.deepEqual(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "disabled",
      isPackaged: true,
      isPreview: true,
      userEnabled: false,
    }),
    { [ENV_KEY]: "alwaysOn" },
  );
});

test("production：读用户设置；关闭时不写入（继承值由调用方删除）", () => {
  assert.deepEqual(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "alwaysOn",
      isPackaged: true,
      isPreview: false,
      userEnabled: true,
    }),
    { [ENV_KEY]: "alwaysOn" },
  );
  assert.deepEqual(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "alwaysOn",
      isPackaged: true,
      isPreview: false,
      userEnabled: false,
    }),
    {},
  );
});
