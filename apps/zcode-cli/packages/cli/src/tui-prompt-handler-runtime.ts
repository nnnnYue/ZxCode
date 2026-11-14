// tui-prompt-handler.ts 顶到 oxlint max-lines 上限（400 行），把 createApp 里
// 「读 dotenv → 定位要恢复的会话 → 装 bootstrap 模块 → 起 Provider Registry
// 常驻运行时 → 读默认模型选择」这段进程级准备拆到本文件；
// 公开面仍从 tui-prompt-handler.ts 导出。
import { loadBootstrapModule } from "./bootstrap-loader.js";
import { loadCliDotenv } from "./env.js";
import { resolveResumeSession } from "./resume.js";
import type { CliResumeRequest, RunDependencies } from "./cli-types.js";

type ProviderRegistryRuntime = Awaited<
  ReturnType<NonNullable<RunDependencies["startProcessProviderRegistryRuntime"]>>
>;

// 跨 App 替换（/new、/resume、/fork）复用的进程级句柄：整个 Prompt Handler 生命期只起一份，
// 只在终态 close 时对称 shutdown。之前是 createTuiSubmitPrompt 里的三个 let 闭包变量。
// providerEndpointRoutingPort 句柄已随 endpoint-routing-edition 域剔除删除（fork 剔除轮
// d88237c7），bootstrap 不再导出 createDefaultProviderEndpointRoutingPort，全仓无实现方。
interface TuiProcessRuntimeState {
  providerRegistryRuntimePromise: Promise<ProviderRegistryRuntime> | undefined;
}

export const createTuiProcessRuntimeState = (): TuiProcessRuntimeState => ({
  providerRegistryRuntimePromise: undefined,
});

// 返回值类型交给推断：原地 createApp 里这几个都是推断出来的局部变量，手写接口反而会把
// 品牌类型（SessionId）和 createZCodeApp 的联合签名收窄错。
// `version` 形参改名 `_version`：fork 剔除轮删掉了遥测接线（prepareZCodeTelemetryEnv），
// endpoint 路由端口构造（唯一用 version 作 appVersion 的地方）也随 endpoint-routing-edition
// 域剔除删除，形参保留只为不破坏 createTuiSubmitPrompt 的既有调用位（tui-prompt-handler.ts）。
export async function prepareTuiAppRuntime(
  deps: RunDependencies,
  _version: string,
  request: CliResumeRequest,
  state: TuiProcessRuntimeState,
) {
  const env = deps.env ?? process.env;
  const workingDirectory = (deps.cwd ?? process.cwd)();
  const dotenvResult = (deps.loadDotenv ?? loadCliDotenv)({
    cwd: workingDirectory,
    env,
  });

  if (dotenvResult.error) {
    throw new Error(`Failed to load environment file: ${dotenvResult.path}`, {
      cause: dotenvResult.error,
    });
  }

  const sessionId = await resolveResumeSession(request, workingDirectory, env, deps);
  const bootstrapModule = deps.createZCodeApp ? undefined : await loadBootstrapModule();
  const createAppFactory = deps.createZCodeApp ?? bootstrapModule?.createZCodeApp;
  if (!createAppFactory) throw new Error("ZxCode app factory is unavailable.");
  const startProviderRegistryRuntime =
    deps.startProcessProviderRegistryRuntime ??
    bootstrapModule?.startProcessProviderRegistryRuntime;
  if (!startProviderRegistryRuntime) {
    throw new Error("Provider Registry runtime is unavailable.");
  }
  state.providerRegistryRuntimePromise ??= startProviderRegistryRuntime(
    env,
    deps.skipUserConfig
      ? {}
      : {
          standalone: {
            ...(deps.userConfigPath ? { legacyCliUserConfigFilePath: deps.userConfigPath } : {}),
          },
        },
  );
  const providerRegistryRuntime = await state.providerRegistryRuntimePromise;
  const configuredDefaultModelSelection = providerRegistryRuntime?.modelSelectionConfigRepository
    ? await providerRegistryRuntime.modelSelectionConfigRepository.read()
    : providerRegistryRuntime?.configuredDefaultModelSelection;
  // endpoint 路由端口构造已随 endpoint-routing-edition 域剔除删除（fork 剔除轮 d88237c7）；
  // 宿主仍可经 ZCodeAppOptions.providerEndpointRoutingPort 注入。

  return {
    appEnv: env,
    configuredDefaultModelSelection,
    createAppFactory,
    providerRegistryRuntime,
    sessionId,
    workingDirectory,
  };
}
