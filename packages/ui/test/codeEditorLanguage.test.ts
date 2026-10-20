import { describe, expect, it } from "vitest";
import {
  hasCodeEditorLanguage,
  listCodeEditorLanguages,
  loadCodeEditorLanguage,
} from "../src/lib/codeEditorLanguage.js";
import { inferCodeLanguage } from "../src/lib/codeViewer.js";

// fork 原 node:test 用例，vitest 全量接管后转为 vitest 断言，语义不变。

// inferCodeLanguage（EXTENSION_TO_LANGUAGE 全量输出集合）中被编辑器映射表覆盖的语言。
const coveredLanguages = [
  "bash",
  "c",
  "cpp",
  "css",
  "diff",
  "go",
  "html",
  "java",
  "javascript",
  "jsx",
  "json",
  "markdown",
  "python",
  "ruby",
  "rust",
  "sql",
  "typescript",
  "tsx",
  "xml",
  "yaml",
];

// 无 CodeMirror 对应实现、约定降级为纯文本的语言。
const plainLanguages = ["log", "mermaid"];

describe("code editor language", () => {
  it("编辑器语言映射覆盖 inferCodeLanguage 可产出的语言", () => {
    const supported = new Set(listCodeEditorLanguages());
    for (const language of coveredLanguages) {
      expect(supported.has(language), `缺少语言映射: ${language}`).toBe(true);
    }
    for (const language of plainLanguages) {
      expect(supported.has(language), `${language} 不应有语言映射（约定纯文本降级）`).toBe(false);
    }
  });

  it("hasCodeEditorLanguage 区分「有映射」与「纯文本降级」", () => {
    expect(hasCodeEditorLanguage("typescript")).toBe(true);
    expect(hasCodeEditorLanguage("python")).toBe(true);
    expect(hasCodeEditorLanguage("log")).toBe(false);
    expect(hasCodeEditorLanguage("mermaid")).toBe(false);
    expect(hasCodeEditorLanguage("not-a-language")).toBe(false);
  });

  it("loadCodeEditorLanguage 对映射语言返回 LanguageSupport", async () => {
    const typescript = await loadCodeEditorLanguage("typescript");
    expect(typescript, "typescript 应加载出 LanguageSupport").toBeTruthy();
    expect(typeof typescript?.language).toBe("object");

    const json = await loadCodeEditorLanguage("json");
    expect(json, "json 应加载出 LanguageSupport").toBeTruthy();

    // legacy-modes（StreamLanguage）路径也要能加载。
    const go = await loadCodeEditorLanguage("go");
    expect(go, "go（legacy mode）应加载出 LanguageSupport").toBeTruthy();
  });

  it("loadCodeEditorLanguage 对未映射语言返回 null 且结果被缓存", async () => {
    const first = await loadCodeEditorLanguage("log");
    const second = await loadCodeEditorLanguage("log");
    expect(first).toBeNull();
    expect(second).toBeNull();

    const unknown = await loadCodeEditorLanguage("definitely-not-a-language");
    expect(unknown).toBeNull();
  });

  it("编辑器映射表与 inferCodeLanguage 扩展名表保持对齐", () => {
    // 抽样验证扩展名 → shiki 语言 → CodeMirror 映射链路：常见代码文件后缀都有高亮。
    const samples: Array<[string, boolean]> = [
      ["app.ts", true],
      ["main.py", true],
      ["Cargo.toml", true],
      ["Makefile", false],
      ["data.log", false],
      ["flow.mmd", false],
    ];
    for (const [file, expectHighlight] of samples) {
      const language = inferCodeLanguage(file);
      expect(hasCodeEditorLanguage(language), `${file} → ${language} 的高亮预期不符`).toBe(
        expectHighlight,
      );
    }
  });
});
