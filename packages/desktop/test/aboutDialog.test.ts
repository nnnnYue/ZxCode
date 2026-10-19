// fork 保留的 About 弹窗：版权行维持「ZCode。」文案（见 REMOVALS 约定）。
// 修复原因：原文件使用 node:test 风格，vitest 收集时报 "No test suite found"；
// 改写为 vitest 断言，用例语义不变。
import { expect, it } from "vitest";
import { formatAboutCopyright } from "../src/main/about.js";
import { createCustomAboutDialogHtml } from "../src/main/aboutWindow.js";

function buildAboutHtml(
  overrides: Partial<Parameters<typeof createCustomAboutDialogHtml>[0]> = {},
): string {
  return createCustomAboutDialogHtml({
    applicationName: "ZxCode Desktop App",
    appVersion: "1.2.3",
    copyright: "版权所有 © 2026 ZCode。",
    optimizationLine: "",
    versionLabel: "版本",
    okButtonLabel: "确定",
    ...overrides,
  });
}

it("版权行：zh-CN 显示「版权所有 © {年} ZCode。」", () => {
  expect(formatAboutCopyright(2026, "zh-CN")).toBe("版权所有 © 2026 ZCode。");
});

it("版权行：en-US 显示「Copyright © {year} ZCode.」", () => {
  expect(formatAboutCopyright(2026, "en-US")).toBe("Copyright © 2026 ZCode.");
});

it("版权行：年份缺省取当前年", () => {
  const currentYear = new Date().getFullYear();
  expect(formatAboutCopyright(undefined, "zh-CN")).toBe(`版权所有 © ${currentYear} ZCode。`);
});

it("About 模板：版权行始终渲染在 .meta 区域", () => {
  const html = buildAboutHtml();
  expect(html).toContain("<div>版权所有 © 2026 ZCode。</div>");
});

it("About 模板：版权行做 HTML 转义", () => {
  const html = buildAboutHtml({ copyright: 'Copyright © 2026 <ZCode> & "Co".' });
  expect(html).toContain("Copyright © 2026 &lt;ZCode&gt; &amp; &quot;Co&quot;.");
  expect(html).not.toContain("<ZCode>");
});

it("About 模板：优化行缺省时不渲染空占位行", () => {
  const html = buildAboutHtml();
  expect(html).not.toContain("<div></div>");
  expect(html).not.toContain("已针对 Apple Silicon 优化。");
});

it("About 模板：优化行与版权行按序共存", () => {
  const html = buildAboutHtml({ optimizationLine: "已针对 Apple Silicon 优化。" });
  const optimizationIndex = html.indexOf("已针对 Apple Silicon 优化。");
  const copyrightIndex = html.indexOf("版权所有 © 2026 ZCode。");
  expect(optimizationIndex).toBeGreaterThan(-1);
  expect(copyrightIndex).toBeGreaterThan(optimizationIndex);
});
