# REMOVES.md — 社区版剔除域与 fork 合并回归账目

本仓库是上游 ZCode 的社区版（版本号带 `-ce` 后缀）。上游功能在 fork 中剔除时，以「必抛错 stub」保留导入合同；core 侧对应 port 保持可选。本文件记录剔除域清单、必须维持的不变量，以及因上游合并重新带回被剔除代码而造成的事故与处理，作为每次上游合并后的自查依据。

## 剔除域清单

| 剔除域                                      | stub 文件                                                                          | 现状                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| request-security → provider-runtime-headers | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/provider-runtime-headers.ts` | core 侧 `providerRuntimeHeadersPort` 可选，社区版不传（`undefined` 是正式路径，不是缺省降级） |
| off-peak                                    | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/offpeak-port.ts`             | 仅剩余 import 与类型引用，无运行时调用                                                        |

## 不变量

- stub 工厂只用于满足导入合同，**禁止在运行时调用**。调用点必须写成可选透传（`options.xxx` 直接传递），不允许 `?? createXxxStub(...)` 回落。
- 剔除域的 core 侧 port 必须保持可选且 `undefined` 分支可用；若上游把字段改为必选或在派生路径强制消费，属于 fork 冲突，需在合并时显式解决并记录到本文档。

## 事故记录

### 2026-11-26 offpeak 与 runtime-headers 必挂套件清理（v4.0.0-ce.1 复查顺带收口）

- `tests/offpeak-port.test.ts`（244 行）自 `a60ba6a7` 起针对已剔除实现断言：import 的 `OFF_PEAK_CREATE_*` 常量在 stub 中不存在，8 处直接调用 `createProtocolOffPeakPort(`（stub 必抛错），11/11 必挂并随 bootstrap `pnpm test` 全量入口发布。按自查清单第 2 条删除；CE 无对应合同可锁（生产代码零调用，清单第 1 条 grep 已覆盖不变量）。
- 同轮删除 `tests/zcode-protocol.test.ts` 中 2 个针对 provider-runtime-headers 上游真实实现的残留用例（「preserves unapplied zcode-plan runtime headers…」「returns per-request auth and distinct IDs…」，CE 上死于 port 为 undefined）；CE 调用点合同由 `workspace-model-runtime-provider-headers.test.ts` 锁定。

### 2026-11-26 createSession 全量失败（provider-runtime-headers stub 击穿命令执行）

- **症状**：UI 发送报「发送失败，请稍后重试。详情：fault.command.executionFailed」。实际观测：workspace `/Users/edward/work/workspace/2026/puachuran` 在 20:52–20:53 连续 33 次 `createSession` 失败，存量会话不受影响。
- **根因**：`createWorkspaceZCodeApp`（bootstrap `zcode-protocol/workspace-model-runtime.ts`）无条件回落构造必抛错 stub，每个 `createSession` 同步抛 `"provider-runtime-headers: removed in community edition"`；错误无领域 reasonCode，被 v4-gateway 归一成 `fault.command.executionFailed`，UI 只剩裸 reasonCode（SessionPane 抛 `new Error(ack.reasonCode)`，ack 里的原始 message 被丢弃）。
- **历史**：`813b5ed0`（2026-10-22）已修复同一问题；上游 v4.0.0 sync（`9f5a0926` / `a4b44451`）把上游的无条件构造原样带回，回归随 `23aa0480`（v4.0.0-ce.1 打包链修复）进入发布版。
- **处理**：调用点恢复可选透传；删除上游残留测试 `provider-runtime-headers-cancel.test.ts`（其 5 个用例全部针对已剔除的上游真实实现，在 CE 上 5/5 必挂），改写为 `workspace-model-runtime-provider-headers.test.ts` 锁定调用点合同（不传 port 不构造 stub、显式 port 原样透传）。

## 上游合并自查清单

合并上游、发版前逐项执行：

1. `grep -rn "removed in community edition" apps/ packages/` —— 每个命中只允许是 stub 文件自身与类型/import 引用；stub 工厂名后跟 `(` 的运行时调用一律不合规。
2. 重跑被剔除域相关包的测试：上游新增/改动的用例凡 import stub 的，要么删除要么改写为 CE 合同，不允许带着必挂的测试发版。
3. 全新会话冒烟：新建会话并发送一条消息，走通 `createSession → sendText` 全链（存量会话成功不代表新会话路径可用）。
