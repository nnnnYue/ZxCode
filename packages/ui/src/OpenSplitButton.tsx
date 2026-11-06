import type { EditorInfo } from "@zcode/shared";
import { isCustomEditorInfo } from "@zcode/shared";
import { ChevronDownIcon, CopyIcon, ExternalLinkIcon, FolderOpenIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import type { MessageFileLinkTarget } from "@/components/ai-elements/message.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import {
  FileApplicationChoices,
  FileSaveAsMenuItem,
  useFileApplications,
} from "@/file-menu/index.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useFileContextActions } from "@/hooks/useFileContextActions.js";
import { useWorkspaceOpenInEditorTarget } from "@/hooks/useWorkspaceOpenInEditorTarget.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { persistLastSelectedEditorId } from "@/lib/editorPreference.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import { getFileManagerLabel } from "@/workspace-file-tree/helpers.js";
import { getWorkspaceFileRelativePath } from "@/workspace-file-tree/model.js";
import { resolveWorkspaceEditorSelection } from "@/lib/workspaceEditorSelection.js";
import { logger } from "@/logger.js";

// 导出类型供共用时间线以 import type 引用（构建期擦除，不把 open-with 子树带进公开页 bundle）。
export type OpenSplitButtonTarget =
  | {
      type: "website";
      url: string;
      localPath?: string;
    }
  | {
      type: "file";
      path: string;
      title: string;
      label: string;
      previewSource?: CodeViewerSource;
    };

interface OpenSplitButtonProps {
  target: OpenSplitButtonTarget;
  onOpenBrowserUrl?: (url: string) => void;
  onOpenFileLink?: (target: MessageFileLinkTarget) => void;
  onOpenCodeViewer?: (source: CodeViewerSource) => void;
  hideOpenWithMenu?: boolean;
  stopPropagation?: boolean;
}

export function OpenSplitButton({
  target,
  onOpenBrowserUrl,
  onOpenFileLink,
  onOpenCodeViewer,
  hideOpenWithMenu = false,
  stopPropagation = false,
}: OpenSplitButtonProps) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const previewSource = target.type === "file" ? target.previewSource : undefined;
  const matchedOpenContext = useWorkspaceOpenInEditorTarget({
    workspacePath: previewSource?.workspacePath,
    workspaceIdentity: previewSource?.workspaceIdentity,
    workspaceRemoteSessionId: previewSource?.workspaceRemoteSessionId,
  });
  const openInEditorRemoteTarget = matchedOpenContext.remoteTarget;
  const isRemoteSource = Boolean(
    previewSource?.workspaceIdentity ||
    previewSource?.workspaceRemoteSessionId ||
    matchedOpenContext.isRemoteWorkspace,
  );
  const fileActions = useFileContextActions({
    canOpenLocalFileManager: Boolean(platform.canOpenLocalFiles),
    isRemoteWorkspace: isRemoteSource,
    remoteTarget: openInEditorRemoteTarget,
    workspaceIdentity: previewSource?.workspaceIdentity,
  });
  const [editors, setEditors] = useState<EditorInfo[]>([]);
  const [editorsLoaded, setEditorsLoaded] = useState(false);
  const [loadingEditors, setLoadingEditors] = useState(false);
  const fileApplications = useFileApplications(
    target.type === "file"
      ? { path: target.path, pathKind: "file", workspaceIdentity: previewSource?.workspaceIdentity }
      : null,
    isRemoteSource,
  );
  const canOpenNative = Boolean(platform.canOpenLocalFiles && !isRemoteSource);
  // 整合菜单（specs/file-open-apps-enhancement.md）：本地文件 = 系统应用（isDefault 置顶）
  // → fork 自定义应用（custom: 前缀）→ 静态编辑器；远程回退既有 editors 过滤链路。
  // zcode-last-editor-id 偏好只作用于 editors/custom 段（系统应用永远按 isDefault 置顶），
  // 选择系统应用时不写入该偏好，避免把 file-app: 哈希 id 存进编辑器偏好。
  const sortedEditors: Array<EditorInfo & { isDefault?: boolean }> = useMemo(() => {
    if (!isRemoteSource) {
      const customEditors = editors.filter((editor) => isCustomEditorInfo(editor));
      const staticEditors = resolveWorkspaceEditorSelection({
        installedEditors: editors.filter((editor) => !isCustomEditorInfo(editor)),
        selectedEditorId: null,
        remoteTarget: openInEditorRemoteTarget,
      }).availableEditors;
      return [
        // FileApplicationInfo.iconDataUrl 可缺省；补空串对齐 EditorInfo 的必填图标字段。
        ...fileApplications.apps.map((app) => ({ ...app, iconDataUrl: app.iconDataUrl ?? "" })),
        ...customEditors,
        ...staticEditors,
      ];
    }
    return isRemoteSource && !openInEditorRemoteTarget
      ? []
      : resolveWorkspaceEditorSelection({
          installedEditors: editors,
          selectedEditorId: null,
          remoteTarget: openInEditorRemoteTarget,
        }).availableEditors;
  }, [editors, isRemoteSource, openInEditorRemoteTarget, fileApplications.apps]);
  const canPreview =
    target.type === "website"
      ? Boolean(onOpenBrowserUrl)
      : Boolean(onOpenFileLink || onOpenCodeViewer);

  const stopEventPropagation = (event: { stopPropagation: () => void }) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
  };

  const loadEditors = useCallback(async () => {
    if (target.type !== "file") {
      return;
    }
    // 本地文件同时刷新系统关联（fileApplications 内部自带竞态防护）。
    if (!isRemoteSource) {
      await fileApplications.load();
    }
    if (editorsLoaded || loadingEditors) {
      return;
    }

    setLoadingEditors(true);
    try {
      setEditors(await platform.getInstalledEditors());
      setEditorsLoaded(true);
    } catch (error) {
      logger.warn("[OpenSplitButton] 获取第三方打开方式失败", {
        path: target.path,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoadingEditors(false);
    }
  }, [editorsLoaded, loadingEditors, platform, target, isRemoteSource, fileApplications.load]);

  const handlePreview = () => {
    if (target.type === "website") {
      onOpenBrowserUrl?.(target.url);
      return;
    }

    if (onOpenCodeViewer) {
      onOpenCodeViewer(
        target.previewSource ?? {
          type: "file",
          title: target.title,
          path: target.path,
        },
      );
      return;
    }

    onOpenFileLink?.({
      path: target.path,
      label: target.label,
      pathKind: "file",
      workspacePath: target.previewSource?.workspacePath,
      workspaceIdentity: target.previewSource?.workspaceIdentity,
      workspaceRemoteSessionId: target.previewSource?.workspaceRemoteSessionId,
    });
  };

  const handleOpenInEditor = (editor: EditorInfo & { isDefault?: boolean }) => {
    if (target.type !== "file") {
      return;
    }

    // 系统关联应用（file-app: 前缀）走平台 openFileWithApplication；不写编辑器偏好，
    // zcode-last-editor-id 只作用于 custom:/静态编辑器段。
    if (editor.id.startsWith("file-app:")) {
      void fileApplications.open({ ...editor, isDefault: Boolean(editor.isDefault) });
      return;
    }
    persistLastSelectedEditorId(editor.id);
    void platform
      .openInEditor(editor.id, target.path, {
        pathKind: "file",
        remoteTarget: openInEditorRemoteTarget,
        workspaceIdentity: target.previewSource?.workspaceIdentity,
      })
      .then((result) => {
        if (result.success) {
          return;
        }

        logger.warn("[OpenSplitButton] 第三方 App 打开文件失败", {
          editorId: editor.id,
          path: target.path,
          error: result.error ?? "unknown-error",
        });
      });
  };

  const handleOpenExternal = () => {
    if (target.type !== "website" || !target.localPath || !platform.openExternalFile) {
      platform.openExternal(target.type === "website" ? target.url : target.path);
      return;
    }

    const localPath = target.localPath;
    const reportFailure = (error: unknown) => {
      logger.warn("[OpenSplitButton] 浏览器打开本地文件失败", {
        path: localPath,
        error: error instanceof Error ? error.message : String(error),
      });
      toast(intl.formatMessage({ id: "chat.previewCards.openExternalFailed" }));
    };
    void platform
      .openExternalFile(localPath)
      .then((result) => {
        if (!result.success) reportFailure(result.error ?? "unknown-error");
      })
      .catch(reportFailure);
  };

  const handleOpenDefault = () => {
    // hook 内部先取系统默认应用；无默认时回退 openExternalFile，失败有 toast 反馈。
    void fileApplications.openDefault();
  };

  // macOS / Windows 直达文件并选中；无系统定位能力或远程时由 hook 内部回退/关闭。
  const revealPath = target.type === "file" ? target.path : undefined;
  const canReveal = Boolean(revealPath && fileActions.canRevealInFileManager({ path: revealPath }));
  const handleReveal = () => {
    if (revealPath) void fileActions.revealFileInFileManager({ path: revealPath, kind: "file" });
  };

  if (hideOpenWithMenu) {
    return (
      <div
        className="flex h-7 shrink-0 items-center overflow-hidden rounded-lg border border-border bg-input transition-all hover:border-border-hover"
        onClick={stopEventPropagation}
        onPointerDown={stopEventPropagation}
      >
        <Button
          type="button"
          variant="ghost"
          size="default"
          className="h-7 rounded-none border-0 gap-1 px-2"
          disabled={!canPreview}
          onClick={(event) => {
            stopEventPropagation(event);
            handlePreview();
          }}
        >
          {intl.formatMessage({ id: "common.open" })}
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && void loadEditors()}>
      <div
        className="flex h-7 shrink-0 items-center overflow-hidden rounded-lg border border-border bg-input transition-all hover:border-border-hover"
        onClick={stopEventPropagation}
        onPointerDown={stopEventPropagation}
      >
        <Button
          type="button"
          variant="ghost"
          size="default"
          className="h-7 rounded-none border-0 gap-1 pr-1.5"
          disabled={!canPreview}
          onClick={(event) => {
            stopEventPropagation(event);
            handlePreview();
          }}
        >
          {intl.formatMessage({ id: "common.open" })}
        </Button>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            className="!w-5 rounded-none border-0 text-foreground-subtlest"
            aria-label={intl.formatMessage({ id: "appHeader.selectOpenApp" })}
            title={intl.formatMessage({ id: "appHeader.selectOpenApp" })}
            onClick={stopEventPropagation}
          >
            <ChevronDownIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        align="end"
        side="top"
        className="w-64 max-w-[calc(100vw-1rem)]"
        onClick={stopEventPropagation}
      >
        {target.type === "website" ? (
          <DropdownMenuItem onSelect={handleOpenExternal}>
            <ExternalLinkIcon className="size-4" />
            <span>
              {intl.formatMessage({
                id: "chat.previewCards.openExternal",
              })}
            </span>
          </DropdownMenuItem>
        ) : (
          <>
            <FileApplicationChoices
              applications={sortedEditors}
              loading={loadingEditors || fileApplications.loading}
              onOpenDefault={
                canOpenNative && platform.openExternalFile ? handleOpenDefault : undefined
              }
              onSelect={handleOpenInEditor}
            />
            <DropdownMenuSeparator />
            {canReveal && (
              <DropdownMenuItem onSelect={handleReveal}>
                <FolderOpenIcon className="size-4" />
                {getFileManagerLabel(intl)}
              </DropdownMenuItem>
            )}
            <FileSaveAsMenuItem
              path={target.path}
              workspacePath={target.previewSource?.workspacePath}
              workspaceIdentity={target.previewSource?.workspaceIdentity}
              workspaceRemoteSessionId={target.previewSource?.workspaceRemoteSessionId}
            />
            <DropdownMenuItem
              onSelect={() => void fileActions.copyAbsolutePath({ path: target.path })}
            >
              <CopyIcon className="size-4" />
              {intl.formatMessage({ id: "fileActions.copyAbsolutePath" })}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void fileActions.copyRelativePath({
                  path: target.path,
                  relativePath: target.previewSource?.workspacePath
                    ? getWorkspaceFileRelativePath(target.previewSource.workspacePath, target.path)
                    : target.label,
                })
              }
            >
              <CopyIcon className="size-4" />
              {intl.formatMessage({ id: "fileActions.copyRelativePath" })}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
