# request-security-edition-cli

模型请求安全（request verification）域的发行版垫片：本 fork 剔除了上游的请求安全校验行为，
但保留 model-execution 等消费方对 `request-security-edition` 引用点的消费形状，使后续上游
同步保持机械可对比。真实类型与端口定义在同目录的 `../request-security.ts`。

不变量：

- 本目录只放「上游存在、本 fork 无行为」的占位实现：transport 原样透传、验证原因恒为空、
  重试预算恒为 0；任何真实行为都应落在 `request-security.ts` 的端口实现里，而不是这里。
- 公开面只有 `index.ts` 与 `contract.ts`；消费方不得深导入 `recovery.ts`。
