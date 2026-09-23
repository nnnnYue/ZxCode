import { create } from "zustand";

/**
 * PreviewPane 编辑态对外暴露的未保存守卫回调。
 * draft/baseline 本体仍唯一属于 PreviewPane 顶层 state，这里只登记关闭拦截所需的判定与保存动作，
 * 避免 side pane tab state 或持久化内存出现第二条内容写入路径。
 */
export interface PreviewEditGuard {
  isDirty: () => boolean;
  /** 执行保存并等待落盘；resolve false 表示保存失败，调用方必须中止关闭。 */
  save: () => Promise<boolean>;
}

interface PreviewEditGuardState {
  guardsByTabId: Record<string, PreviewEditGuard>;
  registerGuard: (tabId: string, guard: PreviewEditGuard) => void;
  unregisterGuard: (tabId: string) => void;
}

export const usePreviewEditGuardStore = create<PreviewEditGuardState>((set) => ({
  guardsByTabId: {},
  registerGuard: (tabId, guard) =>
    set((state) => ({ guardsByTabId: { ...state.guardsByTabId, [tabId]: guard } })),
  unregisterGuard: (tabId) =>
    set((state) => {
      if (!(tabId in state.guardsByTabId)) {
        return state;
      }
      const nextGuards = { ...state.guardsByTabId };
      delete nextGuards[tabId];
      return { guardsByTabId: nextGuards };
    }),
}));

/** 非订阅读取：关闭路径是命令式流程，直接取当前守卫而不触发 React 更新。 */
export function getPreviewEditGuard(tabId: string): PreviewEditGuard | null {
  return usePreviewEditGuardStore.getState().guardsByTabId[tabId] ?? null;
}

export function registerPreviewEditGuard(tabId: string, guard: PreviewEditGuard): void {
  usePreviewEditGuardStore.getState().registerGuard(tabId, guard);
}

export function unregisterPreviewEditGuard(tabId: string): void {
  usePreviewEditGuardStore.getState().unregisterGuard(tabId);
}
