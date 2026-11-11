import { ArchiveRestore, X } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/**
 * 项目区空态的一次性恢复引导卡片（specs/project-restore-guide.md）。
 * 可见性由 useProjectRestoreGuide 判定；点击主按钮即一键恢复全部候选目录
 * （2026-11-10 拍板，无勾选对话框），「不再提示」写 projectRestoreGuideDismissed，
 * 恢复成功后卡片随项目非空自然消失；失败内联报错可重试。
 */
export function ProjectRestoreGuide({
  count,
  restoring,
  error,
  onRestore,
  onDismiss,
}: {
  /** 候选目录的未归类任务总数。 */
  count: number;
  restoring: boolean;
  error: string | null;
  onRestore(): void;
  onDismiss(): void;
}) {
  const { intl } = useZCodeIntl();
  const msg = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `projectRestore.${id}` }, values);
  return (
    <div
      data-testid="project-restore-guide"
      data-count={count}
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-3"
    >
      <div className="flex items-start gap-2">
        <ArchiveRestore
          className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-ui-base font-medium">{msg("banner.title")}</span>
          <span className="text-ui-sm text-foreground-subtle">
            {msg("banner.description", { count })}
          </span>
        </div>
        <Button
          data-testid="project-restore-guide-dismiss"
          variant="ghost"
          size="icon-sm"
          aria-label={msg("banner.dismiss")}
          title={msg("banner.dismiss")}
          disabled={restoring}
          onClick={onDismiss}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <Button
        data-testid="project-restore-guide-restore"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={restoring}
        onClick={onRestore}
      >
        {restoring ? msg("banner.restoring") : msg("banner.action")}
      </Button>
      {error ? (
        <p
          role="alert"
          data-testid="project-restore-guide-error"
          className="text-ui-sm text-destructive"
        >
          {msg("banner.error", { message: error })}
        </p>
      ) : null}
    </div>
  );
}
