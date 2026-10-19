import { describe, expect, it } from "vitest";
import {
  DEFAULT_BIGMODEL_API_ORIGIN,
  DEFAULT_WEB_REMOTE_CONTROL_RELAY_WS_URL,
  DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
  TEST_ZCODE_ENDPOINT_ORIGIN,
  WEB_REMOTE_CONTROL_V4_MIN_APP_VERSION,
  buildZCodeEndpointUrls,
  normalizeZCodeEndpointOrigin,
  resolveBigModelApiOrigin,
  resolveRuntimeZCodeEndpointOrigin,
  resolveRuntimeZCodeEnv,
  resolveWebRemoteControlRelayWsUrl,
  resolveZCodeEndpointOrigin,
  rewriteZCodeEndpointUrl,
} from "../src/zcodeEndpoint.js";

// 门禁约束：平台 origin 字面量只允许出现在 src/zcodeEndpoint.ts 常量中；
// 测试一律通过 DEFAULT_ZXCODE_ENDPOINT_ORIGIN 组装期望值。
const DEFAULT_ORIGIN = DEFAULT_ZXCODE_ENDPOINT_ORIGIN;

describe("zcodeEndpoint", () => {
  it("defaults to the scoped origin in every env without env base url", () => {
    expect(DEFAULT_ORIGIN).toBe(new URL(DEFAULT_ORIGIN).origin);
    expect(TEST_ZCODE_ENDPOINT_ORIGIN).toBe(DEFAULT_ORIGIN);
    expect(resolveZCodeEndpointOrigin()).toBe(DEFAULT_ORIGIN);
    expect(resolveZCodeEndpointOrigin({ env: "test" })).toBe(DEFAULT_ORIGIN);
  });

  it("uses ZXCODE_BASE_URL style env base as the default endpoint", () => {
    expect(resolveZCodeEndpointOrigin({ envBaseOrigin: "https://example.test" })).toBe(
      "https://example.test",
    );
    expect(
      resolveRuntimeZCodeEndpointOrigin({
        ZXCODE_BASE_URL: "https://base.test/prefix",
        ZXCODE_ENDPOINT_ORIGIN: "https://origin.test",
      }),
    ).toBe("https://base.test");
    expect(
      resolveRuntimeZCodeEndpointOrigin({ ZXCODE_ENDPOINT_ORIGIN: "https://origin.test" }),
    ).toBe("https://origin.test");
  });

  it("keeps the explicit override above env base url and normalizes to origin", () => {
    expect(
      resolveRuntimeZCodeEndpointOrigin(
        { ZXCODE_BASE_URL: "https://base.test" },
        { overrideOrigin: "https://override.test/path" },
      ),
    ).toBe("https://override.test");
    expect(resolveZCodeEndpointOrigin({ overrideOrigin: "https://override.test" })).toBe(
      "https://override.test",
    );
    // 空白输入不覆盖默认值。
    expect(resolveZCodeEndpointOrigin({ envBaseOrigin: "   " })).toBe(DEFAULT_ORIGIN);
  });

  it("derives runtime env from ZXCODE_ENV only", () => {
    expect(resolveRuntimeZCodeEnv({ ZXCODE_ENV: "test" })).toBe("test");
    expect(resolveRuntimeZCodeEnv({ ZXCODE_ENV: "TEST" })).toBe("test");
    expect(resolveRuntimeZCodeEnv({ ZXCODE_ENV: "production" })).toBe("production");
    expect(resolveRuntimeZCodeEnv({})).toBe("production");
  });

  it("derives BigModel API origin from BIGMODEL_API_BASE_URL with the scoped default", () => {
    expect(resolveBigModelApiOrigin({})).toBe(DEFAULT_BIGMODEL_API_ORIGIN);
    expect(resolveBigModelApiOrigin({ BIGMODEL_API_BASE_URL: "https://api.test/base" })).toBe(
      "https://api.test",
    );
  });

  it("normalizes origins and rejects non-http endpoint origins", () => {
    expect(normalizeZCodeEndpointOrigin(" https://a.test/path?q=1 ")).toBe("https://a.test");
    expect(() => normalizeZCodeEndpointOrigin("  ")).toThrow(/empty/u);
    expect(() => normalizeZCodeEndpointOrigin("ftp://a.test")).toThrow(/http/u);
  });

  it("derives api and remote urls from the same origin with the version gate", () => {
    const urls = buildZCodeEndpointUrls("https://a.test/prefix");
    expect(urls.origin).toBe("https://a.test");
    expect(urls.apiBaseUrl).toBe("https://a.test/api/v1");
    expect(urls.remoteUrl).toBe("https://a.test/remote/v3");

    expect(buildZCodeEndpointUrls(DEFAULT_ORIGIN).remoteUrl).toBe(`${DEFAULT_ORIGIN}/remote/v3`);
    expect(
      buildZCodeEndpointUrls(DEFAULT_ORIGIN, {
        appVersion: WEB_REMOTE_CONTROL_V4_MIN_APP_VERSION,
      }).remoteUrl,
    ).toBe(`${DEFAULT_ORIGIN}/remote/v4`);
    // 预发布版本按 semver 低于正式版门槛，保守使用 v3。
    expect(
      buildZCodeEndpointUrls(DEFAULT_ORIGIN, {
        appVersion: `${WEB_REMOTE_CONTROL_V4_MIN_APP_VERSION}-rc.1`,
      }).remoteUrl,
    ).toBe(`${DEFAULT_ORIGIN}/remote/v3`);
    expect(
      buildZCodeEndpointUrls(DEFAULT_ORIGIN, {
        appVersion: "3.4.1",
      }).remoteUrl,
    ).toBe(`${DEFAULT_ORIGIN}/remote/v4`);
  });

  it("resolves the web remote control relay ws url with an explicit override", () => {
    expect(resolveWebRemoteControlRelayWsUrl()).toBe(DEFAULT_WEB_REMOTE_CONTROL_RELAY_WS_URL);
    // 本 fork 无独立 test origin，endpointOrigin 不改变默认 relay 地址。
    expect(resolveWebRemoteControlRelayWsUrl({ endpointOrigin: "https://other.test" })).toBe(
      DEFAULT_WEB_REMOTE_CONTROL_RELAY_WS_URL,
    );
    expect(resolveWebRemoteControlRelayWsUrl({ overrideUrl: "wss://self-hosted.test/ws" })).toBe(
      "wss://self-hosted.test/ws",
    );
  });

  it("rewrites only default-origin urls onto the target origin", () => {
    const rewritten = rewriteZCodeEndpointUrl(
      `${DEFAULT_ORIGIN}/api/v1/tasks/1?token=x#frag`,
      "https://mirror.test",
    );
    expect(rewritten).toBe("https://mirror.test/api/v1/tasks/1?token=x#frag");

    expect(rewriteZCodeEndpointUrl("https://other.test/api/v1", "https://mirror.test")).toBe(
      "https://other.test/api/v1",
    );
    expect(rewriteZCodeEndpointUrl(`${DEFAULT_ORIGIN}/api/v1`, DEFAULT_ORIGIN)).toBe(
      `${DEFAULT_ORIGIN}/api/v1`,
    );
    // 非 URL 输入原样返回，不抛异常。
    expect(rewriteZCodeEndpointUrl("not a url", "https://mirror.test")).toBe("not a url");
  });
});
