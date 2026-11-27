import { expect, it, vi } from "vitest";
// 大型工厂模块在准备阶段加载，避免转换开销占用行为用例的超时预算。
import { createWorkspaceZCodeApp } from "../src/zcode-protocol/workspace-model-runtime.js";
import type { ZCodeProtocolAgentServerContext } from "../src/zcode-protocol/server-types.js";
import type { ZCodeAppOptions } from "../src/app/types.js";

const workspace = {
  workspacePath: "/work",
  workspaceIdentity: "ssh:host:/work",
  workspaceKey: "ssh:host:/work",
};

function createContext(createZCodeApp: unknown): ZCodeProtocolAgentServerContext {
  return {
    deps: { createZCodeApp },
    notify: vi.fn(),
  } as unknown as ZCodeProtocolAgentServerContext;
}

// 社区版剔除 provider runtime headers 后只剩必抛错 stub；createWorkspaceZCodeApp 一旦
// 回落构造该 port，所有 createSession/命令执行路径都会抛
// "provider-runtime-headers: removed in community edition"，并被 v4-gateway 归一成
// fault.command.executionFailed（UI 表现为"发送消息失败"）。上游 v4.0.0 合并曾冲掉
// 该修复（813b5ed0），账目见仓库根 REMOVES.md。
it("未提供 port 时不构造 stub，createZCodeApp 收到 undefined 而不是抛错", async () => {
  const createZCodeApp = vi.fn(async (_options: Omit<ZCodeAppOptions, "providerRegistry">) => ({}));
  await expect(
    createWorkspaceZCodeApp(createContext(createZCodeApp), workspace, {}),
  ).resolves.toBeDefined();
  expect(createZCodeApp).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ providerRuntimeHeadersPort: undefined }),
  );
});

it("显式提供的 port 原样透传，不做二次包装", async () => {
  const port = { refreshBeforeModelRequest: vi.fn() };
  const createZCodeApp = vi.fn(async (_options: Omit<ZCodeAppOptions, "providerRegistry">) => ({}));
  await createWorkspaceZCodeApp(createContext(createZCodeApp), workspace, {
    providerRuntimeHeadersPort: port as unknown as ZCodeAppOptions["providerRuntimeHeadersPort"],
  });
  expect(createZCodeApp.mock.calls[0]![0].providerRuntimeHeadersPort).toBe(port);
});
