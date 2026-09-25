// 动态工作流的构建档位折叠：desktop main 在 fork Host / scheduler 前把
// 「用户设置 + 构建档位 + shell 覆盖」折算成一个 env 决策。独立成叶子模块
// 是为了 node --test 直测——desktopRuntimeEnv.ts 拖着 electron 等启动期依赖。
// 规则见 specs/dynamic-workflow-setting-toggle.md。
import { normalizeDynamicWorkflowMode, ZXCODE_DYNAMIC_WORKFLOW_MODE_ENV } from "@zcode/shared";

/**
 * Dynamic Workflow 的开启决策按构建档位分层
 *
 *   - 未打包 dev：shell 里的合法取值优先（方便手工切档；非法值直接丢弃而不是转发给 Host，
 *     Host 因此不必再判一次来源），无覆盖时回落用户设置 `dynamicWorkflowEnabled`；
 *   - 打包 preview：固定写入 `alwaysOn`，忽略 shell 与用户设置，preview 用户始终拥有该功能；
 *   - 打包 production：读用户设置——开启写 `alwaysOn`，关闭不写入，且继承值必须被删除，
 *     否则本机环境变量就能自行打开该功能（用户显式在设置页开启才是产品行为）。
 * Main 是唯一决策者：对这个键只有「写」和「删」两种动作，绝不原样透传，
 * Host 端的 resolveDynamicWorkflowClientConfig 才能无条件相信读到的值。
 */
export function resolveDynamicWorkflowModeHostEnv(options: {
  inheritedValue: string | undefined;
  isPackaged: boolean;
  isPreview: boolean;
  userEnabled: boolean;
}): Record<string, string> {
  if (!options.isPackaged) {
    const mode = normalizeDynamicWorkflowMode(options.inheritedValue);
    if (mode) return { [ZXCODE_DYNAMIC_WORKFLOW_MODE_ENV]: mode };
    return options.userEnabled ? { [ZXCODE_DYNAMIC_WORKFLOW_MODE_ENV]: "alwaysOn" } : {};
  }
  if (options.isPreview) {
    return { [ZXCODE_DYNAMIC_WORKFLOW_MODE_ENV]: "alwaysOn" };
  }
  return options.userEnabled ? { [ZXCODE_DYNAMIC_WORKFLOW_MODE_ENV]: "alwaysOn" } : {};
}
