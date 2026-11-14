import type { IPluginManagementService } from "@zcode/services";
import type { ZCodePluginScope } from "@zcode/shared";
import { logger } from "@/logger.js";
import type { PluginManagementState } from "@/store/pluginManagementStore.js";

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function buildWorkspaceKey(workspacePath: string, workspaceIdentity: string | null): string {
  return workspaceIdentity?.trim() || workspacePath;
}

const inFlightLoads = new Map<string, Promise<void>>();

export async function runWorkspaceOperation(
  set: (partial: Partial<PluginManagementState>) => void,
  get: () => PluginManagementState,
  pluginService: IPluginManagementService,
  operationId: string,
  operation: (workspace: { workspacePath: string; workspaceIdentity?: string }) => Promise<void>,
): Promise<boolean> {
  const { workspacePath, workspaceIdentity, configScope } = get();
  if (!workspacePath) return false;
  const operationVersion = get().operationVersion + 1;
  set({ operationId, operationVersion, error: null, lastFailedPluginId: null });
  const isCurrentContext = (): boolean => {
    const current = get();
    return (
      current.workspacePath === workspacePath &&
      current.workspaceIdentity === workspaceIdentity &&
      current.configScope === configScope
    );
  };
  const ownsVisibleOperation = (): boolean =>
    isCurrentContext() && get().operationId === operationId;
  try {
    await operation({
      workspacePath,
      ...(workspaceIdentity ? { workspaceIdentity } : {}),
    });
    // operationId 只是共享的 UI 忙碌指示器。自动刷新可能在当前操作完成前覆盖它，
    // 但不能因此把已经成功落盘的添加/安装操作报告成失败，否则调用方会保留弹窗。
    if (!isCurrentContext()) return false;
    await loadInto(set, get, {
      workspacePath,
      workspaceIdentity,
      configScope,
      pluginService,
    });
    return isCurrentContext();
  } catch (error) {
    // marketplace add/update 等通用操作失败：无插件目标，归属清空。
    logger.error("[plugins] operation failed", { operationId, error: toMessage(error) });
    // 旧操作不能覆盖同一配置层中新操作的错误态；只有仍持有可见 operationId 的操作才回写。
    if (ownsVisibleOperation()) {
      set({ error: toMessage(error), lastFailedPluginId: null });
    }
    return false;
  } finally {
    // 防止旧操作结束时清掉后来操作的忙碌态。
    // Scope/workspace 切换后当前上下文可能已经变化，不能再用 isCurrentContext 判断；
    // 只要 operationId 仍然属于这次已结束的操作，就应该清掉它。否则用户在 User
    // 配置保存完成、刷新尚未结束时切到 Workspace，新的配置视图会一直被旧操作锁成只读。
    if (get().operationId === operationId && get().operationVersion === operationVersion) {
      set({ operationId: null });
    }
  }
}

export async function loadInto(
  set: (partial: Partial<PluginManagementState>) => void,
  get: () => PluginManagementState,
  params: {
    workspacePath: string;
    workspaceIdentity: string | null;
    configScope: ZCodePluginScope | null;
    pluginService: IPluginManagementService;
  },
): Promise<void> {
  const workspaceKey = buildWorkspaceKey(params.workspacePath, params.workspaceIdentity);
  const loadKey = `${workspaceKey}\u0000${params.configScope ?? "effective"}`;
  const existing = inFlightLoads.get(loadKey);
  if (existing) {
    logger.debug("[plugins] join in-flight list", {
      configScope: params.configScope,
      workspaceKey,
    });
    await existing;
    return;
  }
  const loadTask = runLoadInto(set, get, { ...params, workspaceKey });
  inFlightLoads.set(loadKey, loadTask);
  try {
    await loadTask;
  } finally {
    if (inFlightLoads.get(loadKey) === loadTask) {
      inFlightLoads.delete(loadKey);
    }
  }
}

async function runLoadInto(
  set: (partial: Partial<PluginManagementState>) => void,
  get: () => PluginManagementState,
  params: {
    workspacePath: string;
    workspaceIdentity: string | null;
    configScope: ZCodePluginScope | null;
    workspaceKey: string;
    pluginService: IPluginManagementService;
  },
): Promise<void> {
  const setIfCurrent = (partial: Partial<PluginManagementState>): void => {
    const current = get();
    if (
      current.workspacePath !== params.workspacePath ||
      current.workspaceIdentity !== params.workspaceIdentity ||
      current.configScope !== params.configScope
    ) {
      return;
    }
    set(partial);
  };
  // React StrictMode、settings service 引用刷新或快速切换设置页时，
  // 同一 workspace 会并发触发 initialize。每次触发都发成独立 plugins/list 的话，
  // agent 已经 stale 时这些请求会排队产生多个 30s timeout。按 workspaceKey 复用 in-flight
  // 请求，并在仍处于同一 workspace 时才回写结果，避免过期响应覆盖当前设置页。
  // 移植自上游 v3.18.0（b95ebaff）：列表的单插件协议错误曾把 Promise.all 连坐拒绝，
  // 丢弃已成功的 overview 目录并退化为 list-only fallback，已安装插件面板被整体清空。
  // 改为 allSettled 分别收口：失败接口只记入聚合错误，成功接口照常回写，失败接口不在这里重复请求。
  const [listResult, overviewResult] = await Promise.allSettled([
    params.pluginService.listPlugins({
      workspacePath: params.workspacePath,
      ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
      ...(params.configScope ? { configScope: params.configScope } : {}),
    }),
    params.pluginService.getPluginsOverview({
      workspacePath: params.workspacePath,
      ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
      ...(params.configScope ? { configScope: params.configScope } : {}),
    }),
  ]);
  const errors: string[] = [];
  for (const [method, result] of [
    ["list", listResult],
    ["overview", overviewResult],
  ] as const) {
    if (result.status === "rejected") {
      const message = toMessage(result.reason);
      errors.push(message);
      logger.error(`[plugins] ${method} failed`, {
        workspacePath: params.workspacePath,
        workspaceKey: params.workspaceKey,
        error: message,
      });
    }
  }
  const list = listResult.status === "fulfilled" ? listResult.value : undefined;
  const overview = overviewResult.status === "fulfilled" ? overviewResult.value : undefined;
  setIfCurrent({
    plugins: list?.plugins ?? [],
    marketplaces: overview?.marketplaces ?? [],
    // overview 失败时空数组表示“来源状态未知”，而不是“所有来源已删除”；保留该边界，
    // 避免把仍在工作的已安装插件误判为孤立安装。overview 成功则目录状态是已知的。
    marketplaceAvailabilityKnown: overview !== undefined,
    availablePlugins: overview?.availablePlugins ?? [],
    installedPlugins: overview?.installedPlugins ?? [],
    restorableBuiltins: overview?.restorableBuiltins ?? [],
    diagnostics: [...(list?.diagnostics ?? []), ...(overview?.diagnostics ?? [])],
    loading: false,
    // fork 适配：成功路径沿用 fork 现状不回写 error（initialize/refresh 已预清，自动刷新
    // 不能抹掉并发操作的可见错误）；只有接口失败时写入聚合错误，归属清空（不指向任何插件）。
    ...(errors.length > 0 ? { error: errors.join("\n"), lastFailedPluginId: null } : {}),
  });
}
