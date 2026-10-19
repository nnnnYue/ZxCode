import { describe, expect, it } from "vitest";
import {
  buildHighlightStyleSpecs,
  resolveCodeEditorHighlightStyle,
} from "../src/lib/codeEditorTheme.js";
import { tags as t } from "@lezer/highlight";

// fork 原 node:test 用例，vitest 全量接管后转为 vitest 断言，语义不变。

function findSpec(specs: ReturnType<typeof buildHighlightStyleSpecs>, tag: unknown) {
  return specs.find((spec) => spec.tag === tag);
}

describe("code editor theme", () => {
  it("scope 前缀映射：comment/keyword/string 取到对应颜色", () => {
    const specs = buildHighlightStyleSpecs([
      { scope: "comment", settings: { foreground: "#6a737d" } },
      { scope: ["keyword", "keyword.operator"], settings: { foreground: "#f97583" } },
      { scope: "string", settings: { foreground: "#9ecbff" } },
    ]);

    expect(findSpec(specs, t.comment)?.color).toBe("#6a737d");
    expect(findSpec(specs, t.keyword)?.color).toBe("#f97583");
    expect(findSpec(specs, t.string)?.color).toBe("#9ecbff");
    // 同一条规则的多 scope 数组各自命中对应映射项。
    expect(findSpec(specs, t.operator)?.color).toBe("#f97583");
  });

  it("更具体的 scope 规则只影响对应 tag，且在同类映射中取胜", () => {
    const specs = buildHighlightStyleSpecs([
      { scope: "string", settings: { foreground: "#9ecbff" } },
      { scope: "string.regexp", settings: { foreground: "#ffab70" } },
      { scope: "entity.name", settings: { foreground: "#b392f0" } },
      { scope: "entity.name.function", settings: { foreground: "#d19a66" } },
    ]);

    // string.regexp 只覆盖正则 tag，不影响普通字符串。
    expect(findSpec(specs, t.regexp)?.color).toBe("#ffab70");
    expect(findSpec(specs, t.string)?.color).toBe("#9ecbff");
    // 函数名取更具体的 entity.name.function 规则。
    expect(findSpec(specs, t.function(t.variableName))?.color).toBe("#d19a66");
    // 纯变量名不被 entity.name.function 规则污染。
    expect(findSpec(specs, t.variableName)?.color).toBe("#b392f0");
  });

  it("同 specificity 时靠后的规则覆盖靠前的（TextMate 平级语义）", () => {
    const specs = buildHighlightStyleSpecs([
      { scope: "string", settings: { foreground: "#111111" } },
      { scope: "string", settings: { foreground: "#222222" } },
    ]);

    expect(findSpec(specs, t.string)?.color).toBe("#222222");
  });

  it("fontStyle 支持字符串与位掩码两种形态", () => {
    const stringSpecs = buildHighlightStyleSpecs([
      { scope: "invalid", settings: { foreground: "#fdaeb7", fontStyle: "italic bold" } },
    ]);
    expect(findSpec(stringSpecs, t.invalid)?.fontStyle).toBe("italic");
    expect(findSpec(stringSpecs, t.invalid)?.fontWeight).toBe("700");

    // TextMate 位掩码：1 = italic, 2 = bold, 4 = underline。
    const maskSpecs = buildHighlightStyleSpecs([
      { scope: "invalid", settings: { foreground: "#fdaeb7", fontStyle: 3 } },
      { scope: "support", settings: { fontStyle: 4 } },
    ]);
    expect(findSpec(maskSpecs, t.invalid)?.fontStyle).toBe("italic");
    expect(findSpec(maskSpecs, t.invalid)?.fontWeight).toBe("700");
    expect(findSpec(maskSpecs, t.standard(t.name))?.textDecoration).toBe("underline");
  });

  it("无颜色且无字体样式的规则被跳过", () => {
    const specs = buildHighlightStyleSpecs([
      { scope: "source" },
      { scope: "meta.brace", settings: {} },
    ]);
    expect(specs).toEqual([]);
  });

  it("真实 shiki 主题（github-dark/light）可解析出非空 HighlightStyle", async () => {
    const dark = await resolveCodeEditorHighlightStyle("github-dark");
    expect(dark, "github-dark 应解析出 HighlightStyle").toBeTruthy();
    const light = await resolveCodeEditorHighlightStyle("github-light");
    expect(light, "github-light 应解析出 HighlightStyle").toBeTruthy();

    // 同主题重复解析命中缓存（同一实例）。
    const darkAgain = await resolveCodeEditorHighlightStyle("github-dark");
    expect(dark).toBe(darkAgain);
  });

  it("未知主题名降级为 null 而不是抛错", async () => {
    const invalid = await resolveCodeEditorHighlightStyle(
      "not-a-real-theme" as Parameters<typeof resolveCodeEditorHighlightStyle>[0],
    );
    expect(invalid).toBeNull();
  });
});
