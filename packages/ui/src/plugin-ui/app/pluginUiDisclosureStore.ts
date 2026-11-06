/**
 * 用户对插件卡片的手动固定 / 收起（renderer 视图态，不持久化）。
 * 键为 sessionKey + toolCallId；true = 固定常驻（不进折叠区），false = 收起（进折叠区），未记录按默认规则
 * （强制常驻 / 最近三回合自动展开）。资源级 `showInline` 在句柄到达时也写成 true（只在没有手动记录时）。
 */
const pinsBySession = new Map<string, ReadonlyMap<string, boolean>>();
const emptyPins: ReadonlyMap<string, boolean> = new Map();
const listeners = new Set<() => void>();
// fork 兼容层：v4 时间线仍以全局版本号作为 useSyncExternalStore 快照；快照 API 上游新增，v4 消费方留待后续迁移。
let version = 0;

export function getPluginUiManualPin(sessionKey: string, toolCallId: string): boolean | undefined {
  return getPluginUiDisclosureSnapshot(sessionKey).get(toolCallId);
}

export function setPluginUiManualPin(
  sessionKey: string,
  toolCallId: string,
  pinned: boolean | undefined,
): void {
  const previous = getPluginUiDisclosureSnapshot(sessionKey);
  if (previous.get(toolCallId) === pinned) return;
  const next = new Map(previous);
  if (pinned === undefined) next.delete(toolCallId);
  else next.set(toolCallId, pinned);
  if (next.size === 0) pinsBySession.delete(sessionKey);
  else pinsBySession.set(sessionKey, next);
  version += 1;
  for (const listener of listeners) listener();
}

/** 原全局版本把其他会话的固定操作传播到当前时间线；快照只随所属会话变化。 */
export function getPluginUiDisclosureSnapshot(sessionKey: string): ReadonlyMap<string, boolean> {
  return pinsBySession.get(sessionKey) ?? emptyPins;
}

/** fork 兼容：全局递增版本号，任一会话的固定操作变化都递增。 */
export function getPluginUiDisclosureVersion(): number {
  return version;
}

export function subscribePluginUiDisclosure(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 测试用：清空全部记录。 */
export function resetPluginUiDisclosureForTest(): void {
  pinsBySession.clear();
  listeners.clear();
  version = 0;
}
