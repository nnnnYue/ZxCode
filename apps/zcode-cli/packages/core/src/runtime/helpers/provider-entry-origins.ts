import { parseRuntimeInputPresentation } from "@zcode/contracts";
import {
  isKnownSystemReminderSource,
  isRuntimeAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../agent/message-history.js";
import {
  formatIncomingMessage,
  isMidTurnInputPresentation,
} from "../../system-reminder/incoming-message.js";
import {
  getSystemReminderDescriptor,
  wrapSystemReminderForSource,
} from "../../system-reminder/source.js";

const INCOMING_MESSAGE_SOURCE = "incoming_message";

/** 仅单次请求拥有的投影映射；不写入 canonical history 或 provider payload。 */
export class ProviderEntryOrigins {
  private readonly origins = new WeakMap<RuntimeMessageEntry, readonly RuntimeMessageEntry[]>();

  get(entry: RuntimeMessageEntry): readonly RuntimeMessageEntry[] {
    return this.origins.get(entry) ?? [entry];
  }

  set(entry: RuntimeMessageEntry, inputs: readonly RuntimeMessageEntry[]): void {
    this.origins.set(
      entry,
      inputs.flatMap((input) => this.get(input)),
    );
  }

  hasRealUser(entry: RuntimeMessageEntry): boolean {
    return this.get(entry).some(isCanonicalRealUser);
  }

  representative(entry: RuntimeMessageEntry): RuntimeMessageEntry | undefined {
    const entries = this.get(entry);
    return (
      entries.findLast(isCanonicalRealUser) ??
      entries.findLast((item) => !isRuntimeAttachmentEntry(item))
    );
  }
}

function isCanonicalRealUser(entry: RuntimeMessageEntry): boolean {
  return (
    !isRuntimeAttachmentEntry(entry) &&
    entry.queryScope !== "output_token_continuation" &&
    entry.message.role === "user" &&
    !entry.message.toolCallId &&
    !entry.message.toolName &&
    (!entry.metadata || entry.metadata.source === "real_user")
  );
}

export function isPresentedInput(entry: RuntimeMessageEntry): boolean {
  return parseRuntimeInputPresentation(entry.metadata?.inputPresentation) !== undefined;
}

/**
 * 投影后仍是 user 消息的输入（真实 prompt、child 任务、新轮通知）。
 * 只看投影后的 entry 本身：投影成 attachment 的中途消息与 MCS 降级块都不算。
 * 不看来源映射：user_steer 的来源是 real_user，投影成 attachment 后不是 prompt。
 */
export function isUserInputMessage(entry: RuntimeMessageEntry): boolean {
  if (isRuntimeAttachmentEntry(entry) || entry.message.role !== "user") return false;
  // 带媒体的中途消息只能保留 user 消息形态，合并规则仍同 attachment。
  if (entry.metadata?.source === INCOMING_MESSAGE_SOURCE) return false;
  // compact summary 是普通 user 消息，前一条 user 文本同样以换行结尾。
  // 按 compactBoundary 判断，不按来源：summary 与旧的后台通知都用 legacy_synthetic。
  if (entry.metadata?.compactBoundary) return true;
  return isCanonicalRealUser(entry) || isPresentedInput(entry);
}

export function isReminderMessage(entry: RuntimeMessageEntry): boolean {
  const source = entry.metadata?.source;
  if (!isKnownSystemReminderSource(source)) return false;
  const descriptor = getSystemReminderDescriptor(source);
  return descriptor.isMeta && descriptor.channel !== "real_user";
}

export function projectIncomingMessageEntries(
  entries: readonly RuntimeMessageEntry[],
  origins: ProviderEntryOrigins,
): RuntimeMessageEntry[] {
  return entries.map((entry) => {
    if (isRuntimeAttachmentEntry(entry) || entry.message.role !== "user") return entry;
    const presentation = parseRuntimeInputPresentation(entry.metadata?.inputPresentation);
    if (!presentation) return entry;
    const content = entry.message.content;
    if (typeof content !== "string" && content.some((block) => block.type !== "text")) return entry;
    const body =
      typeof content === "string"
        ? content
        : content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
    const formatted = formatIncomingMessage(body, presentation);
    // 新轮通知不经过 Attachment 包装；在同一投影边界补齐标签与转义，保持 user 身份和原始历史。
    const text =
      presentation === "task_notification"
        ? wrapSystemReminderForSource(INCOMING_MESSAGE_SOURCE, formatted)
        : formatted;
    const projected: RuntimeMessageEntry = isMidTurnInputPresentation(presentation)
      ? {
          kind: "attachment",
          content: text,
          metadata: { source: INCOMING_MESSAGE_SOURCE, inputPresentation: presentation },
        }
      : { ...entry, message: { ...entry.message, content: text } };
    origins.set(projected, [entry]);
    return projected;
  });
}
