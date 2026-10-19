import { normalize, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfigFromFile } from "vite";

// fork：上游的 __ZCODE_VERSION__/VITE_ZAI_OAUTH_*/VITE_ZCODE_BASE_URL 注入用例
// 随 web OAuth 与端点注入链路剔除；保留配置可加载与 PDF CMap 插件两类断言。
describe("web Vite config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads during bootstrap without executing the shared root entry", async () => {
    const webRoot = resolve(import.meta.dirname, "..");
    // normalize 确保路径分隔符一致，避免 Windows/Unix 不一致
    const configFile = normalize(resolve(webRoot, "vite.config.ts"));

    const result = await loadConfigFromFile(
      {
        command: "build",
        mode: "production",
        isPreview: false,
        isSsrBuild: false,
      },
      configFile,
      webRoot,
      "silent",
    );
    // 比较时统一路径格式
    expect(normalize(result!.path)).toBe(configFile);
  });

  it("publishes PDF.js CMaps for non-latin PDF rendering", async () => {
    const webRoot = resolve(import.meta.dirname, "..");
    const configFile = resolve(webRoot, "vite.config.ts");
    const result = await loadConfigFromFile(
      {
        command: "build",
        mode: "production",
        isPreview: false,
        isSsrBuild: false,
      },
      configFile,
      webRoot,
      "silent",
    );

    expect(result?.config.plugins?.some((plugin) => plugin.name === "zxcode:pdfjs-cmaps")).toBe(
      true,
    );
  });
});
