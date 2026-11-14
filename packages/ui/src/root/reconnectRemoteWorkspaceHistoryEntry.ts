import type { Dispatch, SetStateAction } from "react";
import type { IPlatformService, RemoteWorkspaceSessionEntry } from "@zcode/shared";
import { stripRemoteTargetSecrets } from "@zcode/shared";
import type { IServiceAccessor } from "@zcode/services";
import { toast } from "@/components/ui/toast.js";
import {
  buildRemoteWorkspaceSessionMutation,
  createRemoteTargetFromSnapshot,
  resolveRemoteWorkspaceSessionIdentity,
} from "@/lib/remoteWorkspaceHistory.js";
import { logger } from "@/logger.js";
import {
  bindRemoteWorkspaceIdentity,
  bindRemoteWorkspacePath,
} from "@/store/remoteWorkspaceSessionStore.js";
import { refreshRemotePinnedTasksForSession } from "@/store/remotePinnedTaskStore.js";
import { refreshRemoteTimelineTasksForSession } from "@/store/remoteTimelineTaskStore.js";

/** 把 UI 最终确定的 canonical workspacePath/workspaceIdentity 绑定回 main/host 的 logical session。 */
export type BindRemoteWorkspaceSessionContextFn = (params: {
  sessionId: string;
  workspacePath: string;
  workspaceIdentity: string;
}) => Promise<void>;

type ManualReconnectRemoteWorkspaceParams = {
  sessionEntry: RemoteWorkspaceSessionEntry;
  activateTabByPath: (workspacePath: string, options?: { workspaceIdentity?: string }) => boolean;
  setReconnectingRemoteWorkspaceKeys: Dispatch<SetStateAction<string[]>>;
  loadCredential: IServiceAccessor["credentialService"]["load"];
  connectRemoteWorkspaceTarget: (
    target: Parameters<IPlatformService["connectRemote"]>[0],
    requestId?: string,
    context?: Parameters<IPlatformService["connectRemote"]>[2],
  ) => Promise<string>;
  disposeRemoteWorkspaceSession: (sessionId: string) => Promise<void>;
  bindRemoteWorkspacePath: typeof bindRemoteWorkspacePath;
  bindRemoteWorkspaceIdentity: typeof bindRemoteWorkspaceIdentity;
  upsertWorkspaceTab: (
    workspacePath: string,
    options?: {
      remoteSessionId?: string;
      remoteTarget?: Parameters<IPlatformService["connectRemote"]>[0];
      workspaceIdentity?: string;
      localWorkspacePath?: string;
    },
  ) => void;
  commitRemoteWorkspaceSessionMutation: (
    mutation: ReturnType<typeof buildRemoteWorkspaceSessionMutation>,
  ) => Promise<RemoteWorkspaceSessionEntry>;
  getRemoteSessions: () => RemoteWorkspaceSessionEntry[];
  logger: Pick<typeof logger, "warn">;
  toast: typeof toast;
  shouldKeepReconnectedWorkspace?: (
    context: Pick<RemoteWorkspaceSessionEntry, "workspacePath" | "workspaceIdentity">,
  ) => boolean;
  /** 目录当前 tab 上仍在线的 owner session；没有或已失效时返回 undefined。 */
  readLiveWorkspaceOwner?: (
    context: Pick<RemoteWorkspaceSessionEntry, "workspacePath" | "workspaceIdentity">,
  ) => string | undefined;
  onWorkspaceActivated?: (target: { workspacePath: string; workspaceIdentity: string }) => void;
  options?: ReconnectRemoteWorkspaceOptions;
};

export interface SshReconnectCredentials {
  password: string | null;
  privateKeyPassphrase: string | null;
}

export interface ReconnectRemoteWorkspaceOptions {
  /** 用户原地重连先检查已有凭据，缺失交接向导；自动恢复保留 Host admission。 */
  requireStoredCredentials?: boolean;

  activateWorkspaceAfterReconnect?: boolean;
  showErrorToast?: boolean;
  requestId?: string;
  throwOnFailure?: boolean;
  /** 共享 Host ready 后，sibling 复用 initiator 凭据附着，禁止再次读取各自历史凭据。 */
  sshCredentialsOverride?: SshReconnectCredentials;
  /** logical connect 已返回，表示共享 SSH Host ready；workspace 初始化仍可能继续或失败。 */
  onSshHostReady?: (credentials: SshReconnectCredentials) => void;
}

export async function reconnectRemoteWorkspaceHistoryEntry({
  sessionEntry,
  activateTabByPath,
  setReconnectingRemoteWorkspaceKeys,
  loadCredential,
  connectRemoteWorkspaceTarget,
  disposeRemoteWorkspaceSession,
  bindRemoteWorkspacePath,
  bindRemoteWorkspaceIdentity,
  upsertWorkspaceTab,
  commitRemoteWorkspaceSessionMutation,
  getRemoteSessions,
  logger,
  toast,
  shouldKeepReconnectedWorkspace,
  readLiveWorkspaceOwner,
  onWorkspaceActivated,
  options,
}: ManualReconnectRemoteWorkspaceParams): Promise<void> {
  const activateWorkspaceAfterReconnect = options?.activateWorkspaceAfterReconnect ?? true;
  const showErrorToast = options?.showErrorToast ?? true;
  const fallbackWorkspaceIdentity = resolveRemoteWorkspaceSessionIdentity(sessionEntry);
  const reconnectWorkspaceKey = fallbackWorkspaceIdentity?.trim() || sessionEntry.workspacePath;

  setReconnectingRemoteWorkspaceKeys((currentKeys) =>
    currentKeys.includes(reconnectWorkspaceKey)
      ? currentKeys
      : [...currentKeys, reconnectWorkspaceKey],
  );

  let reconnectTarget = createRemoteTargetFromSnapshot(sessionEntry.target, {
    password: null,
    privateKeyPassphrase: null,
    token: null,
  });
  let resolvedWorkspacePath = sessionEntry.workspacePath;
  let resolvedWorkspaceIdentity = fallbackWorkspaceIdentity;
  try {
    const sshCredentials = options?.sshCredentialsOverride ?? {
      password:
        sessionEntry.target.kind === "ssh" && sessionEntry.target.passwordCredentialKey
          ? await loadCredential(sessionEntry.target.passwordCredentialKey)
          : null,
      privateKeyPassphrase:
        sessionEntry.target.kind === "ssh" && sessionEntry.target.privateKeyPassphraseCredentialKey
          ? await loadCredential(sessionEntry.target.privateKeyPassphraseCredentialKey)
          : null,
    };
    const token =
      sessionEntry.target.kind === "server" && sessionEntry.target.tokenCredentialKey
        ? await loadCredential(sessionEntry.target.tokenCredentialKey)
        : null;
    reconnectTarget = createRemoteTargetFromSnapshot(sessionEntry.target, {
      ...sshCredentials,
      token,
    });
    const sessionId = await connectRemoteWorkspaceTarget(reconnectTarget, options?.requestId, {
      workspacePath: sessionEntry.workspacePath,
      workspaceIdentity: fallbackWorkspaceIdentity,
      connectTrigger: "reconnect",
    });
    if (reconnectTarget.kind === "ssh") {
      // Host ready 与 provider/task 等 workspace 初始化必须分阶段通知。
      // sibling 从此刻即可复用 initiator credential 创建 attachment，无需等待或重复读取凭据。
      options?.onSshHostReady?.(sshCredentials);
    }
    // 移植自上游 v3.18.0：重连沿用持久化路径与首次 bind 的 identity，已绑定路径不再做 realpath 归一化。
    // Bug 原因（上游 3.17.1 用户反馈"设备已连接、会话打不开"）：重连过去先对持久化路径做 realpath，
    // 项目根是 symlink 时（例如 /home/dev/projects/app → /data/projects/app）会得到另一个 identity，
    // 下方保留校验按持久化 key 找不到对应 tab，刚连上的 session 被当作"已被移除"静默回收。
    // 已绑定的 workspace 以首次 bind 的路径为身份：connect context 已携带持久化 path/identity，
    // main 的 descriptor 与 tab、历史记录保持同一组值，这里不再重新推导 identity，也就无需再 bind 换代。
    // 首次连接的选目录流程仍保留 realpath 归一化（见 resolveRemoteWorkspaceCanonicalPath 的注释）。

    // 手动重连过程中，用户可能先点重连再立即把该远端 tab 移除。
    // 如果这里不在成功落库前再做一次保留校验，会把用户刚移除的 workspace 又重新加回来。
    if (
      shouldKeepReconnectedWorkspace &&
      !shouldKeepReconnectedWorkspace({
        workspacePath: resolvedWorkspacePath,
        workspaceIdentity: resolvedWorkspaceIdentity,
      })
    ) {
      logger.warn("[Root] 远程 workspace 在重连过程中已被移除，跳过恢复并回收 session", {
        workspacePath: resolvedWorkspacePath,
      });
      await disposeRemoteWorkspaceSession(sessionId);
      return;
    }
    // 移植自上游 v3.18.0：写入 tab 前复核目录是否已有在线 owner，让出并回收本次连接。
    // Bug 原因：入口只在发起前检查 tab 是否已有 owner；连接与 Provisioning 等待期间，侧栏导航可能已为
    // 同一目录写入另一条 session，这里直接覆盖 tab，被替换的 session 无人回收。写入前按同一规则复核，
    // 与项目打开路径的复用规则一致。
    const liveOwner = readLiveWorkspaceOwner?.({
      workspacePath: resolvedWorkspacePath,
      workspaceIdentity: resolvedWorkspaceIdentity,
    });
    if (liveOwner && liveOwner !== sessionId) {
      logger.warn("[Root] 远程 workspace 在重连过程中已有在线 owner，让出并回收 session", {
        workspacePath: resolvedWorkspacePath,
        sessionId,
        liveOwner,
      });
      await disposeRemoteWorkspaceSession(sessionId);
      return;
    }
    bindRemoteWorkspacePath(resolvedWorkspacePath, sessionId);
    bindRemoteWorkspaceIdentity(resolvedWorkspaceIdentity, sessionId);
    upsertWorkspaceTab(resolvedWorkspacePath, {
      remoteSessionId: sessionId,
      remoteTarget: stripRemoteTargetSecrets(reconnectTarget),
      workspaceIdentity: resolvedWorkspaceIdentity,
      localWorkspacePath: sessionEntry.localWorkspacePath,
    });
    if (activateWorkspaceAfterReconnect) {
      // 侧栏重连过去会先激活只有 identity、尚无 remoteSessionId 的断连 tab，
      // conversation provider 因 remote-waiting 返回 null，导致连接期间右侧整块黑屏。
      // 必须先绑定 services 并静默回填 tab 的 session 元数据，再一次性激活 tab 与草稿。
      const activated = activateTabByPath(resolvedWorkspacePath, {
        workspaceIdentity: resolvedWorkspaceIdentity,
      });
      if (activated) {
        onWorkspaceActivated?.({
          workspacePath: resolvedWorkspacePath,
          workspaceIdentity: resolvedWorkspaceIdentity,
        });
      }
    }
    await commitRemoteWorkspaceSessionMutation(
      buildRemoteWorkspaceSessionMutation({
        remoteSessions: getRemoteSessions(),
        workspacePath: resolvedWorkspacePath,
        localWorkspacePath: sessionEntry.localWorkspacePath,
        workspaceIdentity: resolvedWorkspaceIdentity,
        target: reconnectTarget,
        lastConnectionStatus: "connected",
        touchOpenedAt: true,
      }),
    );
    await Promise.all([
      refreshRemotePinnedTasksForSession({
        sessionId,
        workspacePath: resolvedWorkspacePath,
        workspaceIdentity: resolvedWorkspaceIdentity,
      }),
      refreshRemoteTimelineTasksForSession({
        sessionId,
        workspacePath: resolvedWorkspacePath,
        workspaceIdentity: resolvedWorkspaceIdentity,
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("[Root] 手动重连远程 workspace 失败", {
      workspacePath: resolvedWorkspacePath,
      error: message,
    });
    await commitRemoteWorkspaceSessionMutation(
      buildRemoteWorkspaceSessionMutation({
        remoteSessions: getRemoteSessions(),
        workspacePath: resolvedWorkspacePath,
        workspaceIdentity: resolvedWorkspaceIdentity,
        target: reconnectTarget,
        lastConnectionStatus: "failed",
        lastConnectionError: message,
        touchOpenedAt: false,
      }),
    );
    if (showErrorToast) {
      toast(message);
    }
    if (options?.throwOnFailure) {
      // 桌面端重连按钮需要吞掉异常并通过 toast/状态落库反馈，
      // 但手机端 Web 远控是 RPC 语义，必须把失败明确回传给手机端。
      throw error;
    }
  } finally {
    setReconnectingRemoteWorkspaceKeys((currentKeys) =>
      currentKeys.filter((key) => key !== reconnectWorkspaceKey),
    );
  }
}
