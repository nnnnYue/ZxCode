import type {
  ProjectRowAction,
  RemoteProjectDirectory,
  VirtualProject,
} from "@/project-sidebar/contract.js";

/**
 * fork 适配：上游本 hook 是数据同步（skills/mcp/plugins）菜单入口，依赖 data-sync 域
 * （useDataSyncEntry）。data-sync 属 fork 剔除域（REMOVALS 八），remoteProjectService 也是
 * 空目录桩（远端项目不可达），故保留接口形状、恒返回空动作与无弹窗，消费方无需分支。
 */
export function useProjectRemoteSync(_directory: RemoteProjectDirectory): {
  actions: (project: VirtualProject) => ProjectRowAction[];
  dialog: null;
} {
  return { actions: () => [], dialog: null };
}
