/**
 * request-security-edition-cli 标准调用示例：agent 靠模仿写代码，这里放的就是该模仿的那份。
 */
import { createModelRequestSecurityState } from "./contract.js";

// 消费方在未注入 requestSecurityState 时取无行为默认实现（model-execution.ts 的构造路径）：
// 请求安全校验域在本仓被剔除，transport 原样透传、验证原因 take 恒为空、重试预算恒为 0。
export function exampleRequestSecurityEditionCli(): ReturnType<
  ReturnType<typeof createModelRequestSecurityState>["createExecution"]
> {
  return createModelRequestSecurityState().createExecution({});
}
