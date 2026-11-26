import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodePluginAdapter } from "../src/plugins/index.js";

// 回归依据（REMOVALS §十三 2026-11-26 拍板）：上游 v4.0.0 的插件 MCP isolation 透传
// 在合并中被连带丢弃，文档四插件 plugin.json 的 "isolation":"workspace" 成死配置、
// pool.ts 消费端按 session 隔离重建。本测试守护生产端映射：官方插件声明透传，
// 非官方插件声明忽略（保持 session isolation）。
const PLUGIN_NAME = "isolation-plugin";

async function writeIsolationPlugin(root: string, isolation: unknown, official: boolean) {
  const pluginRoot = join(root, PLUGIN_NAME);
  const server = official
    ? {
        type: "http",
        url: "https://mcp.example.test/mcp",
        auth: { type: "zcode_official", provider: "jwt_token" },
        enabled: true,
        isolation,
      }
    : { type: "http", url: "https://mcp.example.test/mcp", isolation };
  await mkdir(join(pluginRoot, ".zcode-plugin"), { recursive: true });
  await writeFile(
    join(pluginRoot, ".zcode-plugin", "plugin.json"),
    JSON.stringify({ name: PLUGIN_NAME, mcpServers: { viewer: server } }),
  );
  return pluginRoot;
}

describe("plugin MCP isolation passthrough", () => {
  it.each([
    { label: "workspace", isolation: "workspace", expected: "workspace" },
    { label: "session", isolation: "session", expected: "session" },
    { label: "invalid value ignored", isolation: "global", expected: undefined },
    { label: "omitted", isolation: undefined, expected: undefined },
  ])("official plugin preserves declared isolation ($label)", async ({ isolation, expected }) => {
    const root = await mkdtemp(join(tmpdir(), "zcode-plugin-isolation-"));
    try {
      const pluginRoot = await writeIsolationPlugin(root, isolation, true);
      const storageRoot = join(root, "storage");
      const outcome = await createNodePluginAdapter({ storageRoot }).discoverPlugins({
        config: {
          dirs: [],
          enabled: true,
          enabledPlugins: { [`${PLUGIN_NAME}@zcode-plugins-official`]: true },
          options: {},
          suppressedBuiltins: [],
        },
        env: {},
        storageRoot,
        workingDirectory: root,
        officialPluginRoots: [pluginRoot],
      });
      expect(outcome.diagnostics).toEqual([]);
      const config = outcome.mcpServers[`plugin:${PLUGIN_NAME}:viewer`];
      expect(config?.isolation).toBe(expected);
      expect(config).toMatchObject({ source: { kind: "builtin" } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("non-official plugin declarations are ignored (session isolation)", async () => {
    const root = await mkdtemp(join(tmpdir(), "zcode-plugin-isolation-"));
    try {
      const pluginRoot = await writeIsolationPlugin(root, "workspace", false);
      const storageRoot = join(root, "storage");
      const outcome = await createNodePluginAdapter({ storageRoot }).discoverPlugins({
        config: { dirs: [pluginRoot], enabled: true, enabledPlugins: {}, options: {} },
        env: {},
        storageRoot,
        workingDirectory: root,
      });
      expect(outcome.diagnostics).toEqual([]);
      expect(outcome.mcpServers[`plugin:${PLUGIN_NAME}:viewer`]?.isolation).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
