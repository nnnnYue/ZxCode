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
    // fork 剔除域遗留的 data-sync 行已随侧栏换骨架 Phase 3d 退役清理：
    // 代码从未经它建立依赖，policy 与本清单同步删除（策略修正，非豁免）。
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
