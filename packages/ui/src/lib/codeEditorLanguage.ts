/**
 * 编辑器语言加载：把 `inferCodeLanguage`（shiki BundledLanguage）映射到
 * CodeMirror 6 语言包。语言包按需动态 import，全部留在编辑器懒加载 chunk 里，
 * 未映射语言返回 null（纯文本编辑：缩进、搜索、undo 仍可用）。
 */
import { LanguageSupport, StreamLanguage } from "@codemirror/language";
import { logger } from "@/logger.js";

type LanguageSupportLoader = () => Promise<LanguageSupport | null>;

const legacyModeLoaders: Record<string, LanguageSupportLoader> = {
  bash: async () =>
    new LanguageSupport(
      StreamLanguage.define(
        await import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell),
      ),
    ),
  diff: async () =>
    new LanguageSupport(
      StreamLanguage.define(await import("@codemirror/legacy-modes/mode/diff").then((m) => m.diff)),
    ),
  go: async () =>
    new LanguageSupport(
      StreamLanguage.define(await import("@codemirror/legacy-modes/mode/go").then((m) => m.go)),
    ),
  ruby: async () =>
    new LanguageSupport(
      StreamLanguage.define(await import("@codemirror/legacy-modes/mode/ruby").then((m) => m.ruby)),
    ),
  toml: async () =>
    new LanguageSupport(
      StreamLanguage.define(await import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml)),
    ),
};

const languageLoaders: Record<string, LanguageSupportLoader> = {
  ...legacyModeLoaders,
  c: async () => (await import("@codemirror/lang-cpp")).cpp(),
  cpp: async () => (await import("@codemirror/lang-cpp")).cpp(),
  css: async () => (await import("@codemirror/lang-css")).css(),
  html: async () => (await import("@codemirror/lang-html")).html(),
  java: async () => (await import("@codemirror/lang-java")).java(),
  javascript: async () => (await import("@codemirror/lang-javascript")).javascript(),
  jsx: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  json: async () => (await import("@codemirror/lang-json")).json(),
  markdown: async () => (await import("@codemirror/lang-markdown")).markdown(),
  python: async () => (await import("@codemirror/lang-python")).python(),
  rust: async () => (await import("@codemirror/lang-rust")).rust(),
  sql: async () => (await import("@codemirror/lang-sql")).sql(),
  typescript: async () =>
    (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
  tsx: async () =>
    (await import("@codemirror/lang-javascript")).javascript({
      typescript: true,
      jsx: true,
    }),
  xml: async () => (await import("@codemirror/lang-xml")).xml(),
  yaml: async () => (await import("@codemirror/lang-yaml")).yaml(),
};

const loadedLanguages = new Map<string, LanguageSupport | null>();

/** 语言是否有对应的 CodeMirror 实现（用于区分「加载中」与「无高亮降级」）。 */
export function hasCodeEditorLanguage(language: string): boolean {
  return language in languageLoaders;
}

/**
 * 加载语言对应的 CodeMirror LanguageSupport；未映射或加载失败返回 null。
 * 结果按语言缓存，重复调用不会重复构造。
 */
export async function loadCodeEditorLanguage(language: string): Promise<LanguageSupport | null> {
  const cached = loadedLanguages.get(language);
  if (cached !== undefined) {
    return cached;
  }

  const loader = languageLoaders[language];
  if (!loader) {
    loadedLanguages.set(language, null);
    return null;
  }

  try {
    const support = await loader();
    loadedLanguages.set(language, support);
    return support;
  } catch (error) {
    // 语言包加载失败（网络/分包异常）不应阻塞编辑，降级为纯文本。
    logger.warn("[codeEditor] 语言包加载失败，降级为纯文本编辑", { language, error });
    loadedLanguages.set(language, null);
    return null;
  }
}

/** 当前映射表覆盖的 shiki 语言 id 集合（测试与调试用）。 */
export function listCodeEditorLanguages(): string[] {
  return Object.keys(languageLoaders);
}
