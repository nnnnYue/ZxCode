import { describe, expect, it } from "vitest";
import { DEFAULT_ZXCODE_ENDPOINT_ORIGIN } from "../src/zcodeEndpoint.js";
import {
  buildZCodeSourceHeadersFromContext,
  buildModelRequestDefaultHeaders,
  normalizeZCodeSourceHeaderValue,
  ZXCODE_SOURCE_HEADERS,
} from "../src/zcode-source-headers.js";

describe("buildZCodeSourceHeadersFromContext", () => {
  it("builds the shared endpoint attribution triple", () => {
    // fork 去平台化：来源头只剩 HTTP-Referer / User-Agent / X-Title，指纹头不再产出。
    expect(
      buildZCodeSourceHeadersFromContext({
        appVersion: " 2.14.0 ",
        endpointOrigin: DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
        sourceTitle: "cli",
      }),
    ).toEqual({
      ...ZXCODE_SOURCE_HEADERS,
      "HTTP-Referer": DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
      "User-Agent": "ZxCode/2.14.0",
      "X-Title": "ZxCode@cli",
    });
    for (const key of [
      "x-zxcode-app-version",
      "x-release-channel",
      "x-client-language",
      "x-client-timezone",
      "x-platform",
      "x-os-category",
      "x-os-version",
      "x-device-mid",
    ])
      expect(buildZCodeSourceHeadersFromContext()[key.toLowerCase()]).toBeUndefined();
  });

  it("drops invalid optional values without emitting malformed headers", () => {
    const headers = buildZCodeSourceHeadersFromContext({
      appVersion: "bad\nversion",
      sourceTitle: "electron",
    });

    expect(headers).toEqual({
      "HTTP-Referer": DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
      "User-Agent": "ZxCode/unknown",
      "X-Title": "ZxCode@electron",
    });
  });

  it("model request default headers add the agent header on top of the triple", () => {
    expect(buildModelRequestDefaultHeaders({ appVersion: "2.14.0", sourceTitle: "cli" })).toEqual({
      "HTTP-Referer": DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
      "User-Agent": "ZxCode/2.14.0",
      "X-Title": "ZxCode@cli",
      "X-ZxCode-Agent": "glm",
    });
    expect(normalizeZCodeSourceHeaderValue("  ok  ")).toBe("ok");
    expect(normalizeZCodeSourceHeaderValue("bad\nvalue")).toBeUndefined();
  });
});
