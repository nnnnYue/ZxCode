import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  formatRemoteConnectionError,
  resolveRemoteConnectionPresentation,
} from "@/lib/remoteConnectionPresentation.js";
import { getRemoteConnectionFailureCode } from "@/lib/remoteWorkspaceServiceError.js";
import { resolveWorkspaceKey } from "@zcode/shared";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { useRemoteWorkspaceSessionStore } from "@/store/remoteWorkspaceSessionStore.js";
import {
  useRemoteProjectPresentationFacts,
  useRemoteProjectReconnect,
} from "@/hooks/RemoteProjectPresentationContext.js";
import { getWorkspaceSourceServerId } from "@/conversation-workspace-target/sourceIdentity.js";

/**
 * fork 适配两处剔除（上游同名 hook）：
 * 1. useRemoteDevicePresentationInput（Source 管理设备聚合，剔除域）→ device 恒为
 *    undefined，展示名回退 tab label / workspacePath，连接态由 Root 注入 facts 决定。
 * 2. useOptionalRemoteWorkspaceController（remote/remoteWorkspaceController，fork 基线
 *    未引入的 43 文件域）→ controller 恒为 undefined；重连只走 Root 注入的
 *    onReconnect（RemoteProjectPresentationProvider），无 owner 时按失败 toast 降级。
 */
export function useRemoteProjectConnectionPresentation(scope: {
  workspacePath: string;
  workspaceIdentity?: string;
}) {
  const { intl } = useZCodeIntl();
  const workspaceKey = resolveWorkspaceKey(scope);
  const tab = useTabStore((state) =>
    state.tabs.find(
      (entry) => isWorkspaceTab(entry) && resolveWorkspaceKey(entry) === workspaceKey,
    ),
  );
  const workspaceTab = tab && isWorkspaceTab(tab) ? tab : null;
  // sourceId 保留解析以维持 conversation-workspace-target 的身份口径；设备聚合已剔除不消费。
  const sourceId = getWorkspaceSourceServerId(workspaceTab ?? scope);
  void sourceId;
  const facts = useRemoteProjectPresentationFacts(workspaceKey);
  const attached = useRemoteWorkspaceSessionStore((state) => {
    const id = state.sessionIdByWorkspaceIdentity[workspaceKey] ?? workspaceTab?.remoteSessionId;
    return Boolean(id && state.sessionsById[id]?.services);
  });
  const onReconnect = useRemoteProjectReconnect();
  const presentation = resolveRemoteConnectionPresentation({ ...facts, attached });
  return {
    tab: workspaceTab,
    deviceName: workspaceTab?.label ?? scope.workspacePath,
    presentation,
    busy: facts.reconnecting,
    error: facts.projectError,
    reconnect: async () => {
      try {
        if (!onReconnect) throw new Error("remote-project.reconnect-owner-unavailable");
        await onReconnect(workspaceKey);
      } catch (error) {
        toast(
          formatRemoteConnectionError({
            fallback: String(error),
            reasonCode: getRemoteConnectionFailureCode(error),
            formatMessage: intl.formatMessage,
          }),
        );
      }
    },
  };
}
