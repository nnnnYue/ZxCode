import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { RemoteProjectHost } from "@/project-sidebar/contract.js";
import { toast } from "@/components/ui/toast.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import {
  classifyRemoteConnectionError,
  type RemoteConnectionStatus,
} from "@/lib/remoteConnectionPresentation.js";

/**
 * fork 适配：上游连接中阶段条依赖 Source 管理域两处 owner——
 * useRemoteDevicePresentationInput（设备聚合状态）与 useSourceServerOperationLogs
 * （结构化操作日志）。两者均属剔除域（远程设备管理不合并），fork 无设备快照也无操作日志，
 * 连接中进度块无法投影：connecting 分支整体不渲染（连接本身在 stub 下不可达），
 * 失败态展示保留（离线 Host 的 lastConnectionError 仍可解释）。
 */
export function RemoteConnectionProgressSection({
  host,
  status,
  error,
}: {
  host: RemoteProjectHost;
  status: RemoteConnectionStatus;
  error?: string;
}) {
  const { intl } = useZCodeIntl();
  // 修复原因：布尔值会让新错误沿用“已复制”；记录被复制的原文，错误变化后自然失效。
  const [copiedError, setCopiedError] = useState<string>();
  const msg = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values);

  // fork：connecting 分支依赖的设备状态与阶段日志 owner 已剥离，无法投影进度，直接跳过。
  if (status === "connecting") return null;

  if (!error || (status !== "failed" && status !== "offline")) return null;
  const reason = classifyRemoteConnectionError({
    error,
    target: host.target ?? undefined,
  });
  return (
    <div
      data-testid="remote-connection-failure"
      className="mt-3 rounded-lg bg-destructive-surface px-2.5 py-2 text-destructive-surface-foreground"
    >
      <div className="break-words font-medium">{msg(reason.titleId, reason.values)}</div>
      <div className="mt-0.5 break-words">{msg(reason.reasonId, reason.values)}</div>
      <button
        type="button"
        data-testid="remote-connection-copy-error"
        className="mt-1.5 inline-flex items-center gap-1 hover:underline"
        onClick={() => {
          void navigator.clipboard
            .writeText(error)
            .then(() => setCopiedError(error))
            .catch((cause) => {
              logger.warn("[project-sidebar] 复制连接错误失败", cause);
              toast(String(cause));
            });
        }}
      >
        {copiedError === error ? (
          <Check aria-hidden="true" className="size-3.5" />
        ) : (
          <Copy aria-hidden="true" className="size-3.5" />
        )}
        {msg(copiedError === error ? "remote.progress.copied" : "remote.progress.copyError")}
      </button>
    </div>
  );
}
