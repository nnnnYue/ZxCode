import { createContext, useContext, useState, type ReactNode } from "react";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { resolveWorkspaceKey } from "@zcode/shared";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import { useRemoteWorkspaceSessionStore } from "@/store/remoteWorkspaceSessionStore.js";
import { readV4ComposerDraft, V4_DRAFT_SCOPE_ROOT } from "@/v4/composer/composerDraftStore.js";

interface Scope {
  workspacePath: string;
  workspaceIdentity?: string;
  sessionId?: string | null;
}

/**
 * 重连动作的注入点。上游由 RemoteProjectPresentationContext（project-sidebar 骨架，
 * Phase 3 合入）提供 useRemoteProjectReconnect；fork 当前重连入口在 App 壳层 prop 链上，
 * v4 域不可达。壳层注册前按钮保持禁用，避免放一个必然失败的假动作。
 */
const RemoteConversationReconnectContext = createContext<
  ((workspaceKey: string) => Promise<void> | void) | null
>(null);

export function RemoteConversationReconnectProvider({
  onReconnect,
  children,
}: {
  onReconnect: (workspaceKey: string) => Promise<void> | void;
  children: ReactNode;
}) {
  return (
    <RemoteConversationReconnectContext.Provider value={onReconnect}>
      {children}
    </RemoteConversationReconnectContext.Provider>
  );
}

/**
 * fork 适配：上游用 project-sidebar 的 useRemoteProjectConnectionPresentation
 * （设备/服务器事实源在 Phase 3 骨架里）。这里用 fork 已有的 workspace services
 * 解析 + 远端 session 注册表推导同一组展示事实：remote-waiting = 远端已声明、
 * 真实 services 尚未注册（断连或重连中）。
 */
function useRemoteConversationPresentation(scope: Scope) {
  const workspaceKey = resolveWorkspaceKey(scope);
  const tab = useTabStore((state) =>
    state.tabs.find(
      (entry) => isWorkspaceTab(entry) && resolveWorkspaceKey(entry) === workspaceKey,
    ),
  );
  const workspaceTab = tab && isWorkspaceTab(tab) ? tab : null;
  const resolution = useWorkspaceServicesResolution(
    scope.workspacePath,
    undefined,
    scope.workspaceIdentity,
  );
  const attached = useRemoteWorkspaceSessionStore((state) => {
    const id =
      state.sessionIdByWorkspaceIdentity[workspaceKey] ??
      state.sessionIdByWorkspacePath[scope.workspacePath] ??
      workspaceTab?.remoteSessionId;
    return Boolean(id && state.sessionsById[id]?.services);
  });
  const onReconnect = useContext(RemoteConversationReconnectContext);
  return {
    tab: workspaceTab,
    deviceName: workspaceTab?.label ?? scope.workspaceIdentity ?? scope.workspacePath,
    // fork 适配：上游 status 来自 project-sidebar 的 useRemoteProjectConnectionPresentation
    // （Phase 3 骨架）；这里按 workspace services 解析结论收口为窄化字面量，避免展宽成 string。
    status: (resolution.connectionKind === "remote-ready" ? "online" : "offline") as
      | "online"
      | "offline",
    attached,
    remoteSessionId: resolution.remoteSessionId,
    reconnectAvailable: Boolean(onReconnect),
    reconnect: async () => {
      await onReconnect?.(workspaceKey);
    },
  };
}

function ConnectionStateIcon({ status }: { status: "online" | "offline" }) {
  if (status === "online") return null;
  return (
    <CloudOff
      aria-hidden="true"
      data-remote-state-icon="cloud-off"
      className="size-4 shrink-0 text-foreground-subtle"
    />
  );
}

function RemoteConversationBannerDetails({
  tab,
  deviceName,
  status,
  attached,
  remoteSessionId,
  ...scope
}: Scope & {
  tab: { label: string } | null;
  deviceName: string;
  status: "online" | "offline";
  attached: boolean;
  remoteSessionId: string | null;
}) {
  const { intl } = useZCodeIntl();
  return (
    <div className="flex min-w-0 flex-col gap-3 text-ui-sm text-foreground">
      <p>
        {attached
          ? intl.formatMessage({ id: "remote.status.online" })
          : intl.formatMessage({ id: "remote.status.offline" })}
        {status === "offline"
          ? ` · ${intl.formatMessage({ id: "remote.conversation.unavailable" })}`
          : null}
      </p>
      <div className="-mx-3 border-t border-border" />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
        <dt className="text-foreground-subtle">
          {intl.formatMessage({ id: "workspaceSidebar.projectDevice" })}
        </dt>
        <dd className="min-w-0 break-all">{deviceName}</dd>
        <dt className="text-foreground-subtle">
          {intl.formatMessage({ id: "workspaceSidebar.projectLine" })}
        </dt>
        <dd className="min-w-0 break-all">{scope.workspaceIdentity ?? "—"}</dd>
        <dt className="text-foreground-subtle">
          {intl.formatMessage({ id: "workspaceSidebar.projectPath" })}
        </dt>
        <dd className="min-w-0 break-all rounded-sm bg-surface px-2 py-1 font-mono">
          {scope.workspacePath}
        </dd>
        <dt className="text-foreground-subtle">remoteSessionId</dt>
        <dd className="min-w-0 break-all font-mono">{remoteSessionId ?? scope.sessionId ?? "—"}</dd>
      </dl>
    </div>
  );
}

export function RemoteConversationBanner(scope: Scope) {
  const { intl } = useZCodeIntl();
  const { tab, deviceName, status, attached, remoteSessionId, reconnectAvailable, reconnect } =
    useRemoteConversationPresentation(scope);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <div
      role="status"
      data-testid="remote-conversation-banner"
      data-connection-state={status}
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface p-3 text-ui-sm",
        status === "online" ? "text-foreground" : "text-foreground-subtle",
      )}
    >
      <ConnectionStateIcon status={status} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {intl.formatMessage({
            id: status === "online" ? "remote.status.online" : "remote.status.offline",
          })}
        </p>
        <p>{intl.formatMessage({ id: "remote.conversation.unavailable" })}</p>
        <p>{intl.formatMessage({ id: "remote.conversation.tasksContinue" })}</p>
      </div>
      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setDetailsOpen(true)}>
          {intl.formatMessage({ id: "remote.error.details" })}
        </Button>
        <Button
          size="sm"
          disabled={!reconnectAvailable}
          onClick={() => {
            void reconnect();
          }}
        >
          {intl.formatMessage({ id: "remote.conversation.reconnect" })}
        </Button>
      </div>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deviceName}</DialogTitle>
            <DialogDescription>{scope.workspacePath}</DialogDescription>
          </DialogHeader>
          <RemoteConversationBannerDetails
            {...scope}
            tab={tab}
            deviceName={deviceName}
            status={status}
            attached={attached}
            remoteSessionId={remoteSessionId}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 冷态不读取远端数据；草稿只读既有持久化，离线页面没有提交或排队处理器。 */
export function RemoteConversationDisconnected(scope: Scope) {
  const { intl } = useZCodeIntl();
  const draft = readV4ComposerDraft(
    scope.workspacePath,
    scope.workspaceIdentity,
    scope.sessionId ?? V4_DRAFT_SCOPE_ROOT,
  );
  const reason = intl.formatMessage({ id: "remote.conversation.sendUnavailable" });
  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      data-testid="remote-conversation-unavailable"
    >
      <RemoteConversationBanner {...scope} />
      <div className="flex min-h-32 flex-1 items-center justify-center p-6 text-center text-ui-base text-foreground-subtle">
        {intl.formatMessage({ id: "remote.conversation.placeholder" })}
      </div>
      <div className="m-3 rounded-xl border border-input-border bg-input p-3">
        <textarea
          readOnly
          value={draft?.text ?? ""}
          placeholder={reason}
          aria-label={intl.formatMessage({ id: "remote.conversation.draft" })}
          className="min-h-20 w-full resize-none bg-transparent text-ui-base text-foreground outline-none max-md:text-mobile-input-safe"
        />
        <div className="flex items-center justify-end gap-2 text-ui-sm text-foreground-subtle">
          <span>{reason}</span>
          <Button disabled>{intl.formatMessage({ id: "chat.send" })}</Button>
        </div>
      </div>
    </div>
  );
}
