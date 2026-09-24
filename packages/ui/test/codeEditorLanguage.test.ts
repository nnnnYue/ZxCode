import assert from "node:assert/strict";
import test from "node:test";
import {
  hasCodeEditorLanguage,
  listCodeEditorLanguages,
  loadCodeEditorLanguage,
} from "../src/lib/codeEditorLanguage.js";
import { inferCodeLanguage } from "../src/lib/codeViewer.js";

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

test("编辑器语言映射覆盖 inferCodeLanguage 可产出的语言", () => {
  const supported = new Set(listCodeEditorLanguages());
  for (const language of coveredLanguages) {
    assert.ok(supported.has(language), `缺少语言映射: ${language}`);
  }
  for (const language of plainLanguages) {
    assert.ok(!supported.has(language), `${language} 不应有语言映射（约定纯文本降级）`);
  }
});

test("hasCodeEditorLanguage 区分「有映射」与「纯文本降级」", () => {
  assert.equal(hasCodeEditorLanguage("typescript"), true);
  assert.equal(hasCodeEditorLanguage("python"), true);
  assert.equal(hasCodeEditorLanguage("log"), false);
  assert.equal(hasCodeEditorLanguage("mermaid"), false);
  assert.equal(hasCodeEditorLanguage("not-a-language"), false);
});

test("loadCodeEditorLanguage 对映射语言返回 LanguageSupport", async () => {
  const typescript = await loadCodeEditorLanguage("typescript");
  assert.ok(typescript, "typescript 应加载出 LanguageSupport");
  assert.ok(typeof typescript.language === "object");

  const json = await loadCodeEditorLanguage("json");
  assert.ok(json, "json 应加载出 LanguageSupport");

  // legacy-modes（StreamLanguage）路径也要能加载。
  const go = await loadCodeEditorLanguage("go");
  assert.ok(go, "go（legacy mode）应加载出 LanguageSupport");
});

test("loadCodeEditorLanguage 对未映射语言返回 null 且结果被缓存", async () => {
  const first = await loadCodeEditorLanguage("log");
  const second = await loadCodeEditorLanguage("log");
  assert.equal(first, null);
  assert.equal(second, null);

  const unknown = await loadCodeEditorLanguage("definitely-not-a-language");
  assert.equal(unknown, null);
});

test("编辑器映射表与 inferCodeLanguage 扩展名表保持对齐", () => {
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
    assert.equal(
      hasCodeEditorLanguage(language),
      expectHighlight,
      `${file} → ${language} 的高亮预期不符`,
    );
  }
});
