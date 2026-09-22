interface RootStartupGateState {
  isRestoring: boolean;
  isBootstrappingInitialWorkspace: boolean;
}

interface RootStartupLoadingVisibilityState extends RootStartupGateState {
  isDesktop: boolean | undefined;
}

interface FallbackWorkspaceCreateState {
  isMounted: boolean;
  activeWorkspacePath: string | null;
}

export function shouldBlockRootRender(state: RootStartupGateState): boolean {
  return state.isRestoring || state.isBootstrappingInitialWorkspace;
}

export function shouldShowRootStartupLoading(state: RootStartupLoadingVisibilityState): boolean {
  // 启动阻塞是桌面窗口保护期；Web 端不在 Root 层遮挡，避免 workspace tab 注入前露出浏览器白底。
  return Boolean(state.isDesktop) && shouldBlockRootRender(state);
}

export function shouldOpenFallbackWorkspaceAfterCreate(
  state: FallbackWorkspaceCreateState,
): boolean {
  return state.isMounted && !state.activeWorkspacePath;
}
