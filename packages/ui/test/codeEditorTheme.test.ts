import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHighlightStyleSpecs,
  resolveCodeEditorHighlightStyle,
} from "../src/lib/codeEditorTheme.js";
import { tags as t } from "@lezer/highlight";

function findSpec(specs: ReturnType<typeof buildHighlightStyleSpecs>, tag: unknown) {
  return specs.find((spec) => spec.tag === tag);
}

test("scope 前缀映射：comment/keyword/string 取到对应颜色", () => {
  const specs = buildHighlightStyleSpecs([
    { scope: "comment", settings: { foreground: "#6a737d" } },
    { scope: ["keyword", "keyword.operator"], settings: { foreground: "#f97583" } },
    { scope: "string", settings: { foreground: "#9ecbff" } },
  ]);

  assert.equal(findSpec(specs, t.comment)?.color, "#6a737d");
  assert.equal(findSpec(specs, t.keyword)?.color, "#f97583");
  assert.equal(findSpec(specs, t.string)?.color, "#9ecbff");
  // 同一条规则的多 scope 数组各自命中对应映射项。
  assert.equal(findSpec(specs, t.operator)?.color, "#f97583");
});

test("更具体的 scope 规则只影响对应 tag，且在同类映射中取胜", () => {
  const specs = buildHighlightStyleSpecs([
    { scope: "string", settings: { foreground: "#9ecbff" } },
    { scope: "string.regexp", settings: { foreground: "#ffab70" } },
    { scope: "entity.name", settings: { foreground: "#b392f0" } },
    { scope: "entity.name.function", settings: { foreground: "#d19a66" } },
  ]);

  // string.regexp 只覆盖正则 tag，不影响普通字符串。
  assert.equal(findSpec(specs, t.regexp)?.color, "#ffab70");
  assert.equal(findSpec(specs, t.string)?.color, "#9ecbff");
  // 函数名取更具体的 entity.name.function 规则。
  assert.equal(findSpec(specs, t.function(t.variableName))?.color, "#d19a66");
  // 纯变量名不被 entity.name.function 规则污染。
  assert.equal(findSpec(specs, t.variableName)?.color, "#b392f0");
});

test("同 specificity 时靠后的规则覆盖靠前的（TextMate 平级语义）", () => {
  const specs = buildHighlightStyleSpecs([
    { scope: "string", settings: { foreground: "#111111" } },
    { scope: "string", settings: { foreground: "#222222" } },
  ]);

  assert.equal(findSpec(specs, t.string)?.color, "#222222");
});

test("fontStyle 支持字符串与位掩码两种形态", () => {
  const stringSpecs = buildHighlightStyleSpecs([
    { scope: "invalid", settings: { foreground: "#fdaeb7", fontStyle: "italic bold" } },
  ]);
  assert.equal(findSpec(stringSpecs, t.invalid)?.fontStyle, "italic");
  assert.equal(findSpec(stringSpecs, t.invalid)?.fontWeight, "700");

  // TextMate 位掩码：1 = italic, 2 = bold, 4 = underline。
  const maskSpecs = buildHighlightStyleSpecs([
    { scope: "invalid", settings: { foreground: "#fdaeb7", fontStyle: 3 } },
    { scope: "support", settings: { fontStyle: 4 } },
  ]);
  assert.equal(findSpec(maskSpecs, t.invalid)?.fontStyle, "italic");
  assert.equal(findSpec(maskSpecs, t.invalid)?.fontWeight, "700");
  assert.equal(findSpec(maskSpecs, t.standard(t.name))?.textDecoration, "underline");
});

test("无颜色且无字体样式的规则被跳过", () => {
  const specs = buildHighlightStyleSpecs([
    { scope: "source" },
    { scope: "meta.brace", settings: {} },
  ]);
  assert.deepEqual(specs, []);
});

test("真实 shiki 主题（github-dark/light）可解析出非空 HighlightStyle", async () => {
  const dark = await resolveCodeEditorHighlightStyle("github-dark");
  assert.ok(dark, "github-dark 应解析出 HighlightStyle");
  const light = await resolveCodeEditorHighlightStyle("github-light");
  assert.ok(light, "github-light 应解析出 HighlightStyle");

  // 同主题重复解析命中缓存（同一实例）。
  const darkAgain = await resolveCodeEditorHighlightStyle("github-dark");
  assert.equal(dark, darkAgain);
});

test("未知主题名降级为 null 而不是抛错", async () => {
  const invalid = await resolveCodeEditorHighlightStyle(
    "not-a-real-theme" as Parameters<typeof resolveCodeEditorHighlightStyle>[0],
  );
  assert.equal(invalid, null);
});
