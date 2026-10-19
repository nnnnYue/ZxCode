import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RootStartupLoading, ZCodeStartupLogoBadge } from "@/root/RootStartupLoading.js";

describe("RootStartupLoading", () => {
  it("引导使用静态品牌图标时保留外观但不渲染呼吸动画", () => {
    const html = renderToStaticMarkup(createElement(ZCodeStartupLogoBadge, { animated: false }));
    // fork 品牌图标为静态 PNG（zcode-logo.png），静态徽章不带动画 class。
    expect(html).toContain("zcode-logo.png");
    expect(html).toContain("linear-gradient");
    expect(html).not.toContain("root-startup-logo-animated");
  });
  it("启动阻塞态使用整体呼吸的品牌图标而不是可见 loading 文案", () => {
    const html = renderToStaticMarkup(createElement(RootStartupLoading, { label: "加载中..." }));

    expect(html).toContain('data-testid="root-startup-loading"');
    expect(html).toContain('aria-label="加载中..."');
    expect(html).toContain("zcode-logo.png");
    expect(html).toContain("root-startup-logo-animated");
    expect(html).toContain("bg-background");
    expect(html).not.toContain(">加载中...<");
  });
});
