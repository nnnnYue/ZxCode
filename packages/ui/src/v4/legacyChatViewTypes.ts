/** 竖切后 ChatView 已删；保留 shell / command-center 仍引用的最小类型。 */
export interface ChatSearchResultHighlightRequest {
  requestId: number;
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  query: string;
  snippet?: string;
  snippetIndex?: number;
}

export interface ConversationFindMatchState {
  matchCount: number;
  activeIndex?: number;
}

// fork 保留：App/SessionPane 的摘要面板形态覆盖（panel/mini）仍依赖该类型。
export type ChatViewSummaryPanelVariant = "panel" | "mini";
