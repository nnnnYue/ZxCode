# 自定义模型请求头

## 产品规则

- 入口：设置 → 基础设置 → 「自定义」分区（`groupId: "basics"`），内含「用户管理请求头」设置块。
- 开关（`customModelRequestHeadersEnabled`）默认关闭；关闭时编辑器隐藏、不注入任何自定义头（即"默认隐藏，点击开启后支持手动修改"）。
- 开启后展示 key-value 表格编辑器：每行为「名称 / 值」，可逐行删除、可在末尾追加空行；保存前做行内校验。
- 校验规则：
  - 名称非空，且匹配 HTTP header token（`^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$`）；
  - 值非空，且仅含可打印 ASCII（`[\x20-\x7e]`，与来源头 `normalizeZCodeSourceHeaderValue` 同约束）；
  - 名称不得重复（不区分大小写）；
  - 最多 32 条。
- 合并语义：**同名覆盖**（header 名不区分大小写）。默认来源头（`User-Agent` / `X-Title` / `HTTP-Referer` / `X-ZxCode-Agent`）全部保留，被用户同名值覆盖。
- 生效范围：**仅模型 API 请求**（agent runtime 发给模型供应商的请求）。后端 `NodeApiClient` 的来源头注入不在范围内。
- 生效时机：与 HTTP 代理设置同语义——桌面 host 在 spawn agent 时注入环境变量 `ZXCODE_MODEL_CUSTOM_HEADERS`，**下次启动 agent 生效**；保存成功后 UI 提示需重启 agent。
- 纯 CLI 用户可自行设置同一环境变量获得同等能力，不提供 UI。

## 状态所有者与接口

- 唯一持久化所有者：`AppSettings`（`packages/shared/src/validationAppSettings.ts` schema + `packages/shared/src/protocol.ts` 类型），经 `settingService` 写 `~/.zxcode/v2/setting.json`。UI 与 host 均只通过 `ISettingService` 读写，不落第二份事实。
- 下发接口：桌面 host `resolveSpawnEnv` → `buildAgentCustomModelHeadersEnv`（`packages/services/src/runtime-tools/agentProxyEnv.ts`）→ env `ZXCODE_MODEL_CUSTOM_HEADERS`，值为 JSON `Array<{name, value}>`（仅开关开启且列表非空时注入；值不写入任何日志）。
- 消费接口：agent 侧 `apps/zcode-cli/packages/bootstrap/src/model-config.ts` 的 `buildCliZCodeSourceHeaders` 读取该 env，经 `applyCustomModelRequestHeaders`（`packages/shared/src/zcode-source-headers.ts`）覆盖默认来源头后作为 AI SDK `defaultHeaders`。env 解析失败或条目非法时剔除该条目（fail-safe），不影响其余条目与默认头。

## 请求头合并优先级（后者胜出，均按名不区分大小写）

1. 默认来源头（`ZxCode/<版本>` 等，`buildCliZCodeSourceHeaders`）
2. 用户自定义头（本功能）
3. OpenRouter 归因头（baseURL 为 openrouter.ai 时）
4. Provider 配置 `api.headers`
5. 请求级 `ModelRequestAuth.headers`

## 不变量

- 关闭开关时，模型请求头与未引入本功能前逐字节一致。
- 用户自定义头不改变鉴权链路：`Authorization` / API key 仍由 provider `access` 与 `ModelRequestAuth` 管理；用户同名覆盖属其自身选择。
- UI 草稿态不直接写盘；保存是唯一写入路径，保存成功即已持久化。
- env 只在 spawn 时读取一次，运行中改设置不热更新（与代理/CA 一致）。

## 验收场景

1. 开关关闭：发起模型请求，header 与默认来源头完全一致；设置页不显示编辑器。
2. 开关开启并配置 `User-Agent: MyApp/1.0` 后保存、重启 agent：模型请求 `User-Agent` 为 `MyApp/1.0`，其余默认头（`X-Title` / `HTTP-Referer` / `X-ZxCode-Agent`）不变。
3. 配置非法条目（名称含空格、值含非 ASCII、重复名）时保存被阻止，或经 env 手工注入时该条目被剔除且默认头不受影响。
4. 清空全部行并保存、重启 agent：等价于关闭开关的行为。
5. 纯 CLI 设置 `ZXCODE_MODEL_CUSTOM_HEADERS='[{"name":"X-Title","value":"ZxCode@test"}]'` 后发起请求：`X-Title` 被覆盖，其余默认头保留。
