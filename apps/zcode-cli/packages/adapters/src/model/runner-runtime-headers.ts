import type { ModelRequestAuth } from "@zcode/contracts";
import type { AiSdkModelTextRequest, ResolvedAiSdkModel } from "./runner-runtime.js";

export async function resolveModelForAttempt(input: {
  attempt: number;
  reason?: "model-request";
  request: AiSdkModelTextRequest;
  resolveModel: (requestAuth?: ModelRequestAuth) => ResolvedAiSdkModel;
}): Promise<ResolvedAiSdkModel> {
  const signal = input.request.abortSignal;
  signal?.throwIfAborted();
  return input.resolveModel();
}
