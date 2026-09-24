import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("桌面与 SEA 打包清单必须覆盖全部内置层插件定义", () => {
  // 历史教训：打包清单与官方定义是两份平行数据，内容包恢复后打包清单没有同步，
  // dev 可用但生产包 seed 不到内容。内置层定义的 rootCandidates[0] 均为
  // "packages/<dir>" 形态（离线快照条目则是 official-marketplace/plugins/...，不在此列），
  // 这里机械对照两份打包脚本，缺一个名字就失败。
  const repoRoot = resolve(cliWorkspaceRoot, "../..");
  const desktopScript = readFileSync(
    join(repoRoot, "packages/desktop/scripts/prepare-agent-node-bundle.mjs"),
    "utf8",
  );
  const seaScript = readFileSync(
    join(repoRoot, "apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs"),
    "utf8",
  );
  const builtinDefinitions = OFFICIAL_PLUGIN_DEFINITIONS.filter((definition) =>
    definition.rootCandidates[0]?.startsWith("packages/"),
  );
  assert.ok(builtinDefinitions.length >= 14, "内置层定义数量异常，请检查定义文件");
  for (const definition of builtinDefinitions) {
    const dir = definition.rootCandidates[0].slice("packages/".length);
    assert.ok(
      desktopScript.includes(`packages/${dir}`),
      `prepare-agent-node-bundle.mjs 缺少内置插件 ${definition.name}（应含 packages/${dir}）`,
    );
    assert.ok(
      seaScript.includes(`"${dir}"`),
      `sea-official-plugin-assets.mjs 缺少内置插件 ${definition.name}（应含 "${dir}"）`,
    );
  }
});
