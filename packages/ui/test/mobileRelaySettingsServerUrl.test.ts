// 手机远控设置地址归一：裸域名保存前补 https://，避免 zod .url() 校验失败弹"保存失败"。
import { describe, expect, it } from "vitest";
import { normalizeServerUrlDraft } from "@/settings/MobileRelaySettingsSection.js";

describe("normalizeServerUrlDraft", () => {
  it("裸域名补全 https:// 前缀", () => {
    expect(normalizeServerUrlDraft("relay.example.com")).toBe("https://relay.example.com");
    expect(normalizeServerUrlDraft("  relay.example.com/  ")).toBe("https://relay.example.com/");
  });

  it("已带 scheme 的地址原样保留（含尾部斜杠）", () => {
    expect(normalizeServerUrlDraft("https://relay.example.com")).toBe("https://relay.example.com");
    expect(normalizeServerUrlDraft("http://10.0.0.5:8787/")).toBe("http://10.0.0.5:8787/");
    expect(normalizeServerUrlDraft("wss://relay.example.com")).toBe("wss://relay.example.com");
  });

  it("空值保持空串（清空地址 = 删除配置）", () => {
    expect(normalizeServerUrlDraft("")).toBe("");
    expect(normalizeServerUrlDraft("   ")).toBe("");
  });
});
