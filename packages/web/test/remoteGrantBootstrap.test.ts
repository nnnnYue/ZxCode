import { describe, expect, it, vi } from "vitest";
import { resolveRemoteGrantBootstrap } from "../src/remoteGrantBootstrap.js";

/**
 * 手机远控 grant bootstrap：手机端靠它拿到「该渲染哪个工作区」。
 * 端点只读不消费 grant，失败时必须降级为无工作区而不是让手机页整体失败。
 */
describe("resolveRemoteGrantBootstrap", () => {
  it("返回 grant 声明的工作区路径与身份", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          workspacePath: "/Users/dev/project",
          workspaceIdentity: "remote:ssh:host:/Users/dev/project",
          workspaceKey: "remote:ssh:host:/Users/dev/project",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(resolveRemoteGrantBootstrap("grant-1", { fetchImpl: fetchImpl as never })).resolves.toEqual(
      {
        initialWorkspaceAbsPath: "/Users/dev/project",
        initialWorkspaceIdentity: "remote:ssh:host:/Users/dev/project",
      },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/remote/bootstrap/grant-1",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("grant 无效（404）时降级为无工作区", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 }));
    await expect(
      resolveRemoteGrantBootstrap("grant-missing", { fetchImpl: fetchImpl as never }),
    ).resolves.toEqual({});
  });

  it("请求异常时降级为无工作区而不是抛错", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      resolveRemoteGrantBootstrap("grant-x", { fetchImpl: fetchImpl as never }),
    ).resolves.toEqual({});
  });

  it("空 grant id 不发请求", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(
      resolveRemoteGrantBootstrap("   ", { fetchImpl: fetchImpl as never }),
    ).resolves.toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
