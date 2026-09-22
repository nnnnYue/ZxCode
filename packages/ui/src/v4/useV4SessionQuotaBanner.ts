import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { BUILTIN_MODEL_PROVIDER_IDS, isStartPlanModelProviderId } from "@zcode/shared";
import type { SessionErrorInfo, SessionPhase } from "@zcode/shared/zcode-protocol-v4";
import {
  resolveGlmQuotaBannerBusinessCode,
  resolveStartPlanConcurrentLimitBannerReason,
  resolveStartPlanConcurrentLimitBusinessCode,
  resolveStartPlanQuotaExhaustedBusinessCode,
} from "@/lib/providerBusinessError.js";
import {
  buildSessionQuotaBannerDismissKey,
  buildSessionQuotaBannerState,
} from "@/v4/sessionQuotaBannerState.js";
import type { McpUnavailableNotice } from "@/v4/mcpUnavailableBannerNotice.js";
import { logger } from "@/logger.js";
import { sessionQuotaBannerDismissalStore } from "@/v4/sessionQuotaBannerDismissalStore.js";

function isGlmQuotaBannerProviderId(providerId: string | null): boolean {
  return (
    providerId === BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan ||
    providerId === BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan ||
    providerId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan ||
    providerId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan
  );
}

/**
 * V4 quota 业务状态：可见性只由会话错误里的服务端业务码与官方 MCP tool row 事实驱动。
 * 权益快照（entitlement）已随去平台化删除，不参与 banner 计算。
 */
export function useV4SessionQuotaBanner(params: {
  sessionId: string | null;
  error: SessionErrorInfo | null;
  errorKey: string | null;
  phase: SessionPhase | null;
  providerId: string | null;
  modelId: string | null;
  /**
   * 官方 Server MCP 不可用的事实。由调用方从 conversation rows 解析——它是会话事件的投影，
   * 与额度服务无关，不放进这个 hook 里取。
   */
  mcpUnavailableNotice?: McpUnavailableNotice | null;
}) {
  const activeProviderId = params.providerId?.trim() || null;
  const modelId = params.modelId?.trim() || null;
  const isStartPlanProvider = Boolean(
    activeProviderId && isStartPlanModelProviderId(activeProviderId),
  );
  const quotaExhaustedCode = resolveStartPlanQuotaExhaustedBusinessCode(
    params.error?.code,
    params.error?.message,
  );
  const concurrentLimitCode = resolveStartPlanConcurrentLimitBusinessCode(
    params.error?.code,
    params.error?.message,
  );
  const providerLimitedCode = resolveGlmQuotaBannerBusinessCode(params.error?.code);
  const serverQuotaExhausted = quotaExhaustedCode === "1005" && isStartPlanProvider;
  const serverConcurrentLimited = Boolean(concurrentLimitCode) && isStartPlanProvider;
  const serverProviderLimited = Boolean(
    providerLimitedCode && isGlmQuotaBannerProviderId(activeProviderId),
  );
  const takesOverError = serverQuotaExhausted || serverConcurrentLimited || serverProviderLimited;

  const state = useMemo(
    () =>
      buildSessionQuotaBannerState({
        activeProviderId,
        modelId,
        serverQuotaExhausted,
        serverConcurrentLimited,
        ...(concurrentLimitCode ? { serverConcurrentLimitBusinessCode: concurrentLimitCode } : {}),
        ...(concurrentLimitCode
          ? {
              serverConcurrentLimitReason: resolveStartPlanConcurrentLimitBannerReason(
                params.error?.message,
              ),
            }
          : {}),
        ...(providerLimitedCode ? { serverProviderLimitedBusinessCode: providerLimitedCode } : {}),
        ...(serverProviderLimited
          ? { serverProviderLimitedMessage: params.error?.message ?? null }
          : {}),
        ...(params.mcpUnavailableNotice
          ? { mcpUnavailableNotice: params.mcpUnavailableNotice }
          : {}),
      }),
    [
      activeProviderId,
      concurrentLimitCode,
      modelId,
      params.error?.message,
      params.mcpUnavailableNotice,
      providerLimitedCode,
      serverConcurrentLimited,
      serverProviderLimited,
      serverQuotaExhausted,
    ],
  );

  const dismissKey = buildSessionQuotaBannerDismissKey(
    state,
    takesOverError ? params.errorKey : null,
  );
  useSyncExternalStore(
    sessionQuotaBannerDismissalStore.subscribe,
    sessionQuotaBannerDismissalStore.getSnapshot,
    sessionQuotaBannerDismissalStore.getSnapshot,
  );
  const dismissed = Boolean(
    params.sessionId &&
    dismissKey &&
    sessionQuotaBannerDismissalStore.isDismissed(params.sessionId, dismissKey),
  );
  const restoredDismissalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dismissed || !params.sessionId || !dismissKey) return;
    const fingerprint = `${params.sessionId}\u0000${dismissKey}`;
    if (restoredDismissalRef.current === fingerprint) return;
    restoredDismissalRef.current = fingerprint;
    logger.debug("session quota banner dismissal restored", {
      dismissKey,
      sessionId: params.sessionId,
    });
  }, [dismissKey, dismissed, params.sessionId]);

  const dismiss = useCallback(() => {
    if (!params.sessionId || !dismissKey) return;
    sessionQuotaBannerDismissalStore.dismiss(params.sessionId, dismissKey);
  }, [dismissKey, params.sessionId]);

  return {
    state,
    dismissKey,
    dismissed,
    dismiss,
    takesOverError,
  } as const;
}
