/**
 * 手机远控 grant bootstrap（自部署 relay 链路）。
 *
 * 背景：自部署 relay 的手机入口是 `/?remote=<grantId>`，手机页面只与 relay 建立一条
 * 字节管道，relay 不解析 RPC。grant 的 payload 正是桌面签发时声明的 attach target，
 * 其中带工作区事实；手机端据此才知道该渲染哪个工作区（Root 的 initialWorkspaceAbsPath /
 * initialWorkspaceIdentity），否则 Root 没有任何 workspace tab，页面只剩空壳。
 *
 * 端点语义：只读不消费。grant 的消费仍只发生在 `/ws/remote/<grantId>` 的 WS 握手上。
 * 凭据是 grant 本身（32 字节随机串），持有者本来就能 attach 到该工作区。
 */

export interface RemoteGrantBootstrapResult {
  initialWorkspaceAbsPath?: string;
  initialWorkspaceIdentity?: string;
}

interface RemoteGrantBootstrapPayload {
  workspacePath?: string;
  workspaceIdentity?: string;
}

export async function resolveRemoteGrantBootstrap(
  grantId: string,
  options?: {
    fetchImpl?: typeof fetch;
    /** relay origin；默认同源（手机页面与 relay 同端口托管）。 */
    origin?: string;
  },
): Promise<RemoteGrantBootstrapResult> {
  const trimmed = grantId.trim();
  if (!trimmed) {
    return {};
  }
  const fetchImpl = options?.fetchImpl ?? fetch;
  const origin = options?.origin ?? "";
  try {
    const response = await fetchImpl(
      `${origin}/api/remote/bootstrap/${encodeURIComponent(trimmed)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return {};
    }
    const payload = (await response.json()) as RemoteGrantBootstrapPayload;
    const workspacePath = payload.workspacePath?.trim();
    if (!workspacePath) {
      return {};
    }
    const workspaceIdentity = payload.workspaceIdentity?.trim();
    return {
      initialWorkspaceAbsPath: workspacePath,
      ...(workspaceIdentity ? { initialWorkspaceIdentity: workspaceIdentity } : {}),
    };
  } catch {
    // bootstrap 只是增强信息：取不到时不能连累手机页整体失败，按无工作区继续启动。
    return {};
  }
}
