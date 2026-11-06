import { useCallback, useEffect, useRef } from "react";
import { AlertTriangleIcon, LoaderIcon } from "lucide-react";
import { TID_SSH_ERROR, type RemoteTarget } from "@zcode/shared";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import type { RemoteConnectionLogEntry } from "@/hooks/useRemoteConnectionLogs.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  isRemoteConnectionLogScrolledToLatest,
  scrollRemoteConnectionLogsToLatestIfFollowing,
} from "@/remote-connection/remoteConnectionLogScroll.js";

export function RemoteConnectionConnectingStep({
  logs,
  errorMessage,
  loading,
  onBack,
  onRetry,
}: {
  kind: RemoteTarget["kind"];
  logs: RemoteConnectionLogEntry[];
  errorMessage: string;
  loading: boolean;
  onBack: () => void;
  onRetry: () => void;
}) {
  const { intl } = useZCodeIntl();
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowLatestLogRef = useRef(true);
  const latestLogId = logs.at(-1)?.id;
  const latestLogTimestamp = logs.at(-1)?.timestamp;

  const handleLogContainerScroll = useCallback(() => {
    const container = logContainerRef.current;
    if (!container) {
      return;
    }

    shouldFollowLatestLogRef.current = isRemoteConnectionLogScrolledToLatest(container);
  }, []);

  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) {
      return;
    }

    // 日志持续追加会推高 scrollHeight，无条件写 scrollTop 会把向上查看历史日志的用户拉回底部。
    // 这里只在用户原本贴底时继续跟随最新日志。
    if (
      scrollRemoteConnectionLogsToLatestIfFollowing(container, shouldFollowLatestLogRef.current)
    ) {
      shouldFollowLatestLogRef.current = true;
    }
  }, [logs.length, latestLogId, latestLogTimestamp]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 h-full">
      <div className="flex flex-col flex-1 min-h-0 space-y-4">
        <div className="min-h-0 flex-1 flex flex-col rounded-xl bg-background border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-ui-base font-medium text-foreground">
              {intl.formatMessage({ id: "remote.connectionLog" })}
            </p>
            {loading ? (
              <div className="flex items-center gap-2 text-ui-base text-foreground-subtle">
                <LoaderIcon className="size-3.5 animate-spin" />
                {intl.formatMessage({ id: "remote.connecting" })}
              </div>
            ) : null}
          </div>
          <div
            ref={logContainerRef}
            onScroll={handleLogContainerScroll}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 font-mono text-ui-base"
          >
            {logs.length > 0 ? (
              logs.map((entry) => (
                <div key={entry.id} className="w-full flex min-w-0 leading-5 text-foreground">
                  <span className="text-foreground-subtlest">{entry.timestamp}</span>
                  <span
                    className={cn(
                      "mx-2",
                      entry.level === "success"
                        ? "text-success"
                        : entry.level === "warn"
                          ? "text-warning"
                          : entry.level === "error"
                            ? "text-destructive"
                            : "text-foreground-subtle",
                    )}
                  >
                    [{entry.level.toUpperCase()}]
                  </span>
                  <span>{entry.message}</span>
                </div>
              ))
            ) : (
              <div className="flex min-h-full items-center justify-center text-foreground-subtle">
                <span>[INFO] {intl.formatMessage({ id: "remote.connectionLogEmpty" })}</span>
              </div>
            )}
          </div>
        </div>

        {errorMessage ? (
          <div
            data-testid={TID_SSH_ERROR}
            className="flex flex-wrap items-start gap-3 rounded-xl border border-warning/30 px-4 py-3 text-ui-base text-warning"
          >
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">{errorMessage}</span>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="h-10 min-w-0 px-5"
          onClick={onBack}
          disabled={loading}
        >
          {intl.formatMessage({ id: "common.back" })}
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-10 min-w-0 px-5"
          onClick={onRetry}
          disabled={loading}
        >
          {loading
            ? intl.formatMessage({ id: "remote.connecting" })
            : intl.formatMessage({ id: "remote.retryConnection" })}
        </Button>
      </div>
    </div>
  );
}

// ---- 侧栏换骨架 Phase 3c：阶段解析与进度投影（上游 v3.17.2 同名文件摘取）----
// 上游把整块连接步骤 UI 重写为 Source 管理域视图（RemotePasswordInput/操作日志 UI，
// fork 剔除域）不整体引入；这里只摘纯函数部分，供 remote-connection-flow 进度投影
// 与 project-sidebar 复用。原始 phase 归并规则保持上游单点维护。

/** 连接向导与侧栏详情共用的用户阶段；原始 phase 的归并规则只在这里维护一份。 */
const REMOTE_CONNECTION_PHASES = [
  ["channel", "remote.phase.channel"],
  ["identify", "remote.phase.identify"],
  ["deploy", "remote.phase.deploy"],
  ["handshake", "remote.phase.handshake"],
  // 修复原因（R8）：带项目目录的连接在握手后还要让远端读取并登记该目录。这一步过去被算进
  // “启动并检查兼容性”，远端读目录卡住时用户看到的是兼容性检查一直转圈。设备级连接没有这一步。
  ["workspace", "remote.phase.workspace"],
] as const;

function remoteConnectionPhases(includeWorkspace: boolean) {
  return includeWorkspace
    ? REMOTE_CONNECTION_PHASES
    : REMOTE_CONNECTION_PHASES.filter(([key]) => key !== "workspace");
}

export type RemoteConnectionPhaseStatus = "pending" | "active" | "complete" | "failed";

function normalizeRemoteConnectionPhase(rawPhase: string): string | null {
  if (rawPhase === "probe") return "channel";
  if (rawPhase === "directory-record") return "identify";
  if (rawPhase === "publish-online") return "handshake";
  if (rawPhase === "daemon" || rawPhase === "protocol-handshake" || rawPhase === "restart")
    return "handshake";
  if (
    rawPhase === "download" ||
    rawPhase === "preflight" ||
    rawPhase === "upload" ||
    rawPhase === "extract" ||
    rawPhase === "verify-archive" ||
    rawPhase === "verify" ||
    rawPhase === "install"
  ) {
    return "deploy";
  }
  if (rawPhase === "channel") return "channel";
  return REMOTE_CONNECTION_PHASES.some(([key]) => key === rawPhase) ? rawPhase : null;
}

export function resolveRemoteConnectionPhases(
  logs: ReadonlyArray<Pick<RemoteConnectionLogEntry, "message" | "level">>,
  options: { connectionReady?: boolean; includeWorkspace?: boolean } = {},
) {
  const includeWorkspace = options.includeWorkspace === true;
  const phaseList = remoteConnectionPhases(includeWorkspace);
  let activeIndex = -1;
  let failedIndex = -1;
  for (const log of logs) {
    const match = /^\[source-server:([^\]]+)\]/u.exec(log.message);
    if (!match) continue;
    const normalized = normalizeRemoteConnectionPhase(match[1]!);
    // 设备级连接（目录为 /）也会读取目录，但不显示“打开项目目录”；它的结果归到最后一步。
    const phaseIndex = phaseList.findIndex(
      ([key]) =>
        key === (normalized === "workspace" && !includeWorkspace ? "handshake" : normalized),
    );
    if (phaseIndex < 0) continue;
    activeIndex = Math.max(activeIndex, phaseIndex);
    if (log.level === "error") failedIndex = phaseIndex;
  }
  // 修复原因：成功连接后 publish-online 不是 Renderer 日志流的可靠终结事件，
  // 仅按日志推断会出现顶部已连接但阶段轨永久停在握手中的状态。连接 session ready
  // 是同一条连接流程的权威终态；没有错误阶段时用它完成最终阶段，不改变连接中的日志进度。
  // 带项目目录时，Source 上线（publish-online）之后还有“打开项目目录”，只有窗口连接 ready 才算完成。
  const connectionReady =
    (options.connectionReady === true ||
      (!includeWorkspace &&
        logs.some((log) => log.message.startsWith("[source-server:publish-online]")))) &&
    failedIndex < 0;
  return phaseList.map(([key, titleId], index) => ({
    key,
    titleId,
    status: (failedIndex === index
      ? "failed"
      : connectionReady
        ? "complete"
        : index < activeIndex
          ? "complete"
          : index === activeIndex
            ? "active"
            : "pending") as RemoteConnectionPhaseStatus,
  }));
}

export interface RemoteOperationProgress {
  index: number;
  total: number;
  titleId: string;
  /** 仅最新一条是上传/下载进度时存在，0-100 整数。 */
  percent?: number;
  /** 本次操作首条日志时间；Host 每次新操作都会替换旧日志。 */
  startedAt?: number;
}
