// fork：request-security/model-runtime-headers 已随域剔除。
// 此 stub 满足导入合同；所有方法返回空值，不发起任何 provider 认证流程。
import type { AgentRuntimeInternal } from "../internal.js";

type AgentRuntimeStub = AgentRuntimeInternal & Record<string, unknown>;

export function createRefreshRuntimeHeadersBeforeModelAttempt(
  _rt: AgentRuntimeStub,
) {
  return async () => {};
}

export function createProviderRuntimeHeadersPort(_rt: AgentRuntimeStub) {
  return { port: undefined as unknown as MessagePort };
}
