// 合并说明（v3.18.0）：采上游目录重组适配（** 递归 glob、MANUAL_REVIEW_SPEC_GLOB、
// 任意深度 ssh-remote 匹配、显式选择判定）；拒上游 e2e-remote-target-specs.json 远程队列
// 清单——fork 已裁剪该队列（127 项仅 8 项存活），保留 fork 的 SSH 凭据准入与无 json 架构。
export const SSH_FORMAL_SPEC_GLOB =
  "./test/e2e/conversation-session/**/conversation-session-ssh-remote*.test.ts";
// Bug 根因：逐领域枚举漏掉新增候选目录，导致单进程全量与分片正式集合不一致。
export const MANUAL_REVIEW_SPEC_GLOB = "./test/e2e/**/manual-review/**/*.test.ts";

const REQUIRED_SSH_E2E_ENV = [
  "ZCODE_E2E_SSH_HOST",
  "ZCODE_E2E_SSH_USERNAME",
  "ZCODE_E2E_SSH_PASSWORD",
];

export function hasRequiredSshE2EEnvironment(env) {
  return REQUIRED_SSH_E2E_ENV.every((name) => env[name]?.trim());
}

export function isSshFormalSpec(spec) {
  const normalized = spec.replaceAll("\\", "/");
  return /\/conversation-session\/(?:[^/]+\/)*conversation-session-ssh-remote/u.test(normalized);
}

/** 默认正式集合的环境准入：manual-review 候选未转正；ssh-remote 正式用例只要凭据。 */
export function isFormalSpecAdmittedByEnvironment(spec, env) {
  // 场景 glob 会递归命中候选；分片展开为显式文件前必须排除，不能把目录迁移当作转正。
  if (spec.replaceAll("\\", "/").includes("/manual-review/")) return false;
  if (isSshFormalSpec(spec)) return hasRequiredSshE2EEnvironment(env);
  return true;
}

export function resolveEnvironmentGatedFormalSpecExcludes({ env, targeted }) {
  // 修复原因：SSH P0 依赖真实服务器，默认全量在无凭据时纳入只会把环境缺失
  // 误记为三个产品失败；显式定向运行仍保留 helper 的缺变量 fail-closed 提示。
  return !targeted && !hasRequiredSshE2EEnvironment(env) ? [SSH_FORMAL_SPEC_GLOB] : [];
}

/** 目录 glob 是批量回归；只有逐个指定文件才覆盖环境门禁并按缺配置报错。 */
export function isExplicitE2ESpecSelection(specs) {
  return specs.length > 0 && specs.every((spec) => !/[*?[{]/u.test(spec));
}
