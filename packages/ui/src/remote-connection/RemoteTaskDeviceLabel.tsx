import {
  resolveTaskSourceLabel,
  type TaskSourceAttributionInput,
} from "@/lib/taskSourceAttribution.js";
import { cn } from "@/components/lib/utils.js";

/**
 * fork 适配：上游设备行经 useRemoteDevicePresentationInput（Source 管理设备聚合，
 * 剔除域）取连接态名称与状态附注；fork 无该域——标签只展示 serverDisplayName
 * （目录 displayNames 投影），连接态附注不再渲染。
 */
export function RemoteTaskDeviceLabel({
  task,
  className,
}: {
  task: TaskSourceAttributionInput;
  className?: string;
}) {
  const name = resolveTaskSourceLabel(task);
  if (!name) return null;
  return (
    <span
      data-task-source-label="true"
      className={cn(
        "inline-flex h-5 min-w-0 max-w-28 shrink-0 items-center gap-1 rounded-md bg-surface px-2 text-ui-xs font-normal text-remote-foreground-muted",
        className,
      )}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}
