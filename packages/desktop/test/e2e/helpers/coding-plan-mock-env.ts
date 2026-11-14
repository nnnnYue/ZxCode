export const CODING_PLAN_TEAM_MOCK_BASE_URL_ENV = "ZCODE_CODING_PLAN_TEAM_MOCK_BASE_URL";
export const CODING_PLAN_UPGRADE_MOCK_BASE_URL_ENV = "ZCODE_CODING_PLAN_UPGRADE_MOCK_BASE_URL";

type MutableEnvironment = Record<string, string | undefined>;

const CODING_PLAN_COMMON_ENV_KEYS = [
  "ZXCODE_BASE_URL",
  "ZXCODE_ENDPOINT_ORIGIN",
  "ZCODE_TEST_BASE_URL",
  "BIGMODEL_API_BASE_URL",
  "ZCODE_E2E_CODING_PLAN_MOCK_URL",
] as const;

// 合并说明（v3.18.0）：采上游「用例在 fork 存活且非剔除域」的新增 marker
// （ssh-remote-cold-reconnect、remote-composer-plan-reselect、settings-ui-polish、
// side-pane-tabs-responsive-interactions）；拒会话分享域（share-* 三个）与
// fork 不存在对应用例的新增 marker（toolsearch、rpn、r3-mixed-entries、
// r3-mobile、ssh-disconnect-experience、highspeed 新增抽卡、provider-builtin-refresh-failure）。
const CODING_PLAN_TEAM_SPEC_MARKERS = [
  "conversation-session-ssh-remote-cold-reconnect.test.ts",
  // 远端 Composer 切回已生效套餐：本机与容器（经 SSH 反向隧道）共用同一账号 mock。
  "conversation-session-remote-composer-plan-reselect.test.ts",
  // 模拟登录态访问线上账号接口会触发 401 弹窗，遮挡 Logo 的真实 hover 和截图。
  "settings-ui-polish.test.ts",
  "side-pane-tabs-responsive-interactions.test.ts",
  "conversation-session-start-plan-independent.test.ts",
  // 创建埋点回归复用本地账号控制面，避免初始化/发送访问真实套餐与登录服务。
  "conversation-session-create-telemetry.test.ts",
  "conversation-session-automation-run-title-stable.test.ts",
  "coding-plan-team-usage.test.ts",
  "coding-plan-entitlement-presentation.test.ts",
  "provider-family-responsive.test.ts",
  // v3.18.2 合并说明：采上游新增 start-plan-cn-unlinked-login marker（用例与 fixture/helper
  // 已随本次合并入 fork）；继续拒 provider-builtin-refresh-failure（fork 无该用例，维持
  // v3.18.0 拍板，见上方合并说明）。
  // 国内新账号 Start 用例需要 Start balance 与 profile 都落在隔离账号控制面。
  "start-plan-cn-unlinked-login.test.ts",
  // Bugfix：登录后刷新子代理 catalog 的 case 与套餐用量 case 共用 team mock。
  // 抽取 spec 判定时必须保留该入口，否则单跑时 worker 会在业务断言前缺少 mock。
  "subagent-coding-plan-login-catalog-stale.test.ts",
  "conversation-session-model-provider-restart-recovery.test.ts",
  "conversation-session-model-provider-settings-transition.test.ts",
  "conversation-session-model-provider-effective-selection.test.ts",
  "conversation-session-worker-effective-selection.test.ts",
  "highspeed-owner-compat.test.ts",
  "highspeed-owner-ui-race.test.ts",
  "conversation-session-model-provider-turbo-recovery.test.ts",
  "conversation-session-model-provider-turbo-switch.test.ts",
  // Highspeed 抽卡 case 要按 Coding Plan 权益判定资格，缺 team mock 时抽卡入口不曝光。
  "conversation-session-highspeed-card.test.ts",
  "conversation-session-highspeed-card-draw-timeout.test.ts",
  "conversation-session-highspeed-card-draw-miss.test.ts",
  "conversation-session-model-provider-plan-surface.test.ts",
  // Bug 原因：连续切模回放也播种了模拟登录态；未隔离控制面时，线上 401
  // 会触发登录过期弹窗，遮住第二轮的模型菜单，导致与切模无关的失败。
  "conversation-session-active-model-context.test.ts",
  "conversation-session-off-peak-team-plan.test.ts",
  // Bug 原因：只有取票网关 mock，没有账号控制面，当前 Registry 会正确判定无闲时
  // 模型，导致 OffPeakCreate 不曝光。复用正常账号解析前置，不在产品里塞静态名单。
  "conversation-session-offpeak-create.test.ts",
  "conversation-session-offpeak-create-existing-session.test.ts",
  "conversation-session-offpeak-subagent-model-inheritance.test.ts",
  "conversation-session-off-peak-invalid-ticket.test.ts",
  "off-peak-create-manage.test.ts",
] as const;

export function shouldPrepareCodingPlanTeamMock(specs: readonly string[]) {
  return specs.some((spec) => {
    const normalized = spec.replaceAll("\\", "/").replace(/^\.\//u, "");
    return (
      // 场景 glob 在 launcher 尚未展开，需提前启动共用 mock；worker 仍按具体用例决定是否使用。
      (/^test\/e2e\/(?:\*\*\/|conversation-session\/|settings\/providers\/|automations\/|coding-plan\/|ui-shell\/)/u.test(
        normalized,
      ) &&
        /[*?[{]/u.test(normalized)) ||
      CODING_PLAN_TEAM_SPEC_MARKERS.some((marker) => normalized.includes(marker))
    );
  });
}

export function applyCodingPlanTeamMockEnv(environment: MutableEnvironment, baseUrl: string) {
  environment[CODING_PLAN_TEAM_MOCK_BASE_URL_ENV] = baseUrl;
  environment.ZXCODE_ENV = "test";
  for (const key of CODING_PLAN_COMMON_ENV_KEYS) {
    environment[key] = baseUrl;
  }
  environment.ZCODE_BIGMODEL_USAGE_QUOTA_URL = `${baseUrl}/api/monitor/usage/quota/limit`;
  environment.BIGMODEL_USAGE_QUOTA_URL = `${baseUrl}/api/monitor/usage/quota/limit`;
}

export function clearCodingPlanTeamMockEnv(environment: MutableEnvironment, baseUrl: string) {
  clearOwnedEnvironmentValues(environment, baseUrl, [
    ...CODING_PLAN_COMMON_ENV_KEYS,
    "ZCODE_BIGMODEL_USAGE_QUOTA_URL",
    "BIGMODEL_USAGE_QUOTA_URL",
  ]);
  if (environment[CODING_PLAN_TEAM_MOCK_BASE_URL_ENV] === baseUrl) {
    delete environment[CODING_PLAN_TEAM_MOCK_BASE_URL_ENV];
  }
}

export function applyCodingPlanUpgradeMockEnv(environment: MutableEnvironment, baseUrl: string) {
  environment[CODING_PLAN_UPGRADE_MOCK_BASE_URL_ENV] = baseUrl;
  for (const key of CODING_PLAN_COMMON_ENV_KEYS) {
    environment[key] = baseUrl;
  }
  environment.BIGMODEL_TEST_API_BASE_URL = baseUrl;
  environment.VITE_CODING_PLAN_WEBVIEW_ORIGIN = baseUrl;
  environment.ZAI_BUSINESS_BASE_URL = baseUrl;
}

// 采上游 v3.18.0：子 shard 的动态端口晚于父构建；构建决策和源码证据必须共用这个判据。
// codingPlanE2EMockEnv.test.ts 与 wdio.conf.ts 的 prepareDesktopAppBuild 都依赖它。
export function shouldReuseDesktopE2EBuild(environment: MutableEnvironment): boolean {
  return (
    environment.ZCODE_E2E_SKIP_BUILD === "1" &&
    !environment[CODING_PLAN_UPGRADE_MOCK_BASE_URL_ENV]?.trim()
  );
}

export function clearCodingPlanUpgradeMockEnv(environment: MutableEnvironment, baseUrl: string) {
  clearOwnedEnvironmentValues(environment, baseUrl, [
    ...CODING_PLAN_COMMON_ENV_KEYS,
    "BIGMODEL_TEST_API_BASE_URL",
    "VITE_CODING_PLAN_WEBVIEW_ORIGIN",
    "ZAI_BUSINESS_BASE_URL",
  ]);
  if (environment[CODING_PLAN_UPGRADE_MOCK_BASE_URL_ENV] === baseUrl) {
    delete environment[CODING_PLAN_UPGRADE_MOCK_BASE_URL_ENV];
  }
}

function clearOwnedEnvironmentValues(
  environment: MutableEnvironment,
  baseUrl: string,
  keys: readonly string[],
) {
  const ownedValues = new Set([baseUrl, `${baseUrl}/api/monitor/usage/quota/limit`]);
  for (const key of keys) {
    if (ownedValues.has(environment[key] ?? "")) {
      delete environment[key];
    }
  }
}
