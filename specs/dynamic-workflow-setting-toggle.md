# 动态工作流设置开关

## 产品规则

- 入口：设置 → 基础设置 → 「系统」分区（`GeneralSectionContent`），开关名「工作流（实验）」。
- 开关（`dynamicWorkflowEnabled`）默认关闭；关闭时应用与未引入本功能前行为一致：自动化页只有平铺「自动化」标题（不渲染单项 tablist），会话内模型无动态工作流工具面。
- 定位是**用户侧实验功能开关**，不是运营灰度：去平台化后（提交 3c58a21）动态工作流灰度不再有 z.ai 远端配置来源，本开关以本地设置替代之，语义从"灰度放量"改为"实验功能，用户显式开启"。
- 生效时机：**Host 进程粒度，重启后生效**。开关改变的是之后 fork 的 Host（新窗口、重启应用、定时调度 Host）的档位；已运行 Host、已建立的远端 workspace 连接维持旧档位，重启应用 / 重连后对齐。设置项描述明示"重启后生效"。
- 构建档位策略（main 在 fork Host 前写定 `ZXCODE_DYNAMIC_WORKFLOW_MODE` env，Host 只消费不分辨来源）：
  - **production**：读用户设置。开启 → 写 `alwaysOn`；关闭 → 不写，且继承值仍被删除（防 shell 环境变量走私）。
  - **preview**：固定写 `alwaysOn`，忽略用户设置（preview 用户始终拥有该功能，现状不变）。
  - **未打包 dev**：shell 里的合法覆盖优先（便于手工切档）；无覆盖时回落用户设置。
- 纯 Web / server Host（无 desktop main）直接读自身进程环境（运维/开发者设置），与 `dynamic-workflow-feature.ts` 既有注释语义一致。

## 状态所有者与接口

- 唯一持久化所有者：`AppSettings.dynamicWorkflowEnabled`（`packages/shared/src/protocol.ts` 类型 + `validationAppSettings.ts` schema），经 `ISettingService` 写 `~/.zxcode/v2/setting.json`。UI 只经 `ISettingService` 读写，不落第二份事实。
- main 内存快照：desktop main 启动时 bootstrap 读一次，`syncImmediateAppSettings` 分支更新——仅供后续 fork Host 时计算 env，不参与任何运行时裁决。
- env 注入接口：`buildHostProcessEnv`（`packages/desktop/src/main/desktopRuntimeEnv.ts`）在两个 Host fork 点（`desktopHostProcess.ts` 窗口 Host、`desktopCronScheduler.ts` 调度 Host）按档位写定 `ZXCODE_DYNAMIC_WORKFLOW_MODE`；远端经 `pickRemoteRuntimeEnv`（`packages/server/src/remote/connect.ts`）白名单透传，SSH/WSL/Docker 远端 Host 与本地同档位。
- 裁决接口：Host 装配层（`packages/services/src/node.ts` createLocalServices）以 `process.env` + shared 纯函数 `resolveDynamicWorkflowClientConfig`（优先级：env 覆盖 > 远端（已无来源，恒 undefined）> disabled 缺省）构造快照，注入 `createZCodeAgentService` 的 `resolveDynamicWorkflowClientConfig` 选项。**Host 是唯一决策者**。
- 会话侧消费：`resolveDynamicWorkflowGate`（`zcodeAgentService.ts`，进程内闩住一次）→ `workspace/updateDynamicWorkflowPolicy` + session flag（模型工具面）。旧 CLI -32601 降级路径不变。
- UI 侧消费：`IZCodeAgentService.getDynamicWorkflowClientConfig()` 返回同一份快照 → Root app 级 loader（`useDynamicWorkflowAvailabilityLoader`，app 级 accessor 唯一取数）→ `dynamicWorkflowAvailabilityStore`（renderer 唯一副本，只读）→ 自动化页标题切换 / SessionPane / WorkflowRunSidePane。
- 同源不变式的实现依据：快照在 Host 进程内构造一次（`process.env` 进程内不可变），gate 与 UI 方法共用同一份，不会出现"界面有入口 / 模型没工具"分歧。

## 不变量

- UI `enabled` 与会话 gate `enabled` 恒等（同一份 Host 快照）。
- fail-closed：env 缺失、非法值、读取异常一律按 disabled；UI loader 请求失败按未命中处理且不记仇（换 service 实例重试）。
- production 下关闭开关时，Host env 中不存在 `ZXCODE_DYNAMIC_WORKFLOW_MODE`（继承值删除），行为与未引入本功能前逐字节一致。
- 关闭（或未开启）时：自动化页回退平铺 h1「自动化」；sessionStorage 残留的 "workflow" tab 记忆被 clamp 回 "automation"（AutomationsSection 既有逻辑）；不渲染单项 tablist、不留方向键切换。
- env 只在 Host fork 时写定，运行中改设置不热更新；gate 闩不因设置变化拆解。
- 开关状态不跨窗口广播：各窗口 Host 在下次 fork 时读取 main 内存快照，重启后全局一致。

## 验收场景

1. 开关关闭（默认）+ 重启：自动化页无 tab 切换；新会话模型无动态工作流工具面；与现状一致。
2. 开关开启 + 重启：自动化页标题变为「自动化 / 工作流」切换（SessionPane / WorkflowRunSidePane 入口同步出现）；新会话模型获得动态工作流工具面；`workspace/updateDynamicWorkflowPolicy` 下发 enabled。
3. 保存开关时 toast 提示"重启后生效"；不重启时已运行窗口不变。
4. preview 打包档：无论开关状态，功能恒开。
5. dev 下 shell 设置合法 `ZXCODE_DYNAMIC_WORKFLOW_MODE=onDemand`：覆盖用户设置，快照 `source: "override"`。
6. dev 下设置非法 env 值：丢弃后回落用户设置档位。
7. production 下关闭开关：Host 进程 env 不含该键（继承值被删除）。
8. 远端 workspace（SSH/WSL/Docker）：开启 + 重启后新建的远端连接与本地同档位；已建立连接在重连前维持旧档位。
9. 旧 CLI（协议方法 -32601）：策略同步降级不阻断客户端就绪，整体退回 disabled。
10. 开启后切到「工作流」tab 再关闭开关 + 重启：自动化页回到平铺标题，无悬空 tab 状态。
