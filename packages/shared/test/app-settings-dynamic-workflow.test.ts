import { describe, expect, it } from "vitest";
import { appSettingsPatchSchema, appSettingsSchema } from "../src/validationAppSettings.js";

// fork main 原用 node:test 编写；合入上游 vitest 基建后转为 vitest 用例，契约不变。
describe("appSettings：dynamicWorkflowEnabled", () => {
  it("dynamicWorkflowEnabled 缺省关闭，无需迁移", () => {
    const parsed = appSettingsSchema.parse({});
    expect(parsed.dynamicWorkflowEnabled).toBe(false);
  });

  it("appSettingsPatchSchema：接受布尔 patch 并合并进完整设置", () => {
    const patch = appSettingsPatchSchema.parse({ dynamicWorkflowEnabled: true });
    expect(patch.dynamicWorkflowEnabled).toBe(true);

    const merged = appSettingsSchema.parse({
      ...appSettingsSchema.parse({}),
      ...patch,
    });
    expect(merged.dynamicWorkflowEnabled).toBe(true);
  });

  it("appSettingsPatchSchema：拒绝非布尔值", () => {
    expect(() => appSettingsPatchSchema.parse({ dynamicWorkflowEnabled: "yes" })).toThrow();
    expect(() => appSettingsPatchSchema.parse({ dynamicWorkflowEnabled: 1 })).toThrow();
  });
});
