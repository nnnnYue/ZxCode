import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS as SETTINGS_DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS } from "@zcode/shared";
import {
  DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS,
  OFFICIAL_PLUGIN_DEFINITIONS,
} from "../src/app/official-plugin-definitions.js";

// 内置插件 rootCandidates 的仓库内首选形态是 "packages/<name>"，相对 apps/zcode-cli 根解析。
const cliWorkspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("Settings 默认启用集合与官方插件定义的 defaultEnabled 逐一对应", () => {
  assert.deepEqual(
    [...DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS].sort(),
    [...SETTINGS_DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS].sort(),
  );
});

test("defaultEnabled 插件的随包内容必须真实存在，不允许指向空内容的死定义", () => {
  // 历史教训：documents/pdf/presentations/spreadsheets 的定义与 defaultEnabled 一直在，
  // 但内容包曾整体缺失，商店因此出现无法安装的死条目。这里钉住「声明必须有内容」。
  for (const definition of OFFICIAL_PLUGIN_DEFINITIONS) {
    if (!definition.defaultEnabled) continue;
    const contentRoot = resolve(cliWorkspaceRoot, definition.rootCandidates[0]);
    assert.ok(
      existsSync(join(contentRoot, ".zcode-plugin", "plugin.json")),
      `${definition.name}@${definition.version} 的内容包缺失（rootCandidates[0]=${definition.rootCandidates[0]}）`,
    );
  }
});
