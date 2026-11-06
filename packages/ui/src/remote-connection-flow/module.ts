/**
 * remote-connection-flow 模块清单（architecture-governance managed 模块）。
 * 层：app。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 *
 * fork 最小落地：仅 contract + requestRemoteProjectConnection + 进度投影。
 * 上游 index.ts（2371 行连接向导编排）深度耦合 source-server 管理域
 * （useSourceServerManagementSnapshot/useSourceServerOperationLogs/sourceServerUpdateAction），
 * 按 spec「远程设备管理不合并」剔除不落盘；fork 连接编排沿用 Root 既有
 * useRemoteConnectionForm/RemoteConnectionDialogContent 链路，连接不可达时入口降级为空态。
 */
export const remoteConnectionFlowModule = {
  id: "remote-connection-flow",
  requires: ["shared", "ui"],
  provides: ["remote-connection-flow"],
  publicEntrypoints: ["contract.ts", "ui/RemoteConnectionProgress.tsx"],
} as const;
