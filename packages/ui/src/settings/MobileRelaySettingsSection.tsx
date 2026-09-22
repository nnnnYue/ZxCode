import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { LoaderCircle, Smartphone } from "lucide-react";
import type { MobileRelaySettings, MobileRelayStatus } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Switch } from "@/components/ui/switch.js";
import { toast } from "@/components/ui/toast.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";

interface MobileRelaySettingsSectionProps {
  isDesktop: boolean;
  workspacePath?: string | null;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

interface GrantState {
  url: string;
  expiresAt: number;
  qrDataUrl: string;
}

/** 授权链接剩余有效秒数；过期后引导重新生成。 */
function useGrantCountdown(expiresAt: number | undefined): number {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) : 0,
  );
  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(0);
      return;
    }
    const tick = (): void =>
      setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return remainingSeconds;
}

export function MobileRelaySettingsSection({
  isDesktop,
  workspacePath,
  workspaceIdentity,
  remoteSessionId,
}: MobileRelaySettingsSectionProps) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const { settings, update: updateSettings } = useSettings();
  const [status, setStatus] = useState<MobileRelayStatus | null>(null);
  const [serverUrlDraft, setServerUrlDraft] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [savingConnection, setSavingConnection] = useState(false);
  const [grant, setGrant] = useState<GrantState | null>(null);
  const [requestingGrant, setRequestingGrant] = useState(false);
  const grantRequestSeqRef = useRef(0);

  const relaySettings: MobileRelaySettings | undefined = settings?.mobileRelay;
  const relaySupported = isDesktop && typeof platform.requestMobileRelayGrant === "function";

  useEffect(() => {
    setServerUrlDraft(relaySettings?.serverUrl ?? "");
    setTokenDraft(relaySettings?.token ?? "");
  }, [relaySettings?.serverUrl, relaySettings?.token]);

  const refreshStatus = useCallback(async () => {
    if (!relaySupported) return;
    try {
      const next = await platform.getMobileRelayStatus?.();
      if (next) setStatus(next);
    } catch {
      // 状态查询失败不阻塞设置编辑；下一次操作会再拉取。
    }
  }, [platform, relaySupported]);

  useEffect(() => {
    void refreshStatus();
    const timer = setInterval(() => void refreshStatus(), 10_000);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  const saveConnection = useCallback(
    async (next: { enabled?: boolean; serverUrl?: string; token?: string }) => {
      setSavingConnection(true);
      try {
        await updateSettings({
          mobileRelay: {
            enabled: next.enabled ?? relaySettings?.enabled ?? false,
            serverUrl: next.serverUrl ?? relaySettings?.serverUrl,
            token: next.token ?? relaySettings?.token,
          },
        });
        await refreshStatus();
      } catch (error) {
        toast(intl.formatMessage({ id: "settings.mobileRelay.saveFailed" }));
        throw error;
      } finally {
        setSavingConnection(false);
      }
    },
    [
      intl,
      refreshStatus,
      relaySettings?.enabled,
      relaySettings?.serverUrl,
      relaySettings?.token,
      updateSettings,
    ],
  );

  const requestGrant = useCallback(async () => {
    if (!workspacePath) {
      toast(intl.formatMessage({ id: "settings.mobileRelay.grantNoWorkspace" }));
      return;
    }
    const requestSeq = ++grantRequestSeqRef.current;
    setRequestingGrant(true);
    try {
      const result = await platform.requestMobileRelayGrant?.({
        workspacePath,
        ...(workspaceIdentity ? { workspaceIdentity } : {}),
        ...(remoteSessionId ? { remoteSessionId } : {}),
      });
      if (requestSeq !== grantRequestSeqRef.current) return;
      if (!result?.success || !result.url) {
        setGrant(null);
        toast(result?.error ?? intl.formatMessage({ id: "settings.mobileRelay.grantFailed" }));
        return;
      }
      const qrDataUrl = await QRCode.toDataURL(result.url, { margin: 1, width: 240 });
      if (requestSeq !== grantRequestSeqRef.current) return;
      setGrant({
        url: result.url,
        expiresAt: result.expiresAt ?? Date.now() + 10 * 60_000,
        qrDataUrl,
      });
    } catch {
      if (requestSeq === grantRequestSeqRef.current) {
        toast(intl.formatMessage({ id: "settings.mobileRelay.grantFailed" }));
      }
    } finally {
      if (requestSeq === grantRequestSeqRef.current) {
        setRequestingGrant(false);
      }
    }
  }, [intl, platform, remoteSessionId, workspaceIdentity, workspacePath]);

  const grantRemainingSeconds = useGrantCountdown(grant?.expiresAt);
  const grantExpired = grant !== null && grantRemainingSeconds <= 0;
  const connectionDirty =
    serverUrlDraft.trim() !== (relaySettings?.serverUrl ?? "") ||
    tokenDraft.trim() !== (relaySettings?.token ?? "");

  const statusText = useMemo(() => {
    if (!relaySupported) {
      return intl.formatMessage({ id: "settings.mobileRelay.statusUnsupported" });
    }
    if (!relaySettings?.enabled || !relaySettings.serverUrl) {
      return intl.formatMessage({ id: "settings.mobileRelay.statusDisabled" });
    }
    if (status?.connected) {
      return intl.formatMessage({ id: "settings.mobileRelay.statusConnected" });
    }
    return status?.lastError
      ? intl.formatMessage({ id: "settings.mobileRelay.statusError" }, { error: status.lastError })
      : intl.formatMessage({ id: "settings.mobileRelay.statusConnecting" });
  }, [intl, relaySettings?.enabled, relaySettings?.serverUrl, relaySupported, status]);

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.mobileRelay.enable" })}
          description={intl.formatMessage({ id: "settings.mobileRelay.enableDescription" })}
          control={
            <Switch
              checked={Boolean(relaySettings?.enabled)}
              disabled={!relaySupported || savingConnection}
              onCheckedChange={(enabled) => void saveConnection({ enabled })}
            />
          }
          detail={
            <div className="text-ui-base text-foreground-subtle">
              {statusText}
              {relaySettings?.serverUrl ? (
                <span className="ml-2 break-all font-mono text-ui-sm">
                  {relaySettings.serverUrl}
                </span>
              ) : null}
            </div>
          }
        />
        <SettingsRow
          controlLayout="wide"
          label={intl.formatMessage({ id: "settings.mobileRelay.serverUrl" })}
          description={intl.formatMessage({ id: "settings.mobileRelay.serverUrlDescription" })}
          control={
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={!relaySupported || savingConnection || !connectionDirty}
              onClick={() =>
                void saveConnection({ serverUrl: serverUrlDraft.trim(), token: tokenDraft.trim() })
              }
            >
              {savingConnection ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {intl.formatMessage({ id: "settings.mobileRelay.save" })}
            </Button>
          }
          detail={
            <div className="flex flex-col gap-2">
              <Input
                placeholder="https://relay.example.com"
                value={serverUrlDraft}
                disabled={!relaySupported || savingConnection}
                onChange={(event) => setServerUrlDraft(event.target.value)}
              />
              <Input
                placeholder={intl.formatMessage({ id: "settings.mobileRelay.tokenPlaceholder" })}
                type="password"
                value={tokenDraft}
                disabled={!relaySupported || savingConnection}
                onChange={(event) => setTokenDraft(event.target.value)}
              />
            </div>
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard>
        <SettingsRow
          label={intl.formatMessage({ id: "settings.mobileRelay.grant" })}
          description={intl.formatMessage({ id: "settings.mobileRelay.grantDescription" })}
          control={
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={!relaySupported || !status?.connected || requestingGrant}
              onClick={() => void requestGrant()}
            >
              {requestingGrant ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Smartphone className="size-4" aria-hidden="true" />
              )}
              {intl.formatMessage({
                id: grant ? "settings.mobileRelay.regenerate" : "settings.mobileRelay.generate",
              })}
            </Button>
          }
          detail={
            grant ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                {/* qrcode 生成的 data URL，无远程资源。 */}
                <img
                  alt="relay grant qr"
                  className="size-40 shrink-0 rounded-lg border border-border bg-white p-2"
                  src={grant.qrDataUrl}
                />
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="break-all font-mono text-ui-sm text-foreground-subtle">
                    {grant.url}
                  </div>
                  <div className="text-ui-base text-foreground-subtle">
                    {grantExpired
                      ? intl.formatMessage({ id: "settings.mobileRelay.grantExpired" })
                      : intl.formatMessage(
                          { id: "settings.mobileRelay.grantCountdown" },
                          { seconds: grantRemainingSeconds },
                        )}
                  </div>
                </div>
              </div>
            ) : null
          }
        />
      </SettingsGroupCard>
    </div>
  );
}
