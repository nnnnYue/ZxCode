import { memo, useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
/* eslint-disable max-lines -- Web 远程控制弹层集中处理授权链接生成、二维码、倒计时和 Bot Channel 入口，后续稳定后再拆分子组件。 */
import type { BotProvider } from "@zcode/shared";
import {
  Bot as BotIcon,
  CopyIcon,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
  Smartphone,
  XIcon,
} from "lucide-react";
import { BotsDialog } from "@/BotsDialog.js";
import { ProviderIcon } from "@/BotsDialog/shared.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { toast } from "@/components/ui/toast.js";
import { useMobileRelayStatus } from "@/hooks/useMobileRelayStatus.js";
import { useGrantCountdown } from "@/hooks/useGrantCountdown.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { getBotProviderRegionTagLabelId } from "@/botsUi.js";

type RemoteControlBotProvider = Extract<BotProvider, "weixin" | "feishu" | "lark" | "telegram">;

const REMOTE_CONTROL_BOT_ENTRIES: Array<{
  provider: RemoteControlBotProvider;
}> = [
  { provider: "weixin" },
  { provider: "feishu" },
  { provider: "lark" },
  { provider: "telegram" },
];

export const WebRemoteControlDialog = memo(function WebRemoteControlDialogComponent({
  open,
  onOpenChange,
  workspacePath,
  workspaceIdentity,
  remoteSessionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}) {
  const platform = usePlatform();
  const { intl } = useZCodeIntl();
  const relayStatus = useMobileRelayStatus();
  // removes 规范：移动端远程控制只走自部署 relay。弹层打开即签发授权链接
  // （链接即凭证：10 分钟内未打开失效；打开后闲置 24 小时失效，刷新/多端可用）。
  const [grant, setGrant] = useState<{ url: string; expiresAt: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [botsDialogOpen, setBotsDialogOpen] = useState(false);
  const [botEntryProvider, setBotEntryProvider] = useState<RemoteControlBotProvider | null>(null);
  const grantRequestSeqRef = useRef(0);

  const grantRemainingSeconds = useGrantCountdown(grant?.expiresAt);
  const grantExpired = grant !== null && grantRemainingSeconds <= 0;

  const requestGrant = useCallback(async () => {
    const requestSeq = ++grantRequestSeqRef.current;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await platform.requestMobileRelayGrant?.({
        workspacePath,
        ...(workspaceIdentity ? { workspaceIdentity } : {}),
        ...(remoteSessionId ? { remoteSessionId } : {}),
      });
      if (requestSeq !== grantRequestSeqRef.current) return;
      if (!result?.success || !result.url) {
        setGrant(null);
        setGenerateError(
          result?.error ?? intl.formatMessage({ id: "webRemoteControl.relay.generateFailed" }),
        );
        logger.warn("[WebRemoteControlDialog] 生成手机远控授权链接失败", {
          workspacePath,
          workspaceIdentity: workspaceIdentity ?? "none",
          remoteSessionId: remoteSessionId ?? "none",
          error: result?.error ?? "none",
        });
        return;
      }
      setGrant({ url: result.url, expiresAt: result.expiresAt ?? Date.now() + 10 * 60_000 });
      logger.info("[WebRemoteControlDialog] 已生成手机远控授权链接", {
        workspacePath,
        workspaceIdentity: workspaceIdentity ?? "none",
        remoteSessionId: remoteSessionId ?? "none",
        expiresAt: result.expiresAt ?? "default",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (requestSeq === grantRequestSeqRef.current) {
        setGrant(null);
        setGenerateError(
          intl.formatMessage(
            { id: "webRemoteControl.relay.generateFailedWith" },
            { error: message },
          ),
        );
      }
      logger.error("[WebRemoteControlDialog] 请求手机远控授权链接异常", {
        workspacePath,
        error: message,
      });
    } finally {
      if (requestSeq === grantRequestSeqRef.current) {
        setGenerating(false);
      }
    }
  }, [intl, platform, remoteSessionId, workspaceIdentity, workspacePath]);

  useEffect(() => {
    if (!open) {
      return;
    }
    // 打开或目标 workspace 变化即自动签发；旧 grant 指向旧 workspace，不能复用。
    void requestGrant();
  }, [open, requestGrant]);

  useEffect(() => {
    if (!grant?.url) {
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;
    setQrDataUrl(null);

    void QRCode.toDataURL(grant.url, {
      margin: 1,
      width: 320,
    })
      .then((dataUrl: string) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("[WebRemoteControlDialog] 生成二维码失败", message);
      });

    return () => {
      cancelled = true;
    };
  }, [grant?.url]);

  const handleCopyLink = async () => {
    if (!grant?.url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(grant.url);
      toast(intl.formatMessage({ id: "webRemoteControl.copyLink.copied" }));
      logger.info("[WebRemoteControlDialog] 已复制手机远控授权链接", {
        workspacePath,
        remoteSessionId: remoteSessionId ?? "none",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(intl.formatMessage({ id: "webRemoteControl.copyLinkFailed" }, { error: message }));
      logger.error("[WebRemoteControlDialog] 复制手机远控授权链接失败", message);
    }
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    logger.info("[WebRemoteControlDialog] 弹层开关状态变化", {
      workspacePath,
      remoteSessionId: remoteSessionId ?? "none",
      nextOpen,
    });
    onOpenChange(nextOpen);
  };

  const handleDismiss = () => {
    handleDialogOpenChange(false);
  };

  const handleOpenBotEntry = (provider: RemoteControlBotProvider) => {
    setBotEntryProvider(provider);
    setBotsDialogOpen(true);
    logger.info("[WebRemoteControlDialog] 打开 Bot Channel 配置入口", {
      workspacePath,
      workspaceIdentity: workspaceIdentity ?? "none",
      provider,
    });
  };

  const handleOpenBotsDialog = () => {
    setBotEntryProvider(null);
    setBotsDialogOpen(true);
    logger.info("[WebRemoteControlDialog] 打开 Bots 总配置入口", {
      workspacePath,
      workspaceIdentity: workspaceIdentity ?? "none",
    });
  };

  const relayStatusLabel = relayStatus?.connected
    ? intl.formatMessage({ id: "webRemoteControl.relay.status.connected" })
    : relayStatus?.lastError
      ? intl.formatMessage(
          { id: "webRemoteControl.relay.status.error" },
          { error: relayStatus.lastError },
        )
      : intl.formatMessage({ id: "webRemoteControl.relay.status.connecting" });
  const relayStatusDotClassName = relayStatus?.connected
    ? "bg-success"
    : relayStatus?.lastError
      ? "bg-destructive"
      : "bg-border";

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100vh-6rem)] max-w-4xl gap-0 overflow-hidden rounded-2xl p-0"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2 enabled:cursor-pointer [app-region:no-drag]"
            onClick={handleDismiss}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
          <div
            data-testid="web-remote-control-dialog-scroll"
            className="max-h-[calc(100vh-6rem)] min-h-0 overflow-y-auto p-5"
          >
            <DialogHeader className="space-y-2 pr-8">
              <div className="flex items-center gap-2">
                <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-primary">
                  <MonitorSmartphone className="size-5" />
                </div>
                <div className="space-y-1">
                  <DialogTitle>{intl.formatMessage({ id: "webRemoteControl.title" })}</DialogTitle>
                  <DialogDescription>
                    {intl.formatMessage({ id: "webRemoteControl.description" })}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div
              data-testid="web-remote-control-main-grid"
              className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]"
            >
              <section
                data-testid="web-remote-control-scan-card"
                className="flex min-h-[360px] flex-col rounded-xl border border-border bg-card p-4"
              >
                <div className="mb-4 flex items-start gap-2">
                  <Smartphone className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
                  <div className="min-w-0 space-y-1">
                    <div className="text-ui-base font-medium text-foreground">
                      {intl.formatMessage({
                        id: "webRemoteControl.mobileQr.title",
                      })}
                    </div>
                    <p className="text-ui-base/relaxed text-foreground-subtle">
                      {intl.formatMessage({
                        id: "webRemoteControl.mobileQr.description",
                      })}
                    </p>
                  </div>
                </div>
                <div
                  data-testid="web-remote-control-connection-card"
                  className="mb-3 rounded-lg bg-surface px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-ui-xs font-medium text-foreground-subtle">
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${relayStatusDotClassName}`}
                        />
                        <span className="truncate">{relayStatusLabel}</span>
                        {relayStatus?.serverUrl ? (
                          <span className="min-w-0 truncate opacity-70">
                            {relayStatus.serverUrl}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-ui-base/relaxed text-foreground-subtle">
                        {grantExpired
                          ? intl.formatMessage({ id: "webRemoteControl.relay.expired" })
                          : grant
                            ? intl.formatMessage(
                                { id: "webRemoteControl.relay.expiresIn" },
                                {
                                  minutes: Math.max(1, Math.ceil(grantRemainingSeconds / 60)),
                                },
                              )
                            : intl.formatMessage({ id: "webRemoteControl.relay.expiresHint" })}
                      </div>
                    </div>
                    {generating ? (
                      <LoaderCircle className="size-4 animate-spin text-foreground-subtle" />
                    ) : null}
                  </div>
                  {generateError ? (
                    <p className="mt-3 text-ui-base/relaxed text-destructive">{generateError}</p>
                  ) : null}
                  <div
                    data-testid="web-remote-control-copy-link-row"
                    className="mt-3 flex min-h-10 flex-wrap items-center gap-3 border-t border-border pt-3"
                  >
                    <div className="min-w-48 flex-1 text-ui-base/relaxed text-foreground-subtle">
                      {intl.formatMessage({
                        id: "webRemoteControl.copyLink.description",
                      })}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      className="shrink-0 gap-2 enabled:cursor-pointer"
                      onClick={() => void requestGrant()}
                      disabled={generating}
                    >
                      <RefreshCw className="size-3.5" />
                      {intl.formatMessage({ id: "webRemoteControl.relay.regenerate" })}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      className="shrink-0 gap-2 enabled:cursor-pointer"
                      onClick={() => void handleCopyLink()}
                      disabled={!grant?.url || generating}
                    >
                      <CopyIcon className="size-3.5" />
                      {intl.formatMessage({ id: "webRemoteControl.copyLink" })}
                    </Button>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-background-alt p-4">
                  {qrDataUrl && !grantExpired ? (
                    <img
                      src={qrDataUrl}
                      alt={intl.formatMessage({ id: "webRemoteControl.qrAlt" })}
                      className="size-64 max-w-full rounded-lg bg-white p-3"
                    />
                  ) : qrDataUrl && grantExpired ? (
                    <div className="flex flex-col items-center gap-3 text-center text-ui-base text-foreground-subtle">
                      <img
                        src={qrDataUrl}
                        alt={intl.formatMessage({ id: "webRemoteControl.qrAlt" })}
                        className="size-64 max-w-full rounded-lg bg-white p-3 opacity-30 grayscale"
                      />
                      <span>{intl.formatMessage({ id: "webRemoteControl.relay.expired" })}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-center text-ui-base text-foreground-subtle">
                      <LoaderCircle className="size-5 animate-spin" />
                      <span>
                        {intl.formatMessage({
                          id: "webRemoteControl.generating",
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <section className="flex min-h-[360px] flex-col rounded-xl border border-border bg-card p-4">
                <div className="mb-4 flex items-start gap-2">
                  <BotIcon className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
                  <div className="min-w-0 space-y-1">
                    <div className="text-ui-base font-medium text-foreground">
                      {intl.formatMessage({
                        id: "webRemoteControl.botChannel.title",
                      })}
                    </div>
                    <p className="text-ui-base/relaxed text-foreground-subtle">
                      {intl.formatMessage({
                        id: "webRemoteControl.botChannel.description",
                      })}
                    </p>
                  </div>
                </div>
                <div className="grid min-h-0 flex-1 gap-3">
                  {REMOTE_CONTROL_BOT_ENTRIES.map((entry) => {
                    const regionTagLabelId = getBotProviderRegionTagLabelId(entry.provider);

                    return (
                      <button
                        key={entry.provider}
                        type="button"
                        className="flex min-h-0 cursor-pointer items-start gap-3 rounded-lg border border-transparent bg-surface px-3 py-3 text-left transition-colors hover:border-input-border-focused hover:bg-surface-hover focus-visible:border-input-border-focused"
                        onClick={() => handleOpenBotEntry(entry.provider)}
                      >
                        <ProviderIcon provider={entry.provider} className="size-12 shrink-0" />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex min-w-0 items-center gap-1.5 text-ui-base font-medium text-foreground">
                            <span className="min-w-0 truncate">
                              {intl.formatMessage({
                                id: `webRemoteControl.botChannel.${entry.provider}.title`,
                              })}
                            </span>
                            {regionTagLabelId ? (
                              <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border px-2 text-ui-xs font-medium leading-none text-foreground-subtle">
                                {intl.formatMessage({ id: regionTagLabelId })}
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-ui-base/relaxed text-foreground-subtle">
                            {intl.formatMessage({
                              id: `webRemoteControl.botChannel.${entry.provider}.description`,
                            })}
                          </span>
                          <span className="block text-ui-base font-medium text-primary">
                            {intl.formatMessage({
                              id: "webRemoteControl.botChannel.configure",
                            })}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    data-testid="web-remote-control-open-bots"
                    className="w-full justify-center gap-2 enabled:cursor-pointer"
                    onClick={handleOpenBotsDialog}
                  >
                    <BotIcon className="size-3.5" />
                    {intl.formatMessage({
                      id: "webRemoteControl.botChannel.manageBots",
                    })}
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <BotsDialog
        open={botsDialogOpen}
        onOpenChange={setBotsDialogOpen}
        workspacePath={workspacePath}
        workspaceIdentity={workspaceIdentity}
        entryProvider={botEntryProvider}
      />
    </>
  );
});
