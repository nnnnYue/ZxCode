"use client";

/**
 * 基于 CodeMirror 6 的代码编辑器（PreviewPane 文件编辑态）。
 *
 * 非受控设计：挂载时消费 initialValue 创建 EditorView，此后 doc 变更只经 onChange
 * 回调上报；外部不回写 doc（真源在 PreviewPane 的 draft），避免受控回写循环。
 * 语言 / shiki 高亮主题 / 外观设置 / 只读均经 Compartment 动态切换，编辑器实例跨
 * 这些 props 变化存活，不重建、不丢 undo 栈。
 */
import { memo, useEffect, useMemo, useRef } from "react";
import type { HTMLAttributes } from "react";
import type { BundledTheme } from "shiki";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import {
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import {
  codeEditorBaseTheme,
  resolveCodeEditorHighlightStyle,
} from "@/lib/codeEditorTheme.js";
import { hasCodeEditorLanguage, loadCodeEditorLanguage } from "@/lib/codeEditorLanguage.js";
import type { CodePreviewSettings } from "@/lib/codePreviewSettings.js";
import { DEFAULT_CODE_PREVIEW_SETTINGS } from "@/lib/codePreviewSettings.js";
import { cn } from "@/components/lib/utils.js";

const languageCompartment = new Compartment();
const syntaxThemeCompartment = new Compartment();
const chromeThemeCompartment = new Compartment();
const wrapCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();

export interface CodeEditorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 编辑器初始内容（真源在外部 draft，本组件非受控，仅挂载时消费）。 */
  initialValue: string;
  /** doc 变更回调（含 undo/redo、粘贴、输入法）。 */
  onChange?: (value: string) => void;
  /** Cmd/Ctrl+S 快捷键回调；命中后由组件吞掉事件，是否允许保存由调用方门控。 */
  onSaveShortcut?: () => void;
  /** 只读（保存中）：禁用输入但保留选区与滚动。 */
  readOnly?: boolean;
  /** 语言 id（inferCodeLanguage 产物）；未映射语言降级为无高亮纯文本。 */
  language?: string;
  /** 代码预览 shiki 主题（light/dark 已由调用方按当前应用主题解析）。 */
  codeTheme?: BundledTheme;
  /** 代码预览设置：行号 / 换行 / 字号与只读视图共用。 */
  settings?: CodePreviewSettings;
  className?: string;
}

/** 手机窄屏下聚焦输入字号 < 16px 会触发 iOS Safari 缩放（对齐 --text-mobile-input-safe 惯例）。 */
function resolveEffectiveFontSize(fontSizePx: number): number {
  if (typeof window === "undefined" || !window.matchMedia) {
    return fontSizePx;
  }

  return window.matchMedia("(max-width: 767px)").matches
    ? Math.max(fontSizePx, 16)
    : fontSizePx;
}

export const CodeEditor = memo(function CodeEditor({
  initialValue,
  onChange,
  onSaveShortcut,
  readOnly = false,
  language,
  codeTheme,
  settings = DEFAULT_CODE_PREVIEW_SETTINGS,
  className,
  ...divProps
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveShortcutRef = useRef(onSaveShortcut);
  onChangeRef.current = onChange;
  onSaveShortcutRef.current = onSaveShortcut;

  const effectiveFontSize = useMemo(
    () => resolveEffectiveFontSize(settings.fontSizePx),
    [settings.fontSizePx],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          // 命中保存快捷键后吞掉事件，避免触发浏览器保存行为；门控由调用方负责。
          Prec.highest(
            keymap.of([
              {
                key: "Mod-s",
                run: () => {
                  onSaveShortcutRef.current?.();
                  return true;
                },
              },
            ]),
          ),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          lineNumbersCompartment.of(settings.showLineNumbers ? lineNumbers() : []),
          foldGutter(),
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          highlightSelectionMatches(),
          search({ top: true }),
          indentOnInput(),
          indentUnit.of("  "),
          bracketMatching(),
          closeBrackets(),
          languageCompartment.of([]),
          syntaxThemeCompartment.of([]),
          chromeThemeCompartment.of(codeEditorBaseTheme(effectiveFontSize)),
          wrapCompartment.of(settings.wrapLongLines ? EditorView.lineWrapping : []),
          readOnlyCompartment.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          EditorView.contentAttributes.of({
            spellcheck: "false",
            "data-gramm": "false",
            ...(divProps["aria-label"] ? { "aria-label": divProps["aria-label"] } : {}),
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: host,
    });

    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
    // initialValue 只在挂载时消费；后续 props 变化全部走下方 compartment effect。
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lineNumbersCompartment.reconfigure(
        settings.showLineNumbers ? lineNumbers() : [],
      ),
    });
  }, [settings.showLineNumbers]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(
        settings.wrapLongLines ? EditorView.lineWrapping : [],
      ),
    });
  }, [settings.wrapLongLines]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: chromeThemeCompartment.reconfigure(
        codeEditorBaseTheme(effectiveFontSize),
      ),
    });
  }, [effectiveFontSize]);

  useEffect(() => {
    let cancelled = false;
    const view = viewRef.current;
    if (!view) {
      return;
    }

    if (!language || !hasCodeEditorLanguage(language)) {
      view.dispatch({ effects: languageCompartment.reconfigure([]) });
      return;
    }

    void loadCodeEditorLanguage(language).then((support) => {
      if (!cancelled && viewRef.current === view) {
        view.dispatch({
          effects: languageCompartment.reconfigure(support ? [support] : []),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    const view = viewRef.current;
    if (!view) {
      return;
    }

    if (!codeTheme) {
      view.dispatch({ effects: syntaxThemeCompartment.reconfigure([]) });
      return;
    }

    void resolveCodeEditorHighlightStyle(codeTheme).then((style) => {
      if (!cancelled && viewRef.current === view) {
        view.dispatch({
          effects: syntaxThemeCompartment.reconfigure(
            style ? [syntaxHighlighting(style)] : [],
          ),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [codeTheme]);

  return (
    <div
      {...divProps}
      ref={hostRef}
      className={cn("h-full min-h-0 w-full overflow-hidden", className)}
    />
  );
});
CodeEditor.displayName = "CodeEditor";
