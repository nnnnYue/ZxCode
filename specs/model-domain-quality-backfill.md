# 模型域纯质量修复回移（v3.17.2 遗留）

上游 v3.17.2 合并（`11e88869`）后 CLI 域整体回退 fork 基线（`0e57562a`），模型域 ~1280 行质量修复被连坐清零。本 spec 落档定向回移范围：只捞与智谱账号体系无关的纯质量修复（来源快照 `a9fe401e`），zhipu-account / off-peak / highspeed / 账号鉴权重试 / request-security / session-features 遥测头一律不引入。

## 产品规则

- 回移范围（八批）：
  1. retry-after 向后抖动（上限 20% 且 ≤5s）——修被限流的一批请求同一毫秒醒来再撞限流（2026-10 线上 1302 风暴）。
  2. workflow 未知业务码熔断——分类器不认识的业务码在同一次请求内**连续** 10 次即停（可 Resume），修 1113 事故 run 永挂；连续计数随 adapter 错误 context 带给 driver，driver 侧零改动。
  3. 额度重置时刻解析——从 1308/1310/1316 原文读北京时间重置时刻（±合理性窗口），Retry-After 优先。
  4. compact 修复组——手动 compact 的模型选择在命令接收边界固定（queue/startNow 两路径 intent 携带）；summary `$' $& $$` 替换语法破坏修复；摘要只格式化一次 + 保留段时效注记；压缩提示词第 6 节防捏造（assistant 里引用的 "user:" 台词不算真实用户消息）。
  5. reasoning-history——删孤儿 assistant / 空白 assistant 后只在删除点合并相邻一对 user（不多补 `\n`）；Model 装饰器改 `modelDescriptorOf` 强制键表复制（加字段漏抄变编译错）。
  6. git-snapshot 最小集——`.git` 文件系统向上判定（findGitRoot）+ realpath 修 symlink 误判 + git 超时/取消不再拼假快照；不含 PATH 过滤/hooks 禁用等安全加固特性。
  7. GLM 供应商内置工具线协议兼容全链——`provider-builtin-tool-compat`（server_tool_use/裸 tool_result → mcp_tool_use/mcp_tool_result 流改写）+ `provider-tool-rounds` core 消费链（切轮、落盘卡片、冷恢复、compact 分组 compactGroupKey）；只回 adapters 层会复现"结果被丢 + markdown 已剥"残缺态，两半必须同批。
  8. TTFT 传输层诊断（info 级 `ttft.model.*` 里程碑与 fetch 打点，只读关联头不记 URL/正文）+ fold 提醒折叠（Anthropic 协议把 tool result 后的 reminder 并入 tool result，OpenAI 兼容协议保持独立 user 消息）。
- 明确排除：off-peak 排队重试、账号鉴权重试、请求安全版、RuntimeHeadersRefreshError、streamTiming/firstContentAt 完整链、session-features 归因头、env 公告、genUi、context-prefix 重构、git 安全加固、MCP isolation/hook onError schema。

## 状态所有者与接口

- adapters：`runner-retry.ts`（抖动）、`workflow-model-failure-policy.ts`（熔断+quota，runner 门与 driver 裁决共用同一函数）、`runner-stream.ts`/`runner-generate.ts`（streak 串线）、`provider-builtin-tool-compat/`（新模块，零外部 import）、`anthropic-stream-compat.ts`（流改写注入）、`runner-normalization.ts`（providerExecuted → provider_tool_result）、`model-execution.ts`+`runner-status.ts`（TTFT 打点）、`reasoning-history-normalization.ts`、`tool-search.ts`（resolveModelRequestCapabilities）。
- contracts：`model/index.ts` ModelStreamEvent 加 `provider_tool_result` 变体；`model/model.ts` 加 `modelDescriptorOf` 与 `requestCapabilities.foldRemindersIntoToolResults`。
- core：`runtime/provider-tool-rounds/`（新模块）、`runtime/methods/{model,turn-model-step,turn-output-token-continuation,runtime-model,compact-active}.ts`、`agent/message-history.ts`（compactGroupKey）、`agent/session-history-hydrator.ts`、`helpers/{compact-selection,provider-request-messages,runtime-provider-request-messages}.ts`、`compact/prompt.ts`。
- bootstrap：`zcode-protocol-v4/commands/handlers/{goal-compact,queue}.ts`（compact 模型选择接收边界）。
- adapters/context：`git-snapshot.ts`、`context/index.ts`。

## 不变量

- 不引入任何已剔除域符号（回潜门禁 `check-no-zai-runtime-endpoints` 必须保持清零）。
- `provider-builtin-tool-compat` 与 `provider-tool-rounds` 模块已在 `architecture-policy.yaml` 预注册，依赖方向 compat ← anthropic-stream-compat、rounds ← runtime methods，不得反向。
- compact 模型选择只在命令接收边界读取一次（structuredClone 冻结），不消费草稿模式/Plan。
- 抖动只向后加，绝不早于 provider 要求的时间；`retry.jitter=false` 时保持精确值。

## 验收场景

- 每批独立 commit；分包 `tsc --noEmit`（adapters/core/bootstrap/contracts）零新增错误；定向 vitest 全绿（含上游移植用例：jitter、熔断连续计数、北京时间解析、`$` 保留、compact 模型选择冻结、内置工具端到端 SSE fixture、fold 折叠投影）。
- 打包前必须 `pnpm build:desktop-agent`；mac dmg 以 CDP 模拟点击冒烟（启动无控制台错误、composer 输入、模型菜单、发送回合）通过后再出 win 包。
