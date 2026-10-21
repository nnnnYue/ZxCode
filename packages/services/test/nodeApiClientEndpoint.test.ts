import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ZXCODE_ENDPOINT_ORIGIN, ZXCODE_SOURCE_HEADERS } from "@zcode/shared";
import { createNodeApiClient } from "../src/providers/api/nodeApiClient.js";
import { buildZCodeSourceHeaders } from "../src/providers/sourceHeaders.js";

describe("NodeApiClient endpoint rewriting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rewrites only the configured zcode endpoint origin", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const client = createNodeApiClient({
      fetchImpl: fetchImpl as typeof fetch,
      resolveZCodeEndpointOrigin: async () => "http://localhost:3030",
    });

    await client.request(`${DEFAULT_ZXCODE_ENDPOINT_ORIGIN}/api/v1/client/configs?x=1`);
    await client.request("https://example.com/static/config.json");
    await client.request("https://feedback.example.invalid/api/v1/tickets");
    await client.request("https://api.z.ai/v1/models");

    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      "http://localhost:3030/api/v1/client/configs?x=1",
      "https://example.com/static/config.json",
      "https://feedback.example.invalid/api/v1/tickets",
      "https://api.z.ai/v1/models",
    ]);
  });

  it("只给当前 zcode endpoint 请求统一补来源 headers", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const client = createNodeApiClient({
      fetchImpl: fetchImpl as typeof fetch,
      resolveZCodeEndpointOrigin: async () => "https://api-endpoint.example.test",
    });

    await client.request(`${DEFAULT_ZXCODE_ENDPOINT_ORIGIN}/api/v1/client/configs`);
    await client.request("https://api.z.ai/v1/models");

    // fork 去平台化：来源头只剩归因三元组 + request-id，指纹头不再注入。
    const zcodeHeaders = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(zcodeHeaders.get("User-Agent")).toMatch(/^ZxCode\//);
    expect(zcodeHeaders.get("X-Title")).toBe(ZXCODE_SOURCE_HEADERS["X-Title"]);
    expect(zcodeHeaders.get("X-OpenRouter-Title")).toBeNull();
    expect(zcodeHeaders.get("X-OpenRouter-Categories")).toBeNull();
    expect(zcodeHeaders.get("HTTP-Referer")).toBe("https://api-endpoint.example.test");
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
      expect(zcodeHeaders.get(key)).toBeNull();
    expect(zcodeHeaders.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const externalHeaders = new Headers(fetchImpl.mock.calls[1]?.[1]?.headers);
    expect(externalHeaders.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(externalHeaders.get("User-Agent")).toBeNull();
  });

  it("保留调用方显式传入的 zcode endpoint headers", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const client = createNodeApiClient({
      fetchImpl: fetchImpl as typeof fetch,
      resolveZCodeEndpointOrigin: async () => "https://api-endpoint.example.test",
    });

    await client.request(`${DEFAULT_ZXCODE_ENDPOINT_ORIGIN}/api/v1/oauth/token`, {
      headers: {
        "User-Agent": "CustomAgent/1.0",
        "X-Title": "Custom Title",
        Authorization: "Bearer token",
      },
    });

    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.get("User-Agent")).toBe("CustomAgent/1.0");
    expect(headers.get("X-Title")).toBe("Custom Title");
    expect(headers.get("X-OpenRouter-Title")).toBeNull();
    expect(headers.get("X-OpenRouter-Categories")).toBeNull();
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("HTTP-Referer")).toBe("https://api-endpoint.example.test");
    expect(headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("统一来源 headers 只保留归因三元组并透传 appVersion", () => {
    expect(buildZCodeSourceHeaders({ appVersion: "2.14.0" })).toMatchObject({
      "User-Agent": "ZxCode/2.14.0",
      "X-Title": ZXCODE_SOURCE_HEADERS["X-Title"],
      "HTTP-Referer": DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
    });
    expect(buildZCodeSourceHeaders({ appVersion: "2.14.0", sourceTitle: "cli" })).toMatchObject({
      "X-Title": "ZxCode@cli",
    });
  });
});
