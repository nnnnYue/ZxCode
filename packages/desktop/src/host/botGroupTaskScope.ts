import type { WindowHostAttachmentScope } from "@zcode/shared";

/** 群控制复用已验证 attachment，不能由 RPC 调用方声明另一条远程会话。 */
export function bindBotGroupTaskScope<T extends object>(
  params: T,
  scope: WindowHostAttachmentScope,
): T {
  // 修复原因：上游 v3.17.2 给 WindowHostAttachmentScope 新增 source-settings 变体（源服务器
  // 设置连接，无远程会话三元组）。只有 remote 变体携带绑定所需字段；source-settings 与 local
  // 一样不注入远程 scope，避免在群控制里伪造另一条会话。
  return scope.kind === "remote"
    ? {
        ...params,
        workspacePath: scope.workspacePath,
        workspaceIdentity: scope.workspaceIdentity,
        remoteSessionId: scope.remoteSessionId,
      }
    : params;
}
