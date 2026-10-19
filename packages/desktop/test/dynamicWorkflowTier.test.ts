// fork 保留的 dynamic workflow 档位逻辑。
// 修复原因：原文件使用 node:test 风格，vitest 收集时报 "No test suite found"；
// 改写为 vitest 断言，用例语义不变。
import { expect, it } from "vitest";
import { resolveDynamicWorkflowModeHostEnv } from "../src/main/desktopDynamicWorkflowTier.js";

const ENV_KEY = "ZXCODE_DYNAMIC_WORKFLOW_MODE";

it("dev：shell 合法覆盖优先，透传不改动", () => {
  for (const mode of ["alwaysOn", "onDemand", "disabled"]) {
    expect(
      resolveDynamicWorkflowModeHostEnv({
        inheritedValue: mode,
        isPackaged: false,
        isPreview: false,
        userEnabled: false,
      }),
    ).toEqual({ [ENV_KEY]: mode });
  }
});

it("dev：非法覆盖被丢弃，回落用户设置", () => {
  expect(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "bogus",
      isPackaged: false,
      isPreview: false,
      userEnabled: true,
    }),
  ).toEqual({ [ENV_KEY]: "alwaysOn" });
  expect(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "bogus",
      isPackaged: false,
      isPreview: false,
      userEnabled: false,
    }),
  ).toEqual({});
});

it("dev：无覆盖时按用户设置", () => {
  expect(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: undefined,
      isPackaged: false,
      isPreview: false,
      userEnabled: true,
    }),
  ).toEqual({ [ENV_KEY]: "alwaysOn" });
  expect(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: undefined,
      isPackaged: false,
      isPreview: false,
      userEnabled: false,
    }),
  ).toEqual({});
});

it("preview：固定 alwaysOn，忽略 shell 与用户设置", () => {
  expect(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "disabled",
      isPackaged: true,
      isPreview: true,
      userEnabled: false,
    }),
  ).toEqual({ [ENV_KEY]: "alwaysOn" });
});

it("production：读用户设置；关闭时不写入（继承值由调用方删除）", () => {
  expect(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "alwaysOn",
      isPackaged: true,
      isPreview: false,
      userEnabled: true,
    }),
  ).toEqual({ [ENV_KEY]: "alwaysOn" });
  expect(
    resolveDynamicWorkflowModeHostEnv({
      inheritedValue: "alwaysOn",
      isPackaged: true,
      isPreview: false,
      userEnabled: false,
    }),
  ).toEqual({});
});
