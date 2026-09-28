import {
  createOpenInEditorRemoteTarget,
  isCustomEditorInfo,
  type EditorInfo,
  type RemoteTarget,
} from "@zcode/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  clearLastSelectedEditorId,
  persistLastSelectedEditorId,
  readLastSelectedEditorId,
} from "@/lib/editorPreference.js";
import {
  resolveWorkspaceEditorSelection,
  shouldPersistWorkspaceEditorSelection,
} from "@/lib/workspaceEditorSelection.js";
import { useIsOfficeMode } from "@/hooks/useInterfaceMode.js";
import { isFileManagerOpenTarget } from "@/lib/openWithEditors.js";
import { logger } from "@/logger.js";

export function WorkspaceEditorButtonGroup({
  disabledReason,
  workspaceAbsPath,
  workspaceIdentity,
  remoteTarget,
  onSelectedEditorChange,
}: {
  disabledReason?: string;
  workspaceAbsPath: string;
  workspaceIdentity?: string;
  remoteTarget?: RemoteTarget;
  onSelectedEditorChange?: (editor: EditorInfo | null) => void;
}) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const isOfficeMode = useIsOfficeMode();

  const [installedEditors, setInstalledEditors] = useState<EditorInfo[]>([]);
  const [selectedEditorId, setSelectedEditorId] = useState<string | null>(() =>
    readLastSelectedEditorId(),
  );

  useEffect(() => {
    let disposed = false;

    platform
      .getInstalledEditors()
      .then((editors) => {
        if (disposed) {
          return;
        }

        setInstalledEditors(editors);
      })
      .catch((error) => {
        logger.warn("[WorkspaceEditorButtonGroup] 获取已安装 IDE 列表失败:", error);
      });

    return () => {
      disposed = true;
    };
  }, [platform]);

  const { availableEditors, selectedEditor } = useMemo(
    () =>
      resolveWorkspaceEditorSelection({
        installedEditors: isOfficeMode
          ? installedEditors.filter(isFileManagerOpenTarget)
          : installedEditors,
        selectedEditorId,
        remoteTarget,
      }),
    [installedEditors, isOfficeMode, remoteTarget, selectedEditorId],
  );

  // 自定义应用与内置白名单分开渲染：自定义行需要删除按钮和手动画勾
  //（RadioItem 右缘的绝对定位指示器会与删除按钮冲突）。
  const { builtinEditors, customEditors } = useMemo(() => {
    const builtin = availableEditors.filter((editor) => !isCustomEditorInfo(editor));
    const custom = availableEditors.filter(isCustomEditorInfo);
    return { builtinEditors: builtin, customEditors: custom };
  }, [availableEditors]);

  // 桌面端 preload 才提供选择/删除自定义应用；web 端隐藏入口。
  const canManageCustomEditors =
    !isOfficeMode &&
    typeof platform.selectAndAddCustomEditor === "function" &&
    typeof platform.removeCustomEditor === "function";

  const refreshInstalledEditors = useCallback(async () => {
    try {
      setInstalledEditors(await platform.getInstalledEditors());
    } catch (error) {
      logger.warn("[WorkspaceEditorButtonGroup] 刷新已安装 IDE 列表失败:", error);
    }
  }, [platform]);

  // 「选择应用程序…」：对话框由主进程弹出并写注册表，这里只刷新列表并选中（不自动打开）。
  const handleChooseApplication = async () => {
    if (disabledReason || !platform.selectAndAddCustomEditor) {
      return;
    }

    try {
      const editor = await platform.selectAndAddCustomEditor();
      if (!editor) {
        return; // 用户取消
      }

      await refreshInstalledEditors();
      setSelectedEditorId(editor.id);
      persistLastSelectedEditorId(editor.id);
    } catch (error) {
      logger.warn("[WorkspaceEditorButtonGroup] 添加自定义应用失败:", error);
    }
  };

  const handleRemoveCustomEditor = async (editor: EditorInfo) => {
    if (!platform.removeCustomEditor) {
      return;
    }

    try {
      await platform.removeCustomEditor(editor.id);
      await refreshInstalledEditors();
      if (readLastSelectedEditorId() === editor.id) {
        // 删除的是当前选中项：清除持久化偏好，选择回落到列表第一项
        clearLastSelectedEditorId();
        setSelectedEditorId(null);
      }
    } catch (error) {
      logger.warn("[WorkspaceEditorButtonGroup] 删除自定义应用失败:", error);
    }
  };

  useEffect(() => {
    onSelectedEditorChange?.(selectedEditor);
  }, [onSelectedEditorChange, selectedEditor]);
  const editorIconClassName = useMemo(() => {
    // Windows 上编辑器图标的视觉占比普遍更大，继续用 size-6 会让按钮显得偏挤。
    // 这里只在当前按钮做平台级微调，不影响菜单里的通用图标尺寸。
    if (typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent)) {
      return "size-4 shrink-0";
    }

    return "size-5 shrink-0";
  }, []);
  const editorMenuIconClassName = useMemo(() => {
    if (typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent)) {
      return "size-4 shrink-0";
    }

    return "size-5 shrink-0";
  }, []);

  const handleOpenEditor = (editor: EditorInfo) => {
    if (disabledReason) {
      return;
    }
    setSelectedEditorId(editor.id);
    if (shouldPersistWorkspaceEditorSelection("explicit")) {
      persistLastSelectedEditorId(editor.id);
    }
    const openOptions =
      remoteTarget || workspaceIdentity
        ? {
            remoteTarget: remoteTarget ? createOpenInEditorRemoteTarget(remoteTarget) : undefined,
            workspaceIdentity,
          }
        : undefined;

    void platform.openInEditor(editor.id, workspaceAbsPath, openOptions).then((result) => {
      if (result.success) {
        return;
      }
      logger.warn("[WorkspaceEditorButtonGroup] 打开编辑器失败", {
        editorId: editor.id,
        workspaceAbsPath,
        workspaceIdentity,
        error: result.error ?? "unknown-error",
      });
    });
  };

  if (!selectedEditor) {
    return null;
  }

  return (
    <div className="flex items-center h-7 rounded-lg border border-border bg-input overflow-hidden p-0 hover:border-border-hover">
      <Button
        type="button"
        variant="ghost"
        size="icon-md"
        className="size-7 rounded-none border-0"
        disabled={Boolean(disabledReason)}
        onClick={() => handleOpenEditor(selectedEditor)}
        aria-label={intl.formatMessage(
          { id: "appHeader.openInEditor" },
          { editor: selectedEditor.name },
        )}
        title={
          disabledReason ??
          intl.formatMessage({ id: "appHeader.openInEditor" }, { editor: selectedEditor.name })
        }
      >
        <img
          src={selectedEditor.iconDataUrl}
          alt={selectedEditor.name}
          className={editorIconClassName}
        />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            className="rounded-none border-0 text-foreground-subtlest !w-5"
            disabled={Boolean(disabledReason)}
            aria-label={intl.formatMessage({ id: "appHeader.selectOpenApp" })}
            title={disabledReason ?? intl.formatMessage({ id: "appHeader.selectOpenApp" })}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuRadioGroup
            value={selectedEditor.id}
            onValueChange={(editorId) => {
              const editor = builtinEditors.find((candidate) => candidate.id === editorId);
              if (!editor) {
                return;
              }

              handleOpenEditor(editor);
            }}
          >
            {builtinEditors.map((editor) => (
              <DropdownMenuRadioItem key={editor.id} value={editor.id}>
                <img
                  src={editor.iconDataUrl}
                  alt={editor.name}
                  className={editorMenuIconClassName}
                />
                {editor.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {customEditors.length > 0 && <DropdownMenuSeparator />}
          {customEditors.map((editor) => (
            <DropdownMenuItem key={editor.id} onSelect={() => handleOpenEditor(editor)}>
              <img src={editor.iconDataUrl} alt={editor.name} className={editorMenuIconClassName} />
              <span className="flex-1 truncate">{editor.name}</span>
              {selectedEditor.id === editor.id ? (
                <Check className="size-4 shrink-0 text-foreground-subtle" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <button
                type="button"
                className="rounded p-0.5 text-foreground-subtlest hover:text-foreground"
                aria-label={intl.formatMessage(
                  { id: "appHeader.removeCustomApp" },
                  { app: editor.name },
                )}
                title={intl.formatMessage(
                  { id: "appHeader.removeCustomApp" },
                  { app: editor.name },
                )}
                // Radix item 会在 pointerdown/click 上触发选中；删除按钮要吃掉这两个事件，
                // 否则点删除会先切换成"用该应用打开"。
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleRemoveCustomEditor(editor);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          {canManageCustomEditors && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  // 保持菜单打开：对话框结束后新条目原地出现在菜单里
                  event.preventDefault();
                  void handleChooseApplication();
                }}
              >
                <Plus className="size-3.5 shrink-0" />
                {intl.formatMessage({ id: "appHeader.chooseApplication" })}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
