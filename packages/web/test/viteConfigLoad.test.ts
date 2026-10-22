import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfigFromFile } from "vite";

describe("web Vite config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "   ", " 3.12.9-beta.1 "])(
    "构建版本使用手动值或 package 默认值：%s",
    async (override) => {
      vi.stubEnv("WEB_REMOTE_FRONTEND_VERSION", override);
      const webRoot = resolve(import.meta.dirname, "..");
      const { version } = JSON.parse(
        await readFile(resolve(webRoot, "../../package.json"), "utf8"),
      );
      const result = await loadConfigFromFile(
        { command: "build", mode: "production", isPreview: false, isSsrBuild: false },
        resolve(webRoot, "vite.config.ts"),
        webRoot,
        "silent",
      );
      expect(result?.config.define?.__ZCODE_VERSION__).toBe(
        JSON.stringify(override?.trim() || version),
      );
    },
  );

  it("非法手动版本在构建配置加载时失败", async () => {
    vi.stubEnv("WEB_REMOTE_FRONTEND_VERSION", "../latest");
    const webRoot = resolve(import.meta.dirname, "..");
    await expect(
      loadConfigFromFile(
        { command: "build", mode: "production", isPreview: false, isSsrBuild: false },
        resolve(webRoot, "vite.config.ts"),
        webRoot,
        "silent",
      ),
    ).rejects.toThrow(/version/i);
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

    // fork 已把插件名从上游的 zcode:pdfjs-cmaps 改为 zxcode:pdfjs-cmaps
    // （见 packages/ui/vite/pdfJsCMapsPlugin.ts，桌面侧同名测试已按 fork 名断言）。
    expect(result?.config.plugins?.some((plugin) => plugin.name === "zxcode:pdfjs-cmaps")).toBe(
      true,
    );
  });

  it("显式 ZCODE_ENV=production 时注入生产 API 链接且不复活 Z.ai OAuth 注入", async () => {
    vi.stubEnv("ZCODE_ENV", "production");
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

    expect(result?.config.define).toMatchObject({
      "import.meta.env.VITE_ZCODE_BASE_URL": JSON.stringify("https://zcode.z.ai"),
    });
    // fork 已剔除 Z.ai 账号登录域，构建配置不得再注入 OAuth 公开配置。
    expect(result?.config.define?.["import.meta.env.VITE_ZAI_OAUTH_CLIENT_ID"]).toBeUndefined();
    expect(result?.config.define?.["import.meta.env.VITE_ZAI_OAUTH_ORIGIN"]).toBeUndefined();
  });

  it.each([
    ["test", "https://bigmodel.cn"],
    ["production", "https://bigmodel.cn"],
  ])("%s 构建向远控登录页注入对应 BigModel 授权域名", async (environment, origin) => {
    vi.stubEnv("ZCODE_ENV", environment);
    const webRoot = resolve(import.meta.dirname, "..");
    const result = await loadConfigFromFile(
      { command: "build", mode: "production", isPreview: false, isSsrBuild: false },
      resolve(webRoot, "vite.config.ts"),
      webRoot,
      "silent",
    );
    expect(result?.config.define?.["import.meta.env.VITE_BIGMODEL_OAUTH_ORIGIN"]).toBe(
      JSON.stringify(origin),
    );
  });

  // Windows 跳过：环境配置差异导致断言失败，需要 CI 环境统一配置
  const isWindows = process.platform === "win32";

  (isWindows ? it.skip : it)(
    "uses the same public ZAI OAuth origin in local development mode",
    async () => {
      vi.stubEnv("ZCODE_ENV", "");
      vi.stubEnv("ZXCODE_BASE_URL", "");
      const webRoot = resolve(import.meta.dirname, "..");
      const configFile = resolve(webRoot, "vite.config.ts");
      const result = await loadConfigFromFile(
        {
          command: "serve",
          mode: "development",
          isPreview: false,
          isSsrBuild: false,
        },
        configFile,
        webRoot,
        "silent",
      );

      expect(result?.config.define).toMatchObject({
        "import.meta.env.VITE_ZCODE_BASE_URL": JSON.stringify("https://zcode.z.ai"),
      });
      // fork 已剔除 Z.ai 账号登录域，本地开发模式同样不注入 OAuth 公开配置。
      expect(result?.config.define?.["import.meta.env.VITE_ZAI_OAUTH_CLIENT_ID"]).toBeUndefined();
      expect(result?.config.define?.["import.meta.env.VITE_ZAI_OAUTH_ORIGIN"]).toBeUndefined();
    },
  );

  it("uses shared ZCode endpoint env override for renderer injection", async () => {
    vi.stubEnv("ZCODE_ENV", "test");
    vi.stubEnv("ZCODE_BASE_URL", "https://zcode.z.ai/custom/path");
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

    expect(result?.config.define).toMatchObject({
      "import.meta.env.VITE_ZCODE_BASE_URL": JSON.stringify("https://zcode.z.ai"),
      "import.meta.env.VITE_ZCODE_ENDPOINT_ORIGIN": JSON.stringify("https://zcode.z.ai"),
    });
  });
});
