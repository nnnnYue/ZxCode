import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_ZCODE_ENDPOINT_ORIGIN } from "@zcode/shared";
import { DEV_HELPER_APP_NAME, HELPER_APP_NAME } from "@zcode/zcode-cua/broker/helperConstants";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appMock = {
  isPackaged: false,
  getPath: vi.fn((name: string) => `/mock/${name}`),
};

// 编译期常量 ZXCODE_PRODUCT_FLAVOR 决定 isPreviewPackagedRuntime；Dynamic Workflow 灰度的
// 「打包 production」档位必须能与 preview 区分，因此这里改成可切换的持有者，默认仍是 preview。
const productFlavorMock = { value: "preview" as string };

vi.mock("electron", () => ({
  app: appMock,
}));

// fork 适配：@zcode/shared 的常量与函数均为 ZXCODE_* 命名；ARMS/OTLP 遥测已剔除。
vi.mock("@zcode/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zcode/shared")>();
  return {
    ...actual,
    ZXCODE_APP_VERSION_ENV: "ZXCODE_APP_VERSION",
    ZXCODE_RUNTIME_ENV_KEY: "ZXCODE_RUNTIME_ENV",
    ZXCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY: "ZXCODE_TOOL_ENV_PASSTHROUGH_JSON",
    ZXCODE_AGENT_RUNTIME: {
      binaryKind: "native-binary",
      binaryEnvVar: "GLM_BINARY_PATH",
      bundledResourceDir: "glm",
      version: "0.0.0-test",
      spawnArgs: ["app-server", "--stdio"],
      nativeConfigDir: ".zxcode/cli",
      nativeConfigFileName: "config.json",
      missingBinaryMessage: "[ZxCode Agent] missing test binary",
      resolveEntrySegments: (platform: string) => [
        platform === "win32" ? "zxcode-agent.exe" : "zxcode-agent",
      ],
    },
    ZXCODE_ENV: "test",
    get ZXCODE_PRODUCT_FLAVOR() {
      return productFlavorMock.value;
    },
    ZXCODE_DYNAMIC_WORKFLOW_MODE_ENV: "ZXCODE_DYNAMIC_WORKFLOW_MODE",
    normalizeDynamicWorkflowMode: (value: unknown) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      return ["disabled", "onDemand", "alwaysOn"].includes(trimmed) ? trimmed : undefined;
    },
    ZXCODE_VERSION: "0.0.0-test",
    readProductEndpointEnv: () => ({}),
    // 端点常量不再复制字面量，直接沿用真实模块导出（本 mock 只覆盖其余测试替身）。
    resolveRuntimeZCodeEndpointOrigin: (env: Record<string, string | undefined>) =>
      env.ZXCODE_BASE_URL ?? env.ZXCODE_TEST_BASE_URL ?? actual.DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
    sanitizeZCodeRuntimeEnv: (env: Record<string, string | undefined>) => {
      const sanitizedKeys = new Set([
        "NODE_ENV",
        "ELECTRON_RUN_AS_NODE",
        "NODE_NO_WARNINGS",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "NODE_EXTRA_CA_CERTS",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "REQUESTS_CA_BUNDLE",
        "CURL_CA_BUNDLE",
        "GIT_SSL_CAINFO",
      ]);
      const sanitized: Record<string, string> = {};
      for (const [key, value] of Object.entries(env)) {
        if (
          value == null ||
          sanitizedKeys.has(key.toUpperCase()) ||
          /^(npm_config|yarn|pnpm)_(http_proxy|https_proxy|proxy|all_proxy|no_proxy|cafile|ca)$/i.test(
            key,
          )
        ) {
          continue;
        }
        sanitized[key] = value;
      }
      return sanitized;
    },
    buildZCodeToolEnvPassthroughEnv: (env: Record<string, string | undefined>) => {
      const captured: Record<string, string> = {};
      for (const [key, value] of Object.entries(env)) {
        const upperKey = key.toUpperCase();
        if (
          value != null &&
          !["NODE_ENV", "ELECTRON_RUN_AS_NODE", "NODE_NO_WARNINGS"].includes(upperKey) &&
          ([
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "NO_PROXY",
            "NODE_EXTRA_CA_CERTS",
            "SSL_CERT_FILE",
            "SSL_CERT_DIR",
            "REQUESTS_CA_BUNDLE",
            "CURL_CA_BUNDLE",
            "GIT_SSL_CAINFO",
          ].includes(upperKey) ||
            /^(npm_config|yarn|pnpm)_(http_proxy|https_proxy|proxy|all_proxy|no_proxy|cafile|ca)$/i.test(
              key,
            ))
        ) {
          captured[key] = value;
        }
      }
      return Object.keys(captured).length > 0
        ? { ZXCODE_TOOL_ENV_PASSTHROUGH_JSON: JSON.stringify(captured) }
        : {};
    },
  };
});

vi.mock("@zcode/services/node", () => ({
  getAppConfigDir: vi.fn(() => "/mock/config"),
  getDataBaseDir: vi.fn(() => "/mock/db"),
  listSSHConfigAliasesFromLocalConfig: vi.fn(() => []),
  ZXCODE_CUA_BUNDLED_HELPER_APP_PATH_ENV: "ZXCODE_CUA_BUNDLED_HELPER_APP_PATH",
  ZXCODE_WINDOWS_APP_INSTALL_DIR_ENV: "ZXCODE_WINDOWS_APP_INSTALL_DIR",
}));

const originalUseCdnSwitch = process.env["ZXCODE_DEV_REMOTE_ASSET_USE_CDN"];
const originalCdnBaseUrl = process.env["ZXCODE_REMOTE_ASSET_CDN_BASE_URL"];
const originalRemoteAssetCacheDir = process.env["ZXCODE_REMOTE_ASSET_CACHE_DIR"];
const originalNodeNoWarnings = process.env["NODE_NO_WARNINGS"];
const originalNodeEnv = process.env["NODE_ENV"];
const originalZxCodeRuntimeEnv = process.env["ZXCODE_RUNTIME_ENV"];
const originalGlmBinaryPath = process.env["GLM_BINARY_PATH"];
const originalZxCodeBaseUrl = process.env["ZXCODE_BASE_URL"];
const originalZxCodeEndpointOrigin = process.env["ZXCODE_ENDPOINT_ORIGIN"];
const originalDynamicWorkflowMode = process.env["ZXCODE_DYNAMIC_WORKFLOW_MODE"];
const originalDesktopApplicationName = process.env["ZXCODE_DESKTOP_APPLICATION_NAME"];
const originalDesktopHomeDir = process.env["ZXCODE_DESKTOP_HOME_DIR"];
const originalDesktopUserDataDir = process.env["ZXCODE_DESKTOP_USER_DATA_DIR"];
const originalDesktopSessionDataDir = process.env["ZXCODE_DESKTOP_SESSION_DATA_DIR"];
const originalDesktopUseElectronDefaultUserData =
  process.env["ZXCODE_DESKTOP_USE_ELECTRON_DEFAULT_USER_DATA"];
const originalCwd = process.cwd();
const originalResourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, "resourcesPath");
const createdDirs: string[] = [];

function restoreEnvValue(key: string, value: string | undefined) {
  if (value == null) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

// Bugfix: 开发机 shell（如 ~/.codegeex/mamba profile）常注入 NO_PROXY/SSL_CERT_FILE 等代理证书
// 变量，buildHostProcessEnv 会把它们并入 ZXCODE_TOOL_ENV_PASSTHROUGH_JSON，
// 断言随宿主机环境漂移。逐个枚举清单必然漏网，这里按 passthrough 捕获口径全量清理并恢复。
const AMBIENT_TOOL_PASSTHROUGH_ENV_KEYS = new Set([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "GIT_SSL_CAINFO",
]);
const AMBIENT_PACKAGE_MANAGER_PROXY_ENV_PATTERN =
  /^(npm_config|yarn|pnpm)_(http_proxy|https_proxy|proxy|all_proxy|no_proxy|cafile|ca)$/i;

function isAmbientHostEnvKey(key: string): boolean {
  const upperKey = key.toUpperCase();
  return (
    AMBIENT_TOOL_PASSTHROUGH_ENV_KEYS.has(upperKey) ||
    AMBIENT_PACKAGE_MANAGER_PROXY_ENV_PATTERN.test(key)
  );
}

const originalAmbientHostEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined && isAmbientHostEnvKey(key)) {
    originalAmbientHostEnv[key] = value;
  }
}

function deleteAmbientHostEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (isAmbientHostEnvKey(key)) {
      delete process.env[key];
    }
  }
}

function resolveTestMockCdnReleaseDir(): string {
  return join(process.cwd(), "packages", "desktop", "mock-cdn", "releases", "0.0.0-test");
}

async function withTestMockCdnReleaseDir<T>(
  mode: "present" | "missing",
  task: () => Promise<T>,
): Promise<T> {
  const releaseDir = resolveTestMockCdnReleaseDir();
  const backupDir = `${releaseDir}.backup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const hadReleaseDir = existsSync(releaseDir);
  if (hadReleaseDir) {
    renameSync(releaseDir, backupDir);
  }

  try {
    if (mode === "present") {
      mkdirSync(releaseDir, { recursive: true });
    } else {
      rmSync(releaseDir, { recursive: true, force: true });
    }
    vi.resetModules();
    return await task();
  } finally {
    rmSync(releaseDir, { recursive: true, force: true });
    if (hadReleaseDir) {
      renameSync(backupDir, releaseDir);
    }
  }
}
function expectRuntimePath(actualPath: string | undefined, expectedPath: string) {
  // Bugfix: macOS 的 /var 是 /private/var 的符号链接，chdir 后 process.cwd() 会返回真实路径。
  // buildHostProcessEnv 按 cwd 解析 bundled runtime，因此断言也要比较真实路径，避免路径拼写差异掩盖优先级语义。
  expect(actualPath).toBe(realpathSync(expectedPath));
}

describe("desktopRuntimeEnv resolveRemoteAssetDirs", () => {
  beforeEach(() => {
    vi.resetModules();
    appMock.isPackaged = false;
    appMock.getPath.mockImplementation((name: string) => `/mock/${name}`);
    delete process.env["ZXCODE_DEV_REMOTE_ASSET_USE_CDN"];
    delete process.env["ZXCODE_REMOTE_ASSET_CDN_BASE_URL"];
    delete process.env["ZXCODE_REMOTE_ASSET_CACHE_DIR"];
  });

  afterAll(() => {
    restoreEnvValue("ZXCODE_DEV_REMOTE_ASSET_USE_CDN", originalUseCdnSwitch);
    restoreEnvValue("ZXCODE_REMOTE_ASSET_CDN_BASE_URL", originalCdnBaseUrl);
    restoreEnvValue("ZXCODE_REMOTE_ASSET_CACHE_DIR", originalRemoteAssetCacheDir);
    restoreEnvValue("NODE_NO_WARNINGS", originalNodeNoWarnings);
  });

  it("开发态当前版本 mock-cdn 存在时默认走 mock-cdn", async () => {
    await withTestMockCdnReleaseDir("present", async () => {
      const { resolveRemoteAssetDirs } = await import("../src/main/desktopRuntimeEnv.js");
      const { DEFAULT_CDN_BASE_URL } = await import("../src/main/remoteCdn.js");
      const dirs = resolveRemoteAssetDirs({
        locale: "zh-CN",
        timeZone: "Asia/Shanghai",
      });

      expect(dirs.mockCdnDir).toMatch(/[\\/]mock-cdn$/);
      // fork 只维护单一默认 CDN 基址（remoteCdn.ts 的 DEFAULT_CDN_BASE_URL）。
      expect(dirs.remoteCdnBaseUrl).toBe(
        `${DEFAULT_CDN_BASE_URL}/zcode/electron/releases/0.0.0-test`,
      );
      expect(dirs.remoteCdnBaseUrls).toEqual([
        `${DEFAULT_CDN_BASE_URL}/zcode/electron/releases/0.0.0-test`,
      ]);
      expect(dirs.remoteCacheDir).toMatch(/[\\/]userData[\\/]remote-assets-cache$/);
    });
  });

  it("开发态当前版本 mock-cdn 缺失时回退到 CDN cache", async () => {
    await withTestMockCdnReleaseDir("missing", async () => {
      const { resolveRemoteAssetDirs } = await import("../src/main/desktopRuntimeEnv.js");
      const { DEFAULT_CDN_BASE_URL } = await import("../src/main/remoteCdn.js");
      const dirs = resolveRemoteAssetDirs({
        locale: "zh-CN",
        timeZone: "Asia/Shanghai",
      });

      expect(dirs.mockCdnDir).toBeUndefined();
      expect(dirs.remoteCdnBaseUrl).toBe(
        `${DEFAULT_CDN_BASE_URL}/zcode/electron/releases/0.0.0-test`,
      );
      expect(dirs.remoteCdnBaseUrls).toEqual([
        `${DEFAULT_CDN_BASE_URL}/zcode/electron/releases/0.0.0-test`,
      ]);
      expect(dirs.remoteCacheDir).toMatch(/[\\/]userData[\\/]remote-assets-cache$/);
    });
  });
  it("开发态打开开关后应直接走 CDN", async () => {
    process.env["ZXCODE_DEV_REMOTE_ASSET_USE_CDN"] = "TRUE";
    const { resolveRemoteAssetDirs } = await import("../src/main/desktopRuntimeEnv.js");
    const { DEFAULT_CDN_BASE_URL } = await import("../src/main/remoteCdn.js");
    const dirs = resolveRemoteAssetDirs({
      locale: "en-US",
      timeZone: "Asia/Shanghai",
    });

    expect(dirs.mockCdnDir).toBeUndefined();
    expect(dirs.remoteCdnBaseUrl).toBe(
      `${DEFAULT_CDN_BASE_URL}/zcode/electron/releases/0.0.0-test`,
    );
    expect(dirs.remoteCdnBaseUrls).toEqual([
      `${DEFAULT_CDN_BASE_URL}/zcode/electron/releases/0.0.0-test`,
    ]);
    expect(dirs.remoteCacheDir).toMatch(/[\\/]userData[\\/]remote-assets-cache$/);
  });

  it("生产态应始终走 CDN 分支", async () => {
    appMock.isPackaged = true;
    process.env["ZXCODE_DEV_REMOTE_ASSET_USE_CDN"] = "0";
    process.env["ZXCODE_REMOTE_ASSET_CDN_BASE_URL"] = "https://cdn.example.com/releases///";
    const { resolveRemoteAssetDirs } = await import("../src/main/desktopRuntimeEnv.js");
    const dirs = resolveRemoteAssetDirs({
      locale: "zh-CN",
      timeZone: "Asia/Shanghai",
    });

    expect(dirs.mockCdnDir).toBeUndefined();
    expect(dirs.remoteCdnBaseUrl).toBe("https://cdn.example.com/releases");
    expect(dirs.remoteCdnBaseUrls).toEqual(["https://cdn.example.com/releases"]);
    expect(dirs.remoteCacheDir).toMatch(/[\\/]userData[\\/]remote-assets-cache$/);
  });

  it("remote asset cache 目录支持环境变量覆盖", async () => {
    const overrideCacheDir = join(tmpdir(), "zcode-prod-remote-assets-cache");
    process.env["ZXCODE_REMOTE_ASSET_CACHE_DIR"] = overrideCacheDir;
    const { resolveRemoteAssetDirs } = await import("../src/main/desktopRuntimeEnv.js");
    const dirs = resolveRemoteAssetDirs({
      locale: "zh-CN",
      timeZone: "Asia/Shanghai",
    });

    expect(dirs.remoteCacheDir).toBe(overrideCacheDir);
  });

  it("remote asset cache 目录支持本地 env 文件覆盖", async () => {
    const overrideCacheDir = join(tmpdir(), "zcode-local-env-remote-assets-cache");
    const { resolveRemoteAssetDirs } = await import("../src/main/desktopRuntimeEnv.js");
    const dirs = resolveRemoteAssetDirs(
      {
        locale: "zh-CN",
        timeZone: "Asia/Shanghai",
      },
      {
        ZXCODE_REMOTE_ASSET_CACHE_DIR: overrideCacheDir,
      },
    );

    expect(dirs.remoteCacheDir).toBe(overrideCacheDir);
  });

  it("开发态本地 env 文件可切到 CDN 并覆盖 CDN 与 cache", async () => {
    const overrideCacheDir = join(tmpdir(), "zcode-local-env-cdn-remote-assets-cache");
    const { resolveRemoteAssetDirs } = await import("../src/main/desktopRuntimeEnv.js");
    const dirs = resolveRemoteAssetDirs(
      {
        locale: "zh-CN",
        timeZone: "Asia/Shanghai",
      },
      {
        ZXCODE_DEV_REMOTE_ASSET_USE_CDN: "1",
        ZXCODE_REMOTE_ASSET_CDN_BASE_URL: "https://cdn.example.com/releases///",
        ZXCODE_REMOTE_ASSET_CACHE_DIR: overrideCacheDir,
      },
    );

    expect(dirs.mockCdnDir).toBeUndefined();
    expect(dirs.remoteCdnBaseUrl).toBe("https://cdn.example.com/releases");
    expect(dirs.remoteCdnBaseUrls).toEqual(["https://cdn.example.com/releases"]);
    expect(dirs.remoteCacheDir).toBe(overrideCacheDir);
  });
});

describe("desktopRuntimeEnv buildHostProcessEnv", () => {
  beforeEach(() => {
    vi.resetModules();
    appMock.isPackaged = false;
    appMock.getPath.mockImplementation((name: string) => `/mock/${name}`);
    delete process.env["NODE_NO_WARNINGS"];
    delete process.env["NODE_ENV"];
    delete process.env["ZXCODE_RUNTIME_ENV"];
    deleteAmbientHostEnv();
    delete process.env["GLM_BINARY_PATH"];
    delete process.env["ZXCODE_BASE_URL"];
    delete process.env["ZXCODE_ENDPOINT_ORIGIN"];
    delete process.env["ZXCODE_DYNAMIC_WORKFLOW_MODE"];
    productFlavorMock.value = "preview";
    process.chdir(originalCwd);
  });

  afterAll(() => {
    restoreEnvValue("NODE_NO_WARNINGS", originalNodeNoWarnings);
    restoreEnvValue("ZXCODE_DYNAMIC_WORKFLOW_MODE", originalDynamicWorkflowMode);
    productFlavorMock.value = "preview";
    restoreEnvValue("NODE_ENV", originalNodeEnv);
    restoreEnvValue("ZXCODE_RUNTIME_ENV", originalZxCodeRuntimeEnv);
    deleteAmbientHostEnv();
    for (const [key, value] of Object.entries(originalAmbientHostEnv)) {
      process.env[key] = value;
    }

    if (originalGlmBinaryPath == null) {
      delete process.env["GLM_BINARY_PATH"];
    } else {
      process.env["GLM_BINARY_PATH"] = originalGlmBinaryPath;
    }
    restoreEnvValue("ZXCODE_BASE_URL", originalZxCodeBaseUrl);
    restoreEnvValue("ZXCODE_ENDPOINT_ORIGIN", originalZxCodeEndpointOrigin);
    if (originalResourcesPathDescriptor) {
      Object.defineProperty(process, "resourcesPath", originalResourcesPathDescriptor);
    } else {
      Reflect.deleteProperty(process, "resourcesPath");
    }

    process.chdir(originalCwd);
    for (const dir of createdDirs.splice(0).reverse()) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("host 进程 env 不再注入 NODE_NO_WARNINGS", async () => {
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({});

    // Bugfix: warning 抑制改由 utilityProcess.fork 的 execArgv 负责，避免 Node 专用变量继续泄漏到 shell。
    expect(env.NODE_NO_WARNINGS).toBeUndefined();
  });

  it("host 进程显式注入 app version 供 agent 使用", async () => {
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({});

    // fork 只下发 ZXCODE_APP_VERSION（构建 commit id 遥测链路已剔除）。
    expect(env.ZXCODE_APP_VERSION).toBe("0.0.0-test");
  });

  it("Windows 打包态会从 resourcesPath 推导安装目录供数据目录保护使用", async () => {
    const { resolveWindowsAppInstallDirForDataBaseDirGuard } =
      await import("../src/main/desktopRuntimeEnv.js");

    expect(
      resolveWindowsAppInstallDirForDataBaseDirGuard({
        platform: "win32",
        isPackaged: true,
        resourcesPath: "C:\\Users\\tester\\AppData\\Local\\Programs\\ZxCode\\resources",
      }),
    ).toBe("C:\\Users\\tester\\AppData\\Local\\Programs\\ZxCode");
  });

  it("非 Windows 或开发态不会注入安装目录保护路径", async () => {
    const { resolveWindowsAppInstallDirForDataBaseDirGuard } =
      await import("../src/main/desktopRuntimeEnv.js");

    expect(
      resolveWindowsAppInstallDirForDataBaseDirGuard({
        platform: "darwin",
        isPackaged: true,
        resourcesPath: "/Applications/ZxCode.app/Contents/Resources",
      }),
    ).toBeUndefined();
    expect(
      resolveWindowsAppInstallDirForDataBaseDirGuard({
        platform: "win32",
        isPackaged: false,
        resourcesPath: "C:\\repo\\packages\\desktop",
      }),
    ).toBeUndefined();
  });

  it("本地开发态 host 进程显式注入 ZXCODE_RUNTIME_ENV=development 且不传 NODE_ENV", async () => {
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({});

    expect(env.ZXCODE_RUNTIME_ENV).toBe("development");
    expect(env.NODE_ENV).toBeUndefined();
  });

  // 根因：bundledCuaHelperAppPath 只在 darwin 上计算（desktopRuntimeEnv.ts 直接
  // `process.platform !== "darwin" ? undefined : ...`），其他平台不写这个键，继承值原样穿透。
  // Windows CUA 走独立的 Node Helper，不使用 .app bundle，所以下面几条 dev bundle 断言
  // 只在 darwin 上有意义。
  it.skipIf(process.platform !== "darwin")(
    "本地免签 CUA 使用 dev Helper bundle，且不回退网络下载",
    async () => {
      const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

      const env = buildHostProcessEnv({
        ZXCODE_HOME: "/tmp/zxcode-cua-dev-home",
        ZXCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL: "1",
      });

      expect(env.ZXCODE_CUA_BUNDLED_HELPER_APP_PATH).toBe(
        join("/tmp/zxcode-cua-dev-home", "computer-use", "dev", DEV_HELPER_APP_NAME),
      );
    },
  );

  it.skipIf(process.platform !== "darwin")(
    "本地免签 CUA 尊重显式 bundled Helper 路径以支持无打包源码验证",
    async () => {
      const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

      const env = buildHostProcessEnv({
        ZXCODE_HOME: "/tmp/zxcode-cua-dev-home",
        ZXCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL: "1",
        ZXCODE_CUA_BUNDLED_HELPER_APP_PATH: `/tmp/new-helper/${DEV_HELPER_APP_NAME}`,
      });

      expect(env.ZXCODE_CUA_BUNDLED_HELPER_APP_PATH).toBe(`/tmp/new-helper/${DEV_HELPER_APP_NAME}`);
    },
  );

  it.skipIf(process.platform !== "darwin")(
    "本地免签 CUA 在显式 bundled Helper 路径为空白时回退到默认 dev bundle",
    async () => {
      const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

      const env = buildHostProcessEnv({
        ZXCODE_HOME: "/tmp/zxcode-cua-dev-home",
        ZXCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL: "1",
        ZXCODE_CUA_BUNDLED_HELPER_APP_PATH: "   ",
      });

      expect(env.ZXCODE_CUA_BUNDLED_HELPER_APP_PATH).toBe(
        join("/tmp/zxcode-cua-dev-home", "computer-use", "dev", DEV_HELPER_APP_NAME),
      );
    },
  );

  it("打包态 host 进程显式注入 ZXCODE_RUNTIME_ENV=production 且不传 NODE_ENV", async () => {
    appMock.isPackaged = true;
    Object.defineProperty(process, "resourcesPath", {
      value: "/mock/resources",
      configurable: true,
    });
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({
      ZXCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL: "1",
    });

    expect(env.ZXCODE_RUNTIME_ENV).toBe("production");
    expect(env.NODE_ENV).toBeUndefined();
    // release app 不得继承本地免签 Helper 的逃生门。
    expect(env.ZXCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL).toBeUndefined();
  });

  it("打包 Preview 不向 Host 注入 storage profile 或精确 CLI 根", async () => {
    appMock.isPackaged = true;
    Object.defineProperty(process, "resourcesPath", {
      value: "/mock/resources",
      configurable: true,
    });
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({});

    expect(env.ZXCODE_STORAGE_PROFILE).toBeUndefined();
    expect(env.ZXCODE_STORAGE_DIR).toBeUndefined();
    expect(env.ZXCODE_HOME).toBeUndefined();
  });

  it("源码开发态不向 Host 注入独立 storage profile 或精确 CLI 根", async () => {
    appMock.isPackaged = false;
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({});

    expect(env.ZXCODE_STORAGE_PROFILE).toBeUndefined();
    expect(env.ZXCODE_STORAGE_DIR).toBeUndefined();
    expect(env.ZXCODE_HOME).toBeUndefined();
  });

  // 拆出来的原因：「打包态用 Resources 里的签名 Helper 覆盖外部传入路径」这条断言只在 darwin
  // 成立（desktopRuntimeEnv.ts 非 darwin 直接给 undefined，继承值原样穿透），
  // 而同一条用例里的 ZXCODE_RUNTIME_ENV / NODE_ENV / ALLOW_UNSIGNED 是跨平台契约，
  // 整条 skip 会连带丢掉这三条覆盖，所以只把 macOS 专属的那条单独 gate。
  it.skipIf(process.platform !== "darwin")(
    "打包态 host 进程用 Resources 里的 Helper 覆盖外部传入的 bundled 路径",
    async () => {
      appMock.isPackaged = true;
      Object.defineProperty(process, "resourcesPath", {
        value: "/mock/resources",
        configurable: true,
      });
      const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

      const env = buildHostProcessEnv({
        ZXCODE_CUA_BUNDLED_HELPER_APP_PATH: "/tmp/untrusted-helper.app",
        ZXCODE_CUA_HELPER_ALLOW_UNSIGNED_LOCAL: "1",
      });

      expect(env.ZXCODE_CUA_BUNDLED_HELPER_APP_PATH).toBe(
        join("/mock/resources", "cua-helper", HELPER_APP_NAME),
      );
    },
  );

  it("host 进程过滤 shell 注入的运行时、代理和证书变量", async () => {
    process.env["NODE_ENV"] = "development";
    process.env["HTTP_PROXY"] = "http://ambient-proxy:8080";
    process.env["NODE_EXTRA_CA_CERTS"] = "/tmp/ambient-ca.pem";
    process.env["npm_config_proxy"] = "http://npm-proxy:8080";
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({
      http_proxy: "http://local-proxy:8080",
      NODE_NO_WARNINGS: "1",
    });

    expect(env.ZXCODE_RUNTIME_ENV).toBe("development");
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.HTTP_PROXY).toBeUndefined();
    expect(env.http_proxy).toBeUndefined();
    expect(env.NODE_EXTRA_CA_CERTS).toBeUndefined();
    expect(env.NODE_NO_WARNINGS).toBeUndefined();
    expect(env.npm_config_proxy).toBeUndefined();
    expect(JSON.parse(env.ZXCODE_TOOL_ENV_PASSTHROUGH_JSON ?? "{}")).toMatchObject({
      http_proxy: "http://local-proxy:8080",
      HTTP_PROXY: "http://ambient-proxy:8080",
      NODE_EXTRA_CA_CERTS: "/tmp/ambient-ca.pem",
      npm_config_proxy: "http://npm-proxy:8080",
    });
  });

  it("bundled GLM runtime 优先于本地显式 GLM_BINARY_PATH", async () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), "zxcode-desktop-runtime-env-"));
    createdDirs.push(sandboxRoot);
    const platformKey = `${process.platform}-${process.arch}`;
    const bundledBinaryName = process.platform === "win32" ? "zxcode-agent.exe" : "zxcode-agent";
    const bundledPath = join(sandboxRoot, "bundled-agents", platformKey, "glm", bundledBinaryName);
    const localGlmPath = join(sandboxRoot, "local", "zxcode-agent");
    mkdirSync(join(sandboxRoot, "bundled-agents", platformKey, "glm"), {
      recursive: true,
    });
    mkdirSync(join(sandboxRoot, "local"), { recursive: true });
    writeFileSync(bundledPath, "bundled\n", "utf-8");
    writeFileSync(localGlmPath, "local\n", "utf-8");
    process.chdir(sandboxRoot);

    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv({ GLM_BINARY_PATH: localGlmPath });

    expectRuntimePath(env.GLM_BINARY_PATH, bundledPath);
  });

  it("本地 host 进程加载工作区 .env.development 的测试环境 API", async () => {
    const { loadHostProcessEnvFromLocalFiles } = await import("../src/main/desktopRuntimeEnv.js");

    const env = loadHostProcessEnvFromLocalFiles();

    expect(env.ZXCODE_BASE_URL).toBe(TEST_ZCODE_ENDPOINT_ORIGIN);
  });

  it("main 进程 endpoint 临时覆盖优先读取命令行环境变量", async () => {
    process.env["ZXCODE_ENDPOINT_ORIGIN"] = "http://127.0.0.1:18765";
    const { resolveZCodeEndpointEnvBaseOrigin } = await import("../src/main/desktopRuntimeEnv.js");

    expect(
      resolveZCodeEndpointEnvBaseOrigin({
        ZXCODE_BASE_URL: "https://local-file-endpoint.example.test",
      }),
    ).toBe("http://127.0.0.1:18765");
  });

  it("打包后的测试环境 host 进程内置测试环境端点", async () => {
    appMock.isPackaged = true;
    Object.defineProperty(process, "resourcesPath", {
      value: "/mock/resources",
      configurable: true,
    });
    delete process.env["ZXCODE_BASE_URL"];
    delete process.env["ZXCODE_ENDPOINT_ORIGIN"];

    const { buildHostProcessEnv, loadHostProcessEnvFromLocalFiles } =
      await import("../src/main/desktopRuntimeEnv.js");

    const env = buildHostProcessEnv(loadHostProcessEnvFromLocalFiles());

    expect(env.ZXCODE_ENV).toBe("test");
    expect(env.ZXCODE_BASE_URL).toBe(TEST_ZCODE_ENDPOINT_ORIGIN);
    expect(env.ZXCODE_CUA_HELPER_INSTALL_VARIANT).toBe("preview");
  });

  // DWG-05（docs/dynamic-workflow/launch.md「Gray release」）：Main 对
  // ZXCODE_DYNAMIC_WORKFLOW_MODE 只有「写」和「删」两种动作，先在纯函数上钉住三档语义。
  // fork 实现位于 desktopDynamicWorkflowTier.ts（可被 node --test 直测）。
  describe("resolveDynamicWorkflowModeHostEnv", () => {
    it("未打包 dev 透传 shell 里的合法取值", async () => {
      const { resolveDynamicWorkflowModeHostEnv } =
        await import("../src/main/desktopDynamicWorkflowTier.js");

      expect(
        resolveDynamicWorkflowModeHostEnv({
          inheritedValue: "disabled",
          isPackaged: false,
          isPreview: false,
          userEnabled: false,
        }),
      ).toEqual({ ZXCODE_DYNAMIC_WORKFLOW_MODE: "disabled" });
    });

    it("未打包 dev 丢弃非法取值和缺省值，而不是转发给 Host", async () => {
      const { resolveDynamicWorkflowModeHostEnv } =
        await import("../src/main/desktopDynamicWorkflowTier.js");

      expect(
        resolveDynamicWorkflowModeHostEnv({
          inheritedValue: "garbage",
          isPackaged: false,
          isPreview: false,
          userEnabled: false,
        }),
      ).toEqual({});
      expect(
        resolveDynamicWorkflowModeHostEnv({
          inheritedValue: undefined,
          isPackaged: false,
          isPreview: false,
          userEnabled: false,
        }),
      ).toEqual({});
    });

    it("未打包 dev 无 shell 覆盖时按用户设置回落 alwaysOn", async () => {
      const { resolveDynamicWorkflowModeHostEnv } =
        await import("../src/main/desktopDynamicWorkflowTier.js");

      expect(
        resolveDynamicWorkflowModeHostEnv({
          inheritedValue: undefined,
          isPackaged: false,
          isPreview: false,
          userEnabled: true,
        }),
      ).toEqual({ ZXCODE_DYNAMIC_WORKFLOW_MODE: "alwaysOn" });
    });

    it("打包 preview 固定写入 alwaysOn，忽略 shell 的相反取值", async () => {
      const { resolveDynamicWorkflowModeHostEnv } =
        await import("../src/main/desktopDynamicWorkflowTier.js");

      expect(
        resolveDynamicWorkflowModeHostEnv({
          inheritedValue: "disabled",
          isPackaged: true,
          isPreview: true,
          userEnabled: false,
        }),
      ).toEqual({ ZXCODE_DYNAMIC_WORKFLOW_MODE: "alwaysOn" });
    });

    it("打包 production 读用户设置：关闭不写入，开启写 alwaysOn", async () => {
      const { resolveDynamicWorkflowModeHostEnv } =
        await import("../src/main/desktopDynamicWorkflowTier.js");

      expect(
        resolveDynamicWorkflowModeHostEnv({
          inheritedValue: "alwaysOn",
          isPackaged: true,
          isPreview: false,
          userEnabled: false,
        }),
      ).toEqual({});
      expect(
        resolveDynamicWorkflowModeHostEnv({
          inheritedValue: undefined,
          isPackaged: true,
          isPreview: false,
          userEnabled: true,
        }),
      ).toEqual({ ZXCODE_DYNAMIC_WORKFLOW_MODE: "alwaysOn" });
    });
  });

  it("未打包 dev 的 host env 带上 shell 里的 Dynamic Workflow 覆盖，非法取值则整键消失", async () => {
    process.env["ZXCODE_DYNAMIC_WORKFLOW_MODE"] = "onDemand";
    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    expect(buildHostProcessEnv({}).ZXCODE_DYNAMIC_WORKFLOW_MODE).toBe("onDemand");

    vi.resetModules();
    process.env["ZXCODE_DYNAMIC_WORKFLOW_MODE"] = "not-a-mode";
    const { buildHostProcessEnv: rebuilt } = await import("../src/main/desktopRuntimeEnv.js");

    // 非法值必须被删掉而不是随 inheritedEnv 穿透；否则 Host 还要自己分辨来源。
    expect(rebuilt({}).ZXCODE_DYNAMIC_WORKFLOW_MODE).toBeUndefined();
  });

  it("打包 preview 的 host env 把 Dynamic Workflow 覆盖改写成 alwaysOn", async () => {
    appMock.isPackaged = true;
    productFlavorMock.value = "preview";
    Object.defineProperty(process, "resourcesPath", {
      value: "/mock/resources",
      configurable: true,
    });
    process.env["ZXCODE_DYNAMIC_WORKFLOW_MODE"] = "disabled";

    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    expect(buildHostProcessEnv({}).ZXCODE_DYNAMIC_WORKFLOW_MODE).toBe("alwaysOn");
  });

  it("打包 production 的 host env 删除继承的 Dynamic Workflow 覆盖", async () => {
    appMock.isPackaged = true;
    productFlavorMock.value = "production";
    Object.defineProperty(process, "resourcesPath", {
      value: "/mock/resources",
      configurable: true,
    });
    process.env["ZXCODE_DYNAMIC_WORKFLOW_MODE"] = "alwaysOn";

    const { buildHostProcessEnv } = await import("../src/main/desktopRuntimeEnv.js");

    // shell 和 .env 两条继承路径都要被删干净，本机环境变量不能自行打开灰度。
    expect(buildHostProcessEnv({}).ZXCODE_DYNAMIC_WORKFLOW_MODE).toBeUndefined();
    expect(
      buildHostProcessEnv({ ZXCODE_DYNAMIC_WORKFLOW_MODE: "alwaysOn" })
        .ZXCODE_DYNAMIC_WORKFLOW_MODE,
    ).toBeUndefined();
  });
});

describe("desktopRuntimeEnv runtime identity", () => {
  beforeEach(() => {
    vi.resetModules();
    appMock.isPackaged = false;
    appMock.getPath.mockClear();
    appMock.getPath.mockImplementation((name: string) => `/mock/${name}`);
    delete process.env["ZXCODE_DESKTOP_APPLICATION_NAME"];
    delete process.env["ZXCODE_DESKTOP_HOME_DIR"];
    delete process.env["ZXCODE_DESKTOP_USER_DATA_DIR"];
    delete process.env["ZXCODE_DESKTOP_SESSION_DATA_DIR"];
    delete process.env["ZXCODE_DESKTOP_USE_ELECTRON_DEFAULT_USER_DATA"];
  });

  afterAll(() => {
    restoreEnvValue("ZXCODE_DESKTOP_APPLICATION_NAME", originalDesktopApplicationName);
    restoreEnvValue("ZXCODE_DESKTOP_HOME_DIR", originalDesktopHomeDir);
    restoreEnvValue("ZXCODE_DESKTOP_USER_DATA_DIR", originalDesktopUserDataDir);
    restoreEnvValue("ZXCODE_DESKTOP_SESSION_DATA_DIR", originalDesktopSessionDataDir);
    restoreEnvValue(
      "ZXCODE_DESKTOP_USE_ELECTRON_DEFAULT_USER_DATA",
      originalDesktopUseElectronDefaultUserData,
    );
  });

  it("e2e 可通过环境变量隔离应用名和 Electron 数据目录", async () => {
    process.env["ZXCODE_DESKTOP_APPLICATION_NAME"] = "ZxCode E2E";
    process.env["ZXCODE_DESKTOP_HOME_DIR"] = "/tmp/zxcode-e2e/home";
    process.env["ZXCODE_DESKTOP_USER_DATA_DIR"] = "/tmp/zxcode-e2e/user-data";
    process.env["ZXCODE_DESKTOP_SESSION_DATA_DIR"] = "/tmp/zxcode-e2e/session-data";

    const { runtimeApplicationName, runtimeHomePath, runtimeSessionDataPath, runtimeUserDataPath } =
      await import("../src/main/desktopRuntimeEnv.js");

    expect(runtimeApplicationName).toBe("ZxCode E2E");
    expect(runtimeHomePath).toBe("/tmp/zxcode-e2e/home");
    expect(runtimeUserDataPath).toBe("/tmp/zxcode-e2e/user-data");
    expect(runtimeSessionDataPath).toBe("/tmp/zxcode-e2e/session-data");
  });

  it("打包测试环境使用 Preview 应用名和独立 Electron 数据目录", async () => {
    appMock.isPackaged = true;

    const {
      isPreviewPackagedRuntime,
      runtimeApplicationName,
      runtimeSessionDataPath,
      runtimeUserDataPath,
    } = await import("../src/main/desktopRuntimeEnv.js");

    expect(isPreviewPackagedRuntime).toBe(true);
    expect(runtimeApplicationName).toBe("ZxCode Preview");
    // Bugfix：这两条路径由实现用宿主 path.join 从 app.getPath("appData") 拼出，
    // Windows 上是 `\mock\appData\ZxCode Preview`，写死 POSIX 字面量必然失败。
    // 用例要断言的是「Preview 单独占一个 Electron 数据目录」的目录结构，与分隔符无关，
    // 所以用同样的 join 表达；在 POSIX 上是恒等变换。
    expect(runtimeUserDataPath).toBe(join("/mock/appData", "ZxCode Preview"));
    expect(runtimeSessionDataPath).toBe(join("/mock/appData", "ZxCode Preview", "session"));
  });

  it("e2e 可保留 Chromedriver 注入的 Electron userData 目录", async () => {
    process.env["ZXCODE_DESKTOP_USE_ELECTRON_DEFAULT_USER_DATA"] = "1";
    appMock.getPath.mockImplementation((name: string) => {
      if (name === "appData") {
        throw new Error("Failed to get 'appData' path");
      }
      return `/mock/${name}`;
    });

    const { runtimeSessionDataPath, runtimeUserDataPath, shouldUseElectronDefaultUserDataPath } =
      await import("../src/main/desktopRuntimeEnv.js");

    expect(shouldUseElectronDefaultUserDataPath).toBe(true);
    expect(runtimeUserDataPath).toBeUndefined();
    expect(runtimeSessionDataPath).toBeUndefined();
    expect(appMock.getPath).not.toHaveBeenCalledWith("appData");
  });
});
