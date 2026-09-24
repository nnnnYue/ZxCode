import { Suspense, lazy } from "react";
import type { CodeEditorProps } from "@/components/ui/code-editor.js";

// CodeMirror 与语言包体积较大且只有点「编辑」才会用到：懒加载让它们只进入首次编辑
// 后的 chunk，不拖慢会话首屏（同 pdf-viewer 的懒加载模式）。
const CodeEditor = lazy(() =>
  import("@/components/ui/code-editor.js").then((module) => ({
    default: module.CodeEditor,
  })),
);

interface PreviewPaneFileEditContentProps extends CodeEditorProps {
  /** 编辑器 chunk 加载中的占位文案。 */
  loadingLabel: string;
}

export function PreviewPaneFileEditContent({
  loadingLabel,
  ...editorProps
}: PreviewPaneFileEditContentProps) {
  return (
    <Suspense
      fallback={<div className="p-3 text-ui-base text-foreground-subtle">{loadingLabel}</div>}
    >
      <CodeEditor {...editorProps} />
    </Suspense>
  );
}
