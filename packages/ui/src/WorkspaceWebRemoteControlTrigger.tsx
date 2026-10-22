import { useState } from "react";
import { Smartphone } from "lucide-react";
import type { MobileRelayStatus } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useResolvedRemoteWorkspaceSessionId } from "@/hooks/useResolvedRemoteWorkspaceSessionId.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { WebRemoteControlDialog } from "@/WebRemoteControlDialog.js";
import { useWebRemoteControlFeatureEnabled } from "@/WebRemoteControlFeatureProvider.js";
import { useMobileRelayStatus } from "@/hooks/useMobileRelayStatus.js";

type FormatMessage = ReturnType<typeof useZCodeIntl>["intl"]["formatMessage"];

export function getMobileRelayTriggerPresentation(
  status: MobileRelayStatus,
  formatMessage: FormatMessage,
): { iconClassName: string; tooltip: string } {
  if (status.connected) {
    return {
      iconClassName: "text-success",
      tooltip: formatMessage({ id: "webRemoteControl.triggerStatus.relayConnected" }),
    };
  }
  if (status.lastError) {
    return {
      iconClassName: "text-destructive",
      tooltip: formatMessage(
        { id: "webRemoteControl.triggerStatus.relayError" },
        { error: status.lastError },
      ),
    };
  }
  return {
    iconClassName: "text-foreground-subtle",
    tooltip: formatMessage({ id: "webRemoteControl.triggerStatus.relayConnecting" }),
  };
}

/** relay 入口显隐 gate：已开启且配置了服务器地址才显示（connected 只影响图标颜色，不参与显隐，避免控制连接瞬断时入口闪烁消失）。 */
export function shouldShowMobileRelayTrigger(status: MobileRelayStatus | undefined): boolean {
  return Boolean(status?.supported && status.enabled && status.serverUrl?.trim());
}

export function WorkspaceWebRemoteControlTrigger({
  workspacePath,
  workspaceIdentity,
  remoteSessionId,
  initialTaskId,
  compact = false,
  className,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  initialTaskId?: string;
  compact?: boolean;
  className?: string;
}) {
  const featureEnabled = useWebRemoteControlFeatureEnabled();
  const relayStatus = useMobileRelayStatus();

  // removes 规范：移动端远程控制只走自部署 relay；未开启并配置 relay 时不显示入口。
  // relayStatus 为 undefined（平台不支持/首查未回）同样不渲染。
  if (!featureEnabled || !shouldShowMobileRelayTrigger(relayStatus)) {
    return null;
  }

  return (
    <WorkspaceWebRemoteControlTriggerContent
      workspacePath={workspacePath}
      workspaceIdentity={workspaceIdentity}
      remoteSessionId={remoteSessionId}
      initialTaskId={initialTaskId}
      compact={compact}
      className={className}
    />
  );
}

function WorkspaceWebRemoteControlTriggerContent({
  workspacePath,
  workspaceIdentity,
  remoteSessionId,
  initialTaskId,
  compact = false,
  className,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  initialTaskId?: string;
  compact?: boolean;
  className?: string;
}) {
  const { intl } = useZCodeIntl();
  const relayStatus = useMobileRelayStatus();
  const mappedRemoteSessionId = useResolvedRemoteWorkspaceSessionId(
    workspacePath,
    remoteSessionId,
    workspaceIdentity,
  );
  // 修复原因：tab 上的 remoteSessionId 可能在断线重连期间失效；远控链路同时携带
  // identity 与 session，若继续透传未注册的旧值会组合成错误 endpoint。这里只采用
  // resolver 按 identity 校验后的 live session，未恢复时让弹层保持 remote-waiting。
  const currentRemoteSessionId = mappedRemoteSessionId ?? undefined;
  const [webRemoteControlOpen, setWebRemoteControlOpen] = useState(false);
  const triggerPresentation = relayStatus
    ? getMobileRelayTriggerPresentation(relayStatus, intl.formatMessage)
    : { iconClassName: "text-foreground-subtle", tooltip: "" };

  return (
    <>
      <ControlHintTooltip
        title={intl.formatMessage({ id: "webRemoteControl.trigger" })}
        description={triggerPresentation.tooltip}
        side="top"
        align="center"
        triggerClassName={compact ? undefined : "w-full"}
      >
        <Button
          variant="ghost"
          onClick={() => {
            logger.info("[WorkspaceWebRemoteControlTrigger] 打开 Web 远程控制弹层", {
              workspacePath,
              workspaceIdentity: workspaceIdentity ?? "none",
              remoteSessionId: currentRemoteSessionId ?? "none",
              initialTaskId: initialTaskId ?? "none",
            });
            setWebRemoteControlOpen(true);
          }}
          size={compact ? "icon-lg" : "lg"}
          aria-label={intl.formatMessage({ id: "webRemoteControl.trigger" })}
          className={cn(
            compact
              ? "text-foreground hover:bg-surface-hover hover:text-foreground"
              : "w-full justify-start gap-2 text-foreground hover:bg-surface-hover hover:text-foreground",
            className,
          )}
        >
          {/* 图标颜色表达 relay 控制连接状态（绿=已连接/红=失败/灰=连接中）；手机接入状态由弹层内的授权链接呈现。 */}
          <Smartphone className={cn("size-4", triggerPresentation.iconClassName)} />
          {compact ? (
            <span className="sr-only">
              {intl.formatMessage({ id: "webRemoteControl.trigger" })}
            </span>
          ) : (
            intl.formatMessage({ id: "webRemoteControl.trigger" })
          )}
        </Button>
      </ControlHintTooltip>
      <WebRemoteControlDialog
        open={webRemoteControlOpen}
        onOpenChange={setWebRemoteControlOpen}
        workspacePath={workspacePath}
        workspaceIdentity={workspaceIdentity}
        remoteSessionId={currentRemoteSessionId}
      />
    </>
  );
}
