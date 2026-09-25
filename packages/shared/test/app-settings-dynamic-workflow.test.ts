import assert from "node:assert/strict";
import test from "node:test";
import { appSettingsPatchSchema, appSettingsSchema } from "../src/validationAppSettings.js";

test("appSettings：dynamicWorkflowEnabled 缺省关闭，无需迁移", () => {
  const parsed = appSettingsSchema.parse({});
  assert.equal(parsed.dynamicWorkflowEnabled, false);
});

test("appSettingsPatchSchema：接受布尔 patch 并合并进完整设置", () => {
  const patch = appSettingsPatchSchema.parse({ dynamicWorkflowEnabled: true });
  assert.equal(patch.dynamicWorkflowEnabled, true);

  const merged = appSettingsSchema.parse({
    ...appSettingsSchema.parse({}),
    ...patch,
  });
  assert.equal(merged.dynamicWorkflowEnabled, true);
});

test("appSettingsPatchSchema：拒绝非布尔值", () => {
  assert.throws(() => appSettingsPatchSchema.parse({ dynamicWorkflowEnabled: "yes" }));
  assert.throws(() => appSettingsPatchSchema.parse({ dynamicWorkflowEnabled: 1 }));
});
