import assert from "node:assert/strict";
import test from "node:test";
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

test("版权行：zh-CN 显示「版权所有 © {年} ZCode。」", () => {
  assert.equal(formatAboutCopyright(2026, "zh-CN"), "版权所有 © 2026 ZCode。");
});

test("版权行：en-US 显示「Copyright © {year} ZCode.」", () => {
  assert.equal(formatAboutCopyright(2026, "en-US"), "Copyright © 2026 ZCode.");
});

test("版权行：年份缺省取当前年", () => {
  const currentYear = new Date().getFullYear();
  assert.equal(formatAboutCopyright(undefined, "zh-CN"), `版权所有 © ${currentYear} ZCode。`);
});

test("About 模板：版权行始终渲染在 .meta 区域", () => {
  const html = buildAboutHtml();
  assert.ok(html.includes("<div>版权所有 © 2026 ZCode。</div>"));
});

test("About 模板：版权行做 HTML 转义", () => {
  const html = buildAboutHtml({ copyright: 'Copyright © 2026 <ZCode> & "Co".' });
  assert.ok(html.includes("Copyright © 2026 &lt;ZCode&gt; &amp; &quot;Co&quot;."));
  assert.ok(!html.includes("<ZCode>"));
});

test("About 模板：优化行缺省时不渲染空占位行", () => {
  const html = buildAboutHtml();
  assert.ok(!html.includes("<div></div>"));
  assert.ok(!html.includes("已针对 Apple Silicon 优化。"));
});

test("About 模板：优化行与版权行按序共存", () => {
  const html = buildAboutHtml({ optimizationLine: "已针对 Apple Silicon 优化。" });
  const optimizationIndex = html.indexOf("已针对 Apple Silicon 优化。");
  const copyrightIndex = html.indexOf("版权所有 © 2026 ZCode。");
  assert.ok(optimizationIndex > -1, "应渲染优化行");
  assert.ok(copyrightIndex > optimizationIndex, "版权行应位于优化行之后");
});
