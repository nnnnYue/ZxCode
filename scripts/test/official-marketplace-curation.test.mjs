// 回归测试：官方市场策展白名单过滤（scripts/fetch-official-marketplace.mjs）。
// 背景：fork 的官方市场是随包离线快照，收录必须显式策展（specs/official-marketplace-curation.md）。
// 这里固定三条语义：白名单是正向封闭集、白名单成员线上缺失必须报错（防悄悄下架）、
// 白名单与下架名单不得有交集；非法条目继续透传给下游逐条校验。
import assert from "node:assert/strict";
import test from "node:test";

import {
  CURATED_PLUGIN_NAMES,
  REMOVED_PLUGIN_NAMES,
  filterOfficialMarketplaceCuration,
} from "../fetch-official-marketplace.mjs";

test("真实策展白名单与下架名单交集为空", () => {
  const overlap = [...CURATED_PLUGIN_NAMES].filter((name) => REMOVED_PLUGIN_NAMES.has(name));
  assert.deepEqual(overlap, []);
});

test("白名单是正向封闭集：线上目录只保留白名单成员", () => {
  const plugins = [
    { name: "keep-a", version: "1.0.0" },
    { name: "wind", version: "2.0.0" }, // 下架名单成员，天然不在白名单内
    { name: "brand-new-online", version: "0.1.0" }, // 线上新增，默认不收
    { name: "keep-b", version: "1.2.0" },
  ];
  const kept = filterOfficialMarketplaceCuration(plugins, {
    curatedPluginNames: new Set(["keep-a", "keep-b"]),
    removedPluginNames: new Set(["wind"]),
  });
  assert.deepEqual(
    kept.map((plugin) => plugin.name),
    ["keep-a", "keep-b"],
  );
});

test("白名单成员从线上目录消失时报错并列出缺失名单", () => {
  assert.throws(
    () =>
      filterOfficialMarketplaceCuration([{ name: "keep-a" }], {
        curatedPluginNames: new Set(["keep-a", "vanished-plugin"]),
        removedPluginNames: new Set(),
      }),
    /vanished-plugin/,
  );
});

test("白名单与下架名单存在交集时报策展配置错误", () => {
  assert.throws(
    () =>
      filterOfficialMarketplaceCuration([{ name: "conflict" }], {
        curatedPluginNames: new Set(["conflict"]),
        removedPluginNames: new Set(["conflict"]),
      }),
    /交集/,
  );
});

test("name 非字符串的非法条目透传给下游校验，不静默吞掉", () => {
  const kept = filterOfficialMarketplaceCuration([{ version: "1.0.0" }, null, { name: "keep-a" }], {
    curatedPluginNames: new Set(["keep-a"]),
    removedPluginNames: new Set(),
  });
  assert.deepEqual(kept, [{ version: "1.0.0" }, null, { name: "keep-a" }]);
});
