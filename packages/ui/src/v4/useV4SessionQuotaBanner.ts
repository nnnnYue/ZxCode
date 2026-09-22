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
  resolveQuotaBannerUpgradeProviderId,
  shouldOfferQuotaBannerUpgrade,
} from "@/v4/sessionQuotaBannerState.js";
import type { McpUnavailableNotice } from "@/v4/mcpUnavailableBannerNotice.js";
import { logger } from "@/logger.js";
import { sessionQuotaBannerDismissalStore } from "@/v4/sessionQuotaBannerDismissalStore.js";
import { startPlanQuotaReminderStore } from "@/v4/startPlanQuotaReminderStore.js";

function isGlmQuotaBannerProviderId(providerId: string | null): boolean {
  return (
    providerId === BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan ||
    providerId === BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan ||
    providerId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan ||
    providerId === BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan
  );
}

/**
 * V4 quota 业务状态：conversation snapshot 只提供当前 provider/model/错误，额度仍由
 * entitlement 服务读取。两者在 renderer 合并，不把购买或额度状态写回 conversation。
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

  // 去平台化：usageStatsService 已随账号/Coding Plan 网关删除，权益快照恒为空；
  // banner 的可见性只由会话错误里的服务端业务码（额度耗尽/并发受限）驱动。
  const reminderVersion = useSyncExternalStore(
    startPlanQuotaReminderStore.subscribe,
    startPlanQuotaReminderStore.getSnapshot,
    startPlanQuotaReminderStore.getSnapshot,
  );
  // 展示实例随任务/模型切换而更新；余额刷新不能生成新实例，否则会立即收起当前提醒。
  const reminderOwner = useMemo(
    () => ({ sessionId: params.sessionId, activeProviderId, modelId }),
    [params.sessionId, activeProviderId, modelId],
  );
  const state = useMemo(
    () =>
      buildSessionQuotaBannerState({
        activeProviderId,
        snapshot: null,
        modelId,
        isReminderHidden: (key, referenceTime) =>
          startPlanQuotaReminderStore.isHidden(key, reminderOwner, referenceTime),
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
      reminderOwner,
      reminderVersion,
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
  const previousReminderKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const previousKey = previousReminderKeyRef.current;
    previousReminderKeyRef.current = state.reminderKey;
    // 已展示的提醒退出后结束展示实例，避免余额回升再降低时在同一周期重复弹出。
    if (previousKey && previousKey !== state.reminderKey) {
      startPlanQuotaReminderStore.dismiss(previousKey);
    }
  }, [state.reminderKey]);
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

  const upgradeProviderId = resolveQuotaBannerUpgradeProviderId(activeProviderId);

  // 权益快照已随 usageStatsService 删除恒为空，顶配套餐（terminal/max plan）检测不再可用；
  // 升级入口退化为常量文案，由 buildSessionQuotaBannerState 的 kind 决定是否展示。

  const dismiss = useCallback(() => {
    if (state.reminderKey) {
      // 点击关闭本身证明用户已看到提示，避免可见性回调尚未执行时关闭无效。
      if (state.reminderExpiresAt !== undefined && state.reminderReferenceTime !== undefined) {
        startPlanQuotaReminderStore.markShown(
          state.reminderKey,
          state.reminderExpiresAt,
          reminderOwner,
          state.reminderReferenceTime,
        );
      }
      startPlanQuotaReminderStore.dismiss(state.reminderKey);
      return;
    }
    if (!params.sessionId || !dismissKey) return;
    sessionQuotaBannerDismissalStore.dismiss(params.sessionId, dismissKey);
  }, [
    dismissKey,
    params.sessionId,
    reminderOwner,
    state.reminderKey,
    state.reminderExpiresAt,
    state.reminderReferenceTime,
  ]);

  const markShown = useCallback(() => {
    if (
      state.reminderKey &&
      state.reminderExpiresAt !== undefined &&
      state.reminderReferenceTime !== undefined
    ) {
      startPlanQuotaReminderStore.markShown(
        state.reminderKey,
        state.reminderExpiresAt,
        reminderOwner,
        state.reminderReferenceTime,
      );
    }
  }, [reminderOwner, state.reminderExpiresAt, state.reminderKey, state.reminderReferenceTime]);

  return {
    state,
    dismissKey,
    dismissed,
    dismiss,
    markShown,
    takesOverError,
    upgradeProviderId: shouldOfferQuotaBannerUpgrade(state.kind) ? upgradeProviderId : null,
    upgradeActionLabelId: "chat.quota.action.upgrade",
  } as const;
}
