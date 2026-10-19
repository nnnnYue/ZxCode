import { describe, expect, it } from "vitest";
import { DEFAULT_ZXCODE_ENDPOINT_ORIGIN } from "@zcode/shared";
import { createProviderEndpointRoutingSourceHeaders } from "../src/provider-endpoint-routing-source-headers.js";

describe("createProviderEndpointRoutingSourceHeaders", () => {
  it("builds attribution headers from the runtime endpoint origin", async () => {
    const headers = await createProviderEndpointRoutingSourceHeaders({
      appVersion: "1.2.3",
      env: { ZXCODE_BASE_URL: "https://routing-config.example.test" },
      sourceTitle: "electron",
    });

    // fork 移除了平台指纹头，来源头只剩归因三元组。
    expect(headers).toEqual({
      "HTTP-Referer": "https://routing-config.example.test",
      "User-Agent": "ZxCode/1.2.3",
      "X-Title": "ZxCode@electron",
    });
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("defaults to CLI attribution without inventing a device identity", async () => {
    const headers = await createProviderEndpointRoutingSourceHeaders({
      env: { ZXCODE_APP_VERSION: "2.0.0" },
    });

    expect(headers).toEqual({
      "HTTP-Referer": DEFAULT_ZXCODE_ENDPOINT_ORIGIN,
      "User-Agent": "ZxCode/2.0.0",
      "X-Title": "ZxCode@cli",
    });
    expect(headers).not.toHaveProperty("X-Device-Mid");
  });
});
