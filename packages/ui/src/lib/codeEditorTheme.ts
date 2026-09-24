/**
 * 编辑器主题：把代码预览的 shiki 主题（codePreviewSettings）转换为 CodeMirror 高亮样式，
 * 并用应用 CSS 语义色构建编辑器外观（背景/光标/选区/行号栏），保证编辑态与只读态观感一致，
 * 且自动跟随 light / dark / zai-light / zai-dark 主题切换。
 *
 * shiki 主题数据经 normalizeTheme 解析（含 include 链）；TextMate scope 采用「tag 的
 * 代表 scope ← 最佳匹配主题规则」的单规则取胜语义映射到 @lezer/highlight tags（见
 * buildHighlightStyleSpecs）。
 */
import type { BundledTheme } from "shiki";
import { bundledThemes, normalizeTheme } from "shiki";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import type { Tag } from "@lezer/highlight";
import { tags as t } from "@lezer/highlight";
import { logger } from "@/logger.js";

interface ThemeTokenRule {
  scope?: string | string[];
  settings?: { foreground?: string; fontStyle?: string | number };
}

export interface HighlightStyleSpec {
  tag: Tag;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
}

/**
 * TextMate scope 前缀 → @lezer/highlight tags。
 * key 作为 theme 规则 scope 的段前缀匹配（key === scope 或 scope 以 "key." 开头）。
 */
const SCOPE_TO_TAGS: ReadonlyArray<readonly [string, readonly Tag[]]> = [
  ["comment", [t.comment]],
  ["string.regexp", [t.regexp]],
  ["string.escape", [t.escape]],
  ["string", [t.string]],
  ["constant.character.escape", [t.escape]],
  ["constant.numeric", [t.number]],
  ["constant.language", [t.atom]],
  ["constant.other.symbol", [t.atom]],
  ["constant", [t.constant(t.variableName)]],
  ["keyword.operator", [t.operator]],
  ["keyword.control", [t.controlKeyword]],
  ["keyword.other.unit", [t.unit]],
  ["keyword", [t.keyword]],
  ["storage.modifier", [t.modifier]],
  ["storage.type", [t.definitionKeyword]],
  ["storage", [t.definitionKeyword]],
  ["entity.name.function", [t.function(t.variableName)]],
  ["entity.name.method", [t.function(t.variableName)]],
  ["entity.name.tag", [t.tagName]],
  ["entity.name.type.namespace", [t.namespace]],
  ["entity.name.type.class", [t.className, t.typeName]],
  ["entity.name.type", [t.typeName]],
  ["entity.name.section", [t.heading]],
  ["entity.name", [t.variableName]],
  ["entity.other.attribute-name", [t.attributeName]],
  ["entity.other.inherited-class", [t.typeName]],
  ["entity", [t.variableName]],
  ["variable.language", [t.special(t.variableName)]],
  ["variable.other.constant", [t.constant(t.variableName)]],
  ["variable.other.property", [t.propertyName]],
  ["variable", [t.variableName]],
  ["support.function", [t.standard(t.function(t.variableName))]],
  ["support.class", [t.standard(t.typeName)]],
  ["support.type", [t.standard(t.typeName)]],
  ["support.constant", [t.constant(t.variableName)]],
  ["support", [t.standard(t.name)]],
  ["markup.heading", [t.heading]],
  ["markup.bold", [t.strong]],
  ["markup.italic", [t.emphasis]],
  ["markup.underline.link", [t.link]],
  ["markup.inserted", [t.inserted]],
  ["markup.deleted", [t.deleted]],
  ["invalid", [t.invalid]],
];

/** TextMate fontStyle：字符串（"italic bold"）或位掩码（1 italic / 2 bold / 4 underline）。 */
function parseFontStyle(fontStyle: string | number | undefined): {
  italic: boolean;
  bold: boolean;
  underline: boolean;
} {
  if (typeof fontStyle === "number") {
    return {
      italic: (fontStyle & 1) !== 0,
      bold: (fontStyle & 2) !== 0,
      underline: (fontStyle & 4) !== 0,
    };
  }

  const text = fontStyle ?? "";
  return {
    italic: text.includes("italic"),
    bold: text.includes("bold"),
    underline: text.includes("underline"),
  };
}

/**
 * 纯函数：把 normalizeTheme 产物（settings 规则表）转换为 HighlightStyle spec 列表。
 *
 * 匹配方向是「tag 的代表 scope ← 最佳匹配主题规则」：对每个映射项，取规则 scope 是其
 * 前缀（key === scope 或 key 以 "scope." 开头）中 scope 最长的规则，同长度取靠后规则
 * （与 TextMate/shiki 的单规则取胜语义一致）。这样 "entity.name.function" 规则只会
 * 影响函数名 tag，不会经泛化前缀把纯变量名一并染色。
 *
 * 导出供单元测试直接构造规则验证映射，不经 shiki 动态主题加载。
 */
export function buildHighlightStyleSpecs(rules: readonly ThemeTokenRule[]): HighlightStyleSpec[] {
  const parsedRules = rules
    .map((rule, order) => ({
      order,
      scopes: (Array.isArray(rule.scope) ? rule.scope : [rule.scope]).filter(
        (scope): scope is string => Boolean(scope),
      ),
      foreground: rule.settings?.foreground,
      font: parseFontStyle(rule.settings?.fontStyle),
    }))
    .filter((rule) => rule.foreground || rule.font.italic || rule.font.bold || rule.font.underline);

  const specs: HighlightStyleSpec[] = [];
  for (const [key, tags] of SCOPE_TO_TAGS) {
    let best: ((typeof parsedRules)[number] & { specificity: number }) | null = null;
    for (const rule of parsedRules) {
      for (const scope of rule.scopes) {
        if (key !== scope && !key.startsWith(`${scope}.`)) {
          continue;
        }

        if (!best || best.specificity <= scope.length) {
          best = { ...rule, specificity: scope.length };
        }
      }
    }

    if (!best) {
      continue;
    }

    for (const tag of tags) {
      specs.push({
        tag,
        ...(best.foreground ? { color: best.foreground } : {}),
        ...(best.font.bold ? { fontWeight: "700" } : {}),
        ...(best.font.italic ? { fontStyle: "italic" } : {}),
        ...(best.font.underline ? { textDecoration: "underline" } : {}),
      });
    }
  }

  return specs;
}

const highlightStyleCache = new Map<string, Promise<HighlightStyle | null>>();

/**
 * 解析代码预览 shiki 主题对应的 CodeMirror HighlightStyle；失败返回 null（仅无 token 配色）。
 * 结果按主题名缓存（含失败），主题设置切换时由调用方传入新主题名触发新解析。
 */
export function resolveCodeEditorHighlightStyle(codeTheme: BundledTheme): Promise<HighlightStyle | null> {
  const cached = highlightStyleCache.get(codeTheme);
  if (cached) {
    return cached;
  }

  const loading = (async () => {
    // shiki v4 的 bundledThemes loader 直接返回动态 import 的 module namespace，
    // 主题在 .default 上；做运行时解包兼容未来直接返回主题注册的形态。
    const themeModule: unknown = await bundledThemes[codeTheme]();
    const registration =
      (themeModule as { default?: unknown }).default ?? themeModule;
    const normalized = normalizeTheme(registration as Parameters<typeof normalizeTheme>[0]);
    const specs = buildHighlightStyleSpecs(normalized.settings ?? []);
    return HighlightStyle.define(specs);
  })();

  const guarded = loading.catch((error) => {
    logger.warn("[codeEditor] shiki 主题转换失败，编辑态仅保留基础配色", { codeTheme, error });
    return null;
  });

  highlightStyleCache.set(codeTheme, guarded);
  return guarded;
}

/**
 * 编辑器外观（非 token 色）：全部使用应用 CSS 语义色，主题切换零成本跟随；
 * token 配色由 resolveCodeEditorHighlightStyle 单独叠加。
 */
export function codeEditorBaseTheme(fontSizePx: number): Extension {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--color-background)",
      color: "var(--color-foreground)",
      fontSize: `${fontSizePx}px`,
      lineHeight: "1.55",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: "var(--color-foreground)",
      fontFamily: "var(--font-mono)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-foreground)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "color-mix(in srgb, var(--color-foreground) 16%, transparent)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--color-foreground) 5%, transparent)",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--color-foreground-subtlest)",
      border: "none",
      borderRight: "1px solid var(--color-border)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "color-mix(in srgb, var(--color-foreground) 5%, transparent)",
      color: "var(--color-foreground-subtle)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--color-hover)",
      borderColor: "var(--color-border)",
      color: "var(--color-foreground-subtle)",
    },
    ".cm-selectionMatch": {
      backgroundColor: "color-mix(in srgb, var(--color-foreground) 10%, transparent)",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--color-find-highlight)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "var(--color-find-highlight-active)",
    },
  });
}
