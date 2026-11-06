/**
 * project-sidebar 模块清单（architecture-governance managed 模块）。
 * 层：ui。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const projectSidebarModule = {
  id: "project-sidebar",
  requires: [
    "services",
    "shared",
    "ui",
    "conversation-workspace-target",
    "web-remote-control-ui",
    "remote-connection-flow",
    // fork 剔除域：policy 登记保留 data-sync 引用（Phase 3a adopt 时的上游对齐面）；
    // 代码已不再 import data-sync，策略行的清理随 Phase 3d 退役一起处理。
    "data-sync",
  ],
  provides: ["project-sidebar"],
  publicEntrypoints: [
    "index.tsx",
    "contract.ts",
    "remote-project-connection.ts",
    "useSavedWorkflowProjectOptions.ts",
    "RemoteProjectMenu.tsx",
    "WorkspaceDragOverlay.tsx",
    "useRemoteProjectConnectionPresentation.ts",
    "OfflineRemoteProjectRows.tsx",
    "RemoteConversationDisconnected.tsx",
  ],
} as const;
