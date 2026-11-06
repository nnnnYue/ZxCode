/* eslint-disable max-lines -- Root workspace action hook 集中编排项目、远程和 conversation 入口；合并期保持动作边界完整，后续按领域拆分。 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type IPlatformService, type RemoteTarget, type ZCodeTaskClientMode } from "@zcode/shared";
import type { IServiceAccessor } from "@zcode/services";
import type { CreateTaskOptions, CreateTaskRequest } from "@/app-shell/types.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { isRendererReloadNavigation } from "@/lib/rendererNavigation.js";
import { parseWslUncWorkspacePath } from "@/lib/wslUncWorkspace.js";
import { logger } from "@/logger.js";
import { openFolderFromWorkspaceEntry } from "@/root/openWorkspaceFolderEntry.js";
import { useConversationWorkspaceActions } from "@/root/useConversationWorkspaceActions.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { isWorkspaceReadOnly, type TabStore, type TabStoreState } from "@/store/tabStore.js";
import type { RootProps } from "@/root/types.js";
import {
  hadPersistedPaneLayoutAtModuleLoad,
  INITIAL_PANE_LAYOUT,
  usePaneLayoutStore,
} from "@/v4/paneLayoutStore.js";
import { resolveWorkbenchNewTaskTarget } from "@/v4/workbenchNewTaskTarget.js";
import type { WorkbenchNewTaskTarget } from "@/v4/workbenchNewTaskTarget.js";
import { useWorkbenchGroupStore } from "@/v4/workbenchGroupStore.js";
import {
  ensurePendingTaskDraft,
  persistV4ComposerDraft,
  resolveComposerScope,
  V4_DRAFT_SCOPE_ROOT,
} from "@/v4/composer/composerDraftStore.js";
import { readProjectSidebarView } from "@/project-sidebar/index.js";
import { remoteHostIdFromWorkspaceIdentity } from "@/project-sidebar/contract.js";
import { useComposerClientNamespace } from "@/hooks/useServices.js";
import { toast } from "@/components/ui/toast.js";

export interface OpenRemoteConnectionPreference {
  preferredKind?: RemoteTarget["kind"];
  preferredWslDistro?: string;
}

/** 新任务落点：identity 缺省一律归一化为 null，供只读校验、focus/addTab 统一消费。 */
export interface NewTaskTargetResolution {
  workspacePath: string;
  workspaceIdentity: string | null;
}

/**
 * 解析新任务落点：请求显式带 targetWorkspace 时（跨项目发起已保存工作流）直接采用它，不再询问 workbench 焦点；
 * 否则惰性回退到 resolveWorkbenchNewTaskTarget。identity 缺省归一化为 null。
 */
export function resolveNewTaskTargetFromRequest(
  request: CreateTaskRequest | undefined,
  resolveFallback: () => WorkbenchNewTaskTarget | null,
): NewTaskTargetResolution | null {
  const targetWorkspace =
    typeof request === "string" || !request ? undefined : request.targetWorkspace;
  if (targetWorkspace) {
    return {
      workspacePath: targetWorkspace.workspacePath,
      workspaceIdentity: targetWorkspace.workspaceIdentity ?? null,
    };
  }
  const fallback = resolveFallback();
  if (!fallback) {
    return null;
  }
  return {
    workspacePath: fallback.workspacePath,
    workspaceIdentity: fallback.workspaceIdentity ?? null,
  };
}

export function useRootWorkspaceActions({
  intl,
  platform,
  services,
  tabStoreApi,
  addTab,
  activeWorkspacePath,
  activeWorkspaceIdentity,
  supportsSettings,
  allowOpenWorkspace,
  preferDirectoryBrowser,
  openDirectoryBrowser,
  onOpenRemoteConnection,
  openRemoteProjectWorkspace,
  openMobileProjectDraft,
  workbenchGroupClientMode = "desktop-continuous",
}: {
  intl: ReturnType<typeof import("@/i18n/IntlProvider.js").useZCodeIntl>["intl"];
  platform: IPlatformService;
  services: IServiceAccessor;
  tabStoreApi: TabStore;
  addTab: TabStoreState["addTab"];
  activeWorkspacePath: string | null;
  activeWorkspaceIdentity: string | null;
  supportsSettings: boolean;
  allowOpenWorkspace: NonNullable<RootProps["allowOpenWorkspace"]>;
  preferDirectoryBrowser: boolean;
  openDirectoryBrowser?: () => void;
  onOpenRemoteConnection?: (preference?: OpenRemoteConnectionPreference) => void;
  /** 远端项目的显式打开入口（Root 的 attachRemoteProjectWorkspace 通道）。 */
  openRemoteProjectWorkspace?: (target: {
    hostId: string;
    workspacePath: string;
    workspaceIdentity?: string;
    expectedMembershipId?: string;
    projectId: string | null;
    isCurrent?: () => boolean;
  }) => Promise<void>;
  /** 手机目录 admission 完成后，在 prewarm 前接收项目和输入草稿。 */
  openMobileProjectDraft?: (request: CreateTaskOptions) => Promise<void>;
  workbenchGroupClientMode?: ZCodeTaskClientMode;
}) {
  const [workspaceActionError, setWorkspaceActionError] = useState<string | null>(null);
  const requestConfirmation = useConfirmDialog();
  // Root 的远端装配依赖本 hook 返回的动作，函数引用每轮都会变化；它只用于点击执行，
  // 不应使整个新建入口失稳。与任务导航一致，读取最近已提交实现，并冻结本次操作的实现。
  const remoteProjectOpener = useRef(openRemoteProjectWorkspace);
  useLayoutEffect(() => {
    remoteProjectOpener.current = openRemoteProjectWorkspace;
  });
  const composerClientNamespace = useComposerClientNamespace();
  const navigationSequence = useRef(0);
  const {
    handleSelectConversationWorkspace,
    handleResolveConversationWorkspace,
    handleEnsureConversationWorkspace,
    handleCreateConversationTask,
  } = useConversationWorkspaceActions({
    services,
    addTab,
    setWorkspaceActionError,
  });

  useEffect(() => {
    useWorkbenchGroupStore.getState().configureClientMode(workbenchGroupClientMode);
    if (workbenchGroupClientMode === "desktop-continuous" && !isRendererReloadNavigation()) {
      // group/pane 是 renderer-local 持久化 UI 状态。app 冷启动如果直接
      // 激活它们，即使 activeTaskId=null 也会把历史 session 显示出来，违背启动草稿语义。
      // renderer reload 则保留恢复资格，用于输出中刷新续流。
      const workbenchState = useWorkbenchGroupStore.getState();
      const activeGroup = workbenchState.activeGroupId
        ? workbenchState.groups[workbenchState.activeGroupId]
        : null;
      const activeGroupWasRestored = Boolean(
        activeGroup &&
        [activeGroup.primaryBinding, ...Object.values(activeGroup.panes)].some(
          (binding) => binding.restoredUnvalidated,
        ),
      );
      if (activeGroupWasRestored) {
        workbenchState.deactivateActiveGroup();
      }
      if (hadPersistedPaneLayoutAtModuleLoad()) {
        usePaneLayoutStore.getState().resetToPrimaryPane();
      }
    }
  }, [workbenchGroupClientMode]);

  const startDraftInWorkspace = useCallback(
    (workspacePath: string, workspaceIdentity?: string) => {
      if (workbenchGroupClientMode === "desktop-continuous") {
        useWorkbenchGroupStore.getState().deactivateActiveGroup();
        usePaneLayoutStore.getState().resetToPrimaryPane();
      }
      useZCodeSessionStore.getState().startDraft(workspacePath, undefined, workspaceIdentity);
    },
    [workbenchGroupClientMode],
  );

  const startNewTaskFromActiveWorkspace = useCallback(
    async (source: string, request?: CreateTaskRequest) => {
      const state = tabStoreApi.getState();
      const {
        activeWorkspacePath: currentActiveWorkspacePath,
        activeWorkspaceIdentity: currentActiveWorkspaceIdentity,
        activateTabByPath: focusWorkspace,
      } = state;
      const workbenchGroupState = useWorkbenchGroupStore.getState();
      const activeGroup =
        workbenchGroupClientMode === "desktop-continuous" && workbenchGroupState.activeGroupId
          ? (workbenchGroupState.groups[workbenchGroupState.activeGroupId] ?? null)
          : null;
      // 跨项目发起已保存工作流时，新任务必须落在工作流归属项目，而非活动项目
      // request 显式带 targetWorkspace 时采用它，
      // 否则惰性回退到 workbench 焦点解析，无 target 时行为与旧版逐字节一致。
      const newTaskTarget = resolveNewTaskTargetFromRequest(request, () =>
        resolveWorkbenchNewTaskTarget({
          activeWorkspacePath: currentActiveWorkspacePath,
          activeWorkspaceIdentity: currentActiveWorkspaceIdentity,
          activeGroup,
          // remote 虽然不显示 paneLayout，但 renderer 里可能仍有 desktop
          // focused secondary；新任务必须按可见 shell workspace 定位，不能消费隐藏 pane。
          paneLayout:
            workbenchGroupClientMode === "desktop-continuous"
              ? usePaneLayoutStore.getState()
              : INITIAL_PANE_LAYOUT,
        }),
      );

      if (
        typeof request === "object" &&
        request.expectedWorkspaceKey &&
        request.expectedWorkspaceKey !==
          (newTaskTarget?.workspaceIdentity?.trim() || newTaskTarget?.workspacePath)
      ) {
        return;
      }
      if (!newTaskTarget) {
        logger.error(`[Root] ${source} failed: no active workspace`);
        setWorkspaceActionError(intl.formatMessage({ id: "workspace.noActiveForNewTask" }));
        return;
      }

      // 仅禁用按钮无法覆盖桌面菜单和快捷键；启动期失效 workspace
      // 必须在动作边界再次校验，避免历史只读页被隐式切回可发送草稿态。
      if (
        isWorkspaceReadOnly(
          state,
          newTaskTarget.workspacePath,
          newTaskTarget.workspaceIdentity ?? undefined,
        )
      ) {
        return;
      }

      // ---- 侧栏换骨架 Phase 3c：项目归属解析 + 目录准备（上游 v3.17.2 同名动作）----
      // 项目树是唯一组织视图：新任务先解析项目归属（显式 projectId / 活动任务继承 /
      // 草稿 draftProjectId），projectService.prepareSession 准备执行目录后再提交导航。
      const sequence = ++navigationSequence.current;
      const originTab = tabStoreApi.getState().activeTabId;
      const originWorkspace = activeWorkspacePath
        ? useZCodeSessionStore
            .getState()
            .getWorkspaceState(activeWorkspacePath, activeWorkspaceIdentity ?? undefined)
        : null;
      const isCurrent = () =>
        (typeof request !== "object" || request.isCurrent?.() !== false) &&
        sequence === navigationSequence.current &&
        tabStoreApi.getState().activeTabId === originTab &&
        (!activeWorkspacePath ||
          (() => {
            const ws = useZCodeSessionStore
              .getState()
              .getWorkspaceState(activeWorkspacePath, activeWorkspaceIdentity ?? undefined);
            return (
              ws.activeTaskId === originWorkspace?.activeTaskId &&
              ws.draftFocusVersion === originWorkspace?.draftFocusVersion
            );
          })());
      try {
        const requestOptions = typeof request === "string" ? { provider: request } : { ...request };
        if (
          requestOptions.taskGroupId === undefined &&
          requestOptions.projectId === undefined &&
          readProjectSidebarView() === "grouped" &&
          activeWorkspacePath
        ) {
          // grouped 视图的新建继承组织意图：活动任务取其分组，草稿取草稿分组；未归类为 null。
          const taskId = originWorkspace?.activeTaskId;
          const draftGroupId = originWorkspace?.draftTaskGroupId;
          const structure = taskId ? await services.taskGroupService?.read() : undefined;
          if (!isCurrent()) return;
          requestOptions.taskGroupId = taskId
            ? (structure?.members.find(
                (member) =>
                  member.taskId === taskId &&
                  member.workspaceKey === (activeWorkspaceIdentity?.trim() || activeWorkspacePath),
              )?.groupId ?? null)
            : (draftGroupId ?? null);
        }
        request = requestOptions;
        let projectId =
          typeof request === "string"
            ? undefined
            : (request?.projectId ?? request?.targetWorkspace?.projectId);
        let hostId =
          typeof request === "string"
            ? undefined
            : (request?.hostId ?? request?.targetWorkspace?.hostId);
        const hasExplicitProject =
          typeof request === "object" &&
          request !== null &&
          ("projectId" in request || Boolean(request.targetWorkspace?.projectId));
        if (!hasExplicitProject && newTaskTarget) {
          // 原因：仅远程继承项目会让本地快捷键落入未归类。按任务完整身份读取归属，不能由 cwd 猜项目。
          if (newTaskTarget.workspaceIdentity) {
            hostId =
              remoteHostIdFromWorkspaceIdentity(newTaskTarget.workspaceIdentity) ?? undefined;
            if (!hostId) throw new Error("project.host-identity-required");
          }
          const workspace = useZCodeSessionStore
            .getState()
            .getWorkspaceState(
              newTaskTarget.workspacePath,
              newTaskTarget.workspaceIdentity ?? undefined,
            );
          const tree = workspace.activeTaskId
            ? await services.projectService?.readTree(hostId ? { hostId } : undefined)
            : undefined;
          if (workspace.activeTaskId && !tree) throw new Error("project.service-unavailable");
          projectId = workspace.activeTaskId
            ? (tree?.tasks.find(
                (task) =>
                  task.taskId === workspace.activeTaskId &&
                  (task.workspaceIdentity?.trim() || task.workspacePath) ===
                    (newTaskTarget.workspaceIdentity?.trim() || newTaskTarget.workspacePath),
              )?.projectId ?? undefined)
            : (workspace.draftProjectId ?? undefined);
          if (projectId && (!hostId || hostId === "local")) {
            // 软删除保留历史 project_id；把它直接继承给新任务会报 not-found 并停在旧页。
            // 只继承同 Host 的有效项目，草稿也复验；读取失败仍报错，不冒充项目已删除。
            const projects = tree?.projects ?? (await services.projectService?.readProjects());
            if (!projects) throw new Error("project.service-unavailable");
            if (
              !projects.some(
                (project) =>
                  project.id === projectId && project.hostId === "local" && !project.deleted,
              )
            ) {
              logger.debug("[Root] 新任务不继承已删除的本地项目", { projectId });
              projectId = undefined;
            }
          }
          if (hostId && hostId !== "local" && !projectId)
            throw new Error("project.remote-project-required");
        }
        if (!isCurrent()) return;
        if (workbenchGroupClientMode === "web-remote-replayable") {
          if (!openMobileProjectDraft) throw new Error("project.remote-navigation-unavailable");
          // 归属先在共享入口解析，目录仍只由 bridge owner 准备；旧 Root 不写交接后的草稿。
          await openMobileProjectDraft({
            ...requestOptions,
            ...(projectId ? { projectId } : {}),
            ...(hostId ? { hostId } : {}),
          });
          return;
        }
        if (!services.projectService) throw new Error("project.service-unavailable");
        const pendingDraft =
          !projectId && (!hostId || hostId === "local")
            ? ensurePendingTaskDraft(resolveComposerScope(null, undefined, composerClientNamespace))
            : null;
        const target = await services.projectService.prepareSession({
          ...(projectId ? { projectId } : {}),
          ...(hostId ? { hostId } : {}),
          // 显式 local 与省略 Host 是同一入口，不能漏掉待发送身份而另建目录。
          ...(pendingDraft
            ? { draftId: pendingDraft.draftId, reuseDraft: Boolean(pendingDraft.workspacePath) }
            : {}),
        });
        if (!isCurrent()) return;
        if (hostId && hostId !== "local") {
          if (!target.workspaceIdentity || !remoteProjectOpener.current)
            throw new Error("project.remote-navigation-unavailable");
          await remoteProjectOpener.current({
            ...target,
            hostId,
            isCurrent,
            ...(typeof request === "object" && request.remoteProjectMembershipId
              ? { expectedMembershipId: request.remoteProjectMembershipId }
              : {}),
          });
          if (typeof request === "object") request.onComplete?.();
          return;
        }
        // 目录准备成功才提交导航；失败保留当前会话和分屏。
        const provider = typeof request === "string" ? request : request?.provider;
        const groupedDraftPlacement =
          typeof request === "string" ? undefined : request?.groupedDraftPlacement;
        if (
          !focusWorkspace(
            target.workspacePath,
            target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : undefined,
          )
        ) {
          addTab(target.workspacePath, {
            workspacePurpose: target.projectId ? "project" : "conversation",
            ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
          });
        }

        setWorkspaceActionError(null);
        const rawInitialPrompt = typeof request === "string" ? undefined : request?.initialPrompt;
        // Skill mention 后的尾空格决定光标落在 chip 之后；直接 trim 后再保存
        // 会把结构化 mention 的可编辑间隔吞掉。这里只用 trim 判空，非空草稿保留调用方原文。
        const initialPrompt = rawInitialPrompt?.trim() ? rawInitialPrompt : undefined;
        const initialPromptMention =
          typeof request === "string" ? undefined : request?.initialPromptMention;
        logger.info(`[Root] ${source}:`, target.workspacePath, provider ?? "default-provider");
        // Cmd/Ctrl+N 是创建新的单 panel 草稿，不是在当前 workbench
        // group / paneLayout 中继续拆一个 draft；目标 workspace 取 focused pane。
        useWorkbenchGroupStore.getState().deactivateActiveGroup();
        usePaneLayoutStore.getState().resetToPrimaryPane();
        useZCodeSessionStore
          .getState()
          .startDraft(target.workspacePath, provider, target.workspaceIdentity ?? undefined, {
            groupedDraftPlacement,
            createSource: typeof request === "string" ? undefined : request?.createSource,
            projectId: target.projectId,
            ...(typeof request === "object" && request.taskGroupId !== undefined
              ? { taskGroupId: request.taskGroupId }
              : {}),
            ...(pendingDraft ? { draftId: pendingDraft.draftId } : {}),
          });
        if (initialPrompt) {
          // insert request 被首个 composer 消费后会清空；如果随后因 pane/config
          // 切换 remount，新 composer 会从空的 __draft__ 恢复并覆盖预填。先写草稿事实源，
          // 再发即时插入请求：当前 composer 立即可见，后续 remount 也恢复同一文本。
          persistV4ComposerDraft(
            target.workspacePath,
            target.workspaceIdentity ?? undefined,
            V4_DRAFT_SCOPE_ROOT,
            {
              text: initialPrompt,
              ...(initialPromptMention ? { mention: initialPromptMention } : {}),
            },
          );
          useZCodeSessionStore
            .getState()
            .requestComposerTextInsert(
              target.workspacePath,
              initialPrompt,
              target.workspaceIdentity ?? undefined,
              initialPromptMention,
            );
        }
      } catch (error) {
        if (!isCurrent()) return;
        logger.error("[Root] 准备新任务失败", error);
        if (typeof request === "object" && request.onError) request.onError(error);
        else {
          // 原因：原错误状态无人展示，目录移走后顶部新建和快捷键只会静默失败。
          // 在仍有效的动作出口反馈；有 onError 的调用方继续负责展示，避免重复提示。
          const message =
            error &&
            typeof error === "object" &&
            "message" in error &&
            typeof error.message === "string"
              ? error.message
              : String(error);
          toast(
            message === "project.primaryRootMissing" || message === "project.primaryRootUnavailable"
              ? intl.formatMessage({ id: message })
              : message,
          );
        }
      }
    },
    [
      services.projectService,
      services.taskGroupService,
      intl,
      composerClientNamespace,
      activeWorkspacePath,
      activeWorkspaceIdentity,
      tabStoreApi,
      addTab,
      openMobileProjectDraft,
      workbenchGroupClientMode,
    ],
  );

  const handleSelectProject = useCallback(
    async (path: string) => {
      logger.info("[Root] handleSelectProject called with path:", path);
      try {
        const wslUncWorkspace = parseWslUncWorkspacePath(path);
        if (wslUncWorkspace && onOpenRemoteConnection) {
          const shouldOpenWslConnection = await requestConfirmation({
            title: intl.formatMessage({ id: "workspace.wslUncPrompt.title" }),
            description: intl.formatMessage(
              { id: "workspace.wslUncPrompt.description" },
              {
                path,
              },
            ),
            confirmLabel: intl.formatMessage({ id: "workspace.wslUncPrompt.openWsl" }),
            cancelLabel: intl.formatMessage({ id: "workspace.wslUncPrompt.continuePath" }),
          });
          if (shouldOpenWslConnection) {
            logger.info("[Root] 用户选择通过 WSL 远程连接打开 UNC 工作区", {
              distro: wslUncWorkspace.distro,
              path,
            });
            onOpenRemoteConnection({
              preferredKind: "wsl",
              preferredWslDistro: wslUncWorkspace.distro,
            });
            return;
          }
        }

        // 桌面端：检查是否已有其他窗口打开了该目录，如果是则激活该窗口对应 tab
        const result = await platform.activateOrSetWorkspace(path);
        if (result.activated) {
          logger.info("[Root] 目录已在其他窗口打开，已激活该窗口对应 tab，跳过重复打开");
          return;
        }

        // 新增 tab（如果已在本窗口打开则激活它）
        addTab(path);
        // 打开 workspace 是 workspace-only 意图，不是“继续上次会话”。
        // 即使命中已存在 tab，也必须清掉该 workspace 的 activeTaskId 并回到单 pane 草稿。
        startDraftInWorkspace(path);
        setWorkspaceActionError(null);

        // 更新最近项目列表
        if (supportsSettings) {
          // 远程窗口的 host 不提供 settingService，之前这里仍然会更新 recentProjects，
          // 导致 SSH 场景在打开项目后再次命中不存在的 setting channel。
          // 只有本地窗口才维护最近项目，远程窗口只负责打开当前 workspace。
          logger.info("[Root] calling settingService.get()...");
          const settings = await services.settingService.get();
          const updated = [
            path,
            ...settings.recentProjects.filter((projectPath) => projectPath !== path),
          ].slice(0, 10);
          await services.settingService.update({ recentProjects: updated });
          // Dock/Jump List 的系统最近文档入口已经下线，这里只保留应用内 recentProjects，
          // 避免系统最近项和项目选择页列表重复维护，造成两个入口内容漂移。
          logger.info("[Root] settingService.update() done");
        }
      } catch (err) {
        logger.error("[Root] handleSelectProject error:", err);
      }
    },
    [
      addTab,
      intl,
      onOpenRemoteConnection,
      platform,
      requestConfirmation,
      services.settingService,
      startDraftInWorkspace,
      supportsSettings,
    ],
  );

  const handleOpenWorkspace = useCallback(() => {
    if (!allowOpenWorkspace) {
      // Web 远程控制当前只保证“进入 desktop 已打开的 workspace”。
      // 之前这里继续放开“打开工作区”，用户会被带进打开工作区中间页，
      // 但后续的新工作区/新会话链路并没有在 Web 远程控制模式里补齐，看起来就像页面一直卡住。
      // 这里直接拦掉入口，避免把用户带进半支持状态。
      logger.info("[Root] 当前模式不支持打开其他工作区，已忽略请求");
      return;
    }
    setWorkspaceActionError(null);

    if (preferDirectoryBrowser) {
      void openFolderFromWorkspaceEntry({
        preferDirectoryBrowser,
        openDirectoryBrowser,
        selectDirectory: () => platform.selectDirectory(),
        onSelectProject: (path) => {
          void handleSelectProject(path);
        },
      });
      return;
    }

    // 打开工作区中间页作为“新标签页”会在启动空态、Cmd/Ctrl+O
    // 和菜单打开工作区时抢占整页。现在打开工作区只保留为动作：本地优先直接弹系统目录选择，
    // 不再进入中间页面；不支持系统目录选择的壳层由启动兜底负责创建默认 workspace。
    if (!supportsSettings) {
      void handleEnsureConversationWorkspace().catch((error) => {
        logger.error("[Root] 创建对话 workspace 失败", { error });
      });
      return;
    }

    void openFolderFromWorkspaceEntry({
      selectDirectory: () => platform.selectDirectory(),
      onSelectProject: (path) => {
        void handleSelectProject(path);
      },
    });
  }, [
    allowOpenWorkspace,
    handleEnsureConversationWorkspace,
    handleSelectProject,
    openDirectoryBrowser,
    platform,
    preferDirectoryBrowser,
    supportsSettings,
  ]);

  const handleOpenFolderFromWorkspaceMenu = useCallback(() => {
    if (!allowOpenWorkspace) {
      logger.info("[Root] 当前模式不支持从空态菜单打开文件夹，已忽略请求");
      return;
    }

    // 空态 workspace 菜单的 Open folder 需要复用根级打开工作区动作。
    // 因此这里调用同一个入口函数，只把 Root 里的 selectDirectory 与项目选择回调注入进去。
    if (preferDirectoryBrowser) {
      void openFolderFromWorkspaceEntry({
        preferDirectoryBrowser,
        openDirectoryBrowser,
        selectDirectory: () => platform.selectDirectory(),
        onSelectProject: (path) => {
          void handleSelectProject(path);
        },
      });
      return;
    }

    if (!supportsSettings) {
      void handleEnsureConversationWorkspace().catch((error) => {
        logger.error("[Root] 从空态菜单创建对话 workspace 失败", { error });
      });
      return;
    }

    void openFolderFromWorkspaceEntry({
      selectDirectory: () => platform.selectDirectory(),
      onSelectProject: (path) => {
        void handleSelectProject(path);
      },
    });
  }, [
    allowOpenWorkspace,
    handleEnsureConversationWorkspace,
    handleSelectProject,
    openDirectoryBrowser,
    platform,
    preferDirectoryBrowser,
    supportsSettings,
  ]);

  const handleCreateTask = useCallback(
    (request?: CreateTaskRequest) => {
      startNewTaskFromActiveWorkspace("sidebar new task", request);
    },
    [startNewTaskFromActiveWorkspace],
  );

  const handleBackFromSettings = useCallback(() => {
    if (!activeWorkspacePath) {
      return;
    }

    // 设置页返回最近 workspace 时不能只按 path 激活。
    // 同一路径可能存在不同远端身份，丢掉 activeWorkspaceIdentity 会把远程工作区切到 path-only 桶。
    tabStoreApi
      .getState()
      .activateTabByPath(
        activeWorkspacePath,
        activeWorkspaceIdentity ? { workspaceIdentity: activeWorkspaceIdentity } : undefined,
      );
  }, [activeWorkspaceIdentity, activeWorkspacePath, tabStoreApi]);

  return {
    workspaceActionError,
    setWorkspaceActionError,
    startDraftInWorkspace,
    startNewTaskFromActiveWorkspace,
    handleSelectProject,
    handleSelectConversationWorkspace,
    handleResolveConversationWorkspace,
    handleEnsureConversationWorkspace,
    handleCreateConversationTask,
    handleOpenWorkspace,
    handleOpenFolderFromWorkspaceMenu,
    handleCreateTask,
    handleBackFromSettings,
  };
}
