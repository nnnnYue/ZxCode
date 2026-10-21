import { describe, expect, it } from "vitest";
import {
  ZXCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY,
  ZXCODE_REMOTE_HTTP_PROXY_ENV_KEY,
  ZXCODE_REMOTE_NO_PROXY_ENV_KEY,
  ZXCODE_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY,
  buildZCodeToolEnvPassthroughEnv,
  getCapturedZCodeCuaBrokerCredentials,
  isCuaDevModeRequested,
  isZCodeCuaInternalFeatureEnabled,
  readZCodeToolEnvPassthroughEnv,
  resetCapturedZCodeCuaBrokerCredentialsForTest,
  sanitizeZCodeRuntimeEnv,
} from "../src/runtimeEnv.js";

describe("runtimeEnv", () => {
  it("enables internal CUA by default while honoring explicit false values", () => {
    expect(isZCodeCuaInternalFeatureEnabled({})).toBe(true);
    expect(isZCodeCuaInternalFeatureEnabled({ ZXCODE_CUA_PRODUCT_HELPER: "0" })).toBe(false);
    expect(isZCodeCuaInternalFeatureEnabled({ ZXCODE_CUA_PRODUCT_HELPER: "false" })).toBe(false);
    expect(isZCodeCuaInternalFeatureEnabled({ ZXCODE_CUA_PRODUCT_HELPER: "1" })).toBe(true);
    expect(isZCodeCuaInternalFeatureEnabled({ ZXCODE_CUA_PRODUCT_HELPER: " TRUE " })).toBe(true);
    expect(isZCodeCuaInternalFeatureEnabled({ ZXCODE_CUA_PRODUCT_HELPER: "on" })).toBe(true);
  });

  it("ZXCODE_CUA_DEV_MODE is the one-knob dev bundle and implies the internal feature flag", () => {
    // isCuaDevModeRequested: only explicit truthy values (case-insensitive, trimmed).
    expect(isCuaDevModeRequested({})).toBe(false);
    expect(isCuaDevModeRequested({ ZXCODE_CUA_DEV_MODE: "0" })).toBe(false);
    expect(isCuaDevModeRequested({ ZXCODE_CUA_DEV_MODE: "false" })).toBe(false);
    expect(isCuaDevModeRequested({ ZXCODE_CUA_DEV_MODE: "1" })).toBe(true);
    expect(isCuaDevModeRequested({ ZXCODE_CUA_DEV_MODE: " ON " })).toBe(true);
    expect(isCuaDevModeRequested({ ZXCODE_CUA_DEV_MODE: "true" })).toBe(true);

    // DEV_MODE implies the internal feature flag without needing ZXCODE_CUA_PRODUCT_HELPER,
    // collapsing the historical multi-var dev incantation to one knob.
    expect(isZCodeCuaInternalFeatureEnabled({ ZXCODE_CUA_DEV_MODE: "1" })).toBe(true);
    expect(isZCodeCuaInternalFeatureEnabled({ ZXCODE_CUA_PRODUCT_HELPER: "1" })).toBe(true);
    expect(isZCodeCuaInternalFeatureEnabled({})).toBe(true);
  });

  it("sanitizes runtime env while sealing user network env for tools", () => {
    const sourceEnv = {
      HTTP_PROXY: "http://proxy.example:8080",
      NODE_ENV: "development",
      NODE_EXTRA_CA_CERTS: "/tmp/root-ca.pem",
      PATH: "/usr/bin:/bin",
      npm_config_proxy: "http://npm-proxy.example:8080",
    };

    const sanitized = sanitizeZCodeRuntimeEnv(sourceEnv);
    const passthroughEnv = buildZCodeToolEnvPassthroughEnv(sourceEnv);
    const captured = readZCodeToolEnvPassthroughEnv(passthroughEnv);

    expect(sanitized).toEqual({ PATH: "/usr/bin:/bin" });
    expect(passthroughEnv[ZXCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY]).toBeDefined();
    expect(captured).toEqual({
      HTTP_PROXY: "http://proxy.example:8080",
      NODE_EXTRA_CA_CERTS: "/tmp/root-ca.pem",
      npm_config_proxy: "http://npm-proxy.example:8080",
    });
  });

  it("ignores invalid passthrough JSON and non-network keys", () => {
    const captured = readZCodeToolEnvPassthroughEnv({
      [ZXCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY]: JSON.stringify({
        HTTP_PROXY: "http://proxy.example:8080",
        NODE_ENV: "production",
        PATH: "/tmp/bin",
      }),
    });

    expect(captured).toEqual({
      HTTP_PROXY: "http://proxy.example:8080",
    });
    expect(
      readZCodeToolEnvPassthroughEnv({
        [ZXCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY]: "not-json",
      }),
    ).toEqual({});
  });

  it("strips the CUA broker socket/authority/refresh marker from child env and tool passthrough", () => {
    // Confused-deputy 防护：broker bearer 凭据只该定向注入目标 zcode-cua server，绝不能随全局 env
    // 泄漏给其它 MCP / Bash / tool 子进程，也不能经 tool-env-passthrough 恢复。
    const sourceEnv = {
      PATH: "/usr/bin:/bin",
      ZXCODE_CUA_PERMISSION_BROKER_SOCKET: "/tmp/zcode-cua-me/broker-abc.sock",
      ZXCODE_CUA_PERMISSION_BROKER_REFRESH_MARKER:
        "/tmp/zcode-cua-me/broker-abc.sock.permission-refresh.json",
    };
    const sanitized = sanitizeZCodeRuntimeEnv(sourceEnv);
    expect(sanitized).toEqual({ PATH: "/usr/bin:/bin" });

    const captured = readZCodeToolEnvPassthroughEnv(buildZCodeToolEnvPassthroughEnv(sourceEnv));
    expect(captured).not.toHaveProperty("ZXCODE_CUA_PERMISSION_BROKER_SOCKET");
    expect(captured).not.toHaveProperty("ZXCODE_CUA_PERMISSION_BROKER_REFRESH_MARKER");
  });

  it("strips desktop-to-remote network handoff values after stdio bootstrap", () => {
    const sourceEnv = {
      PATH: "/usr/bin:/bin",
      [ZXCODE_REMOTE_RUNTIME_NETWORK_AUTHORITY_ENV_KEY]: "1",
      [ZXCODE_REMOTE_HTTP_PROXY_ENV_KEY]: "http://172.21.240.1:7890",
      [ZXCODE_REMOTE_NO_PROXY_ENV_KEY]: "localhost,127.0.0.1",
    };

    expect(sanitizeZCodeRuntimeEnv(sourceEnv)).toEqual({ PATH: "/usr/bin:/bin" });
    expect(readZCodeToolEnvPassthroughEnv(buildZCodeToolEnvPassthroughEnv(sourceEnv))).toEqual({});
  });

  it("captures broker credentials as one atomic pair and clears stale state on partial rotation", () => {
    resetCapturedZCodeCuaBrokerCredentialsForTest();
    try {
      sanitizeZCodeRuntimeEnv({
        ZXCODE_CUA_PERMISSION_BROKER_SOCKET: "/tmp/broker-a.sock",
        ZXCODE_CUA_PLUGIN_AUTHORITY: "authority-a",
      });
      expect(getCapturedZCodeCuaBrokerCredentials()).toEqual({
        socket: "/tmp/broker-a.sock",
        pluginAuthority: "authority-a",
      });

      sanitizeZCodeRuntimeEnv({
        ZXCODE_CUA_PERMISSION_BROKER_SOCKET: "/tmp/broker-b.sock",
      });
      expect(getCapturedZCodeCuaBrokerCredentials()).toEqual({
        socket: undefined,
        pluginAuthority: undefined,
      });

      sanitizeZCodeRuntimeEnv({
        ZXCODE_CUA_PERMISSION_BROKER_SOCKET: "/tmp/broker-b.sock",
        ZXCODE_CUA_PLUGIN_AUTHORITY: "authority-b",
      });
      expect(getCapturedZCodeCuaBrokerCredentials()).toEqual({
        socket: "/tmp/broker-b.sock",
        pluginAuthority: "authority-b",
      });
    } finally {
      resetCapturedZCodeCuaBrokerCredentialsForTest();
    }
  });

  // fork 已剔除 Agent OTLP 遥测链路：readZCodeAgentTelemetryEnv /
  // getCapturedZCodeAgentTelemetryEnv 及对应 env 剔除逻辑随 telemetryCore 一并移除，
  // 上游的「Agent OTLP 私有捕获」与「allowlist 遥测 env 提取」用例不再适用。
});
