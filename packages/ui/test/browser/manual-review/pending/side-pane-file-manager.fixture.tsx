import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { IServiceAccessor } from "@zcode/services";
import { AnimatedSidePanePanel } from "@/app-shell/AnimatedSidePanePanel.js";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.js";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import {
  openFileManagerSidePane,
  stampSidePaneTabsOwnership,
  type FileManagerTarget,
  type WorkspaceSidePaneState,
} from "@/lib/workspaceSidePane.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import type { PanelImperativeHandle } from "react-resizable-panels";
import "@/styles.css";

const params = new URLSearchParams(location.search);
document.documentElement.classList.add(`theme-zai-${params.get("theme") ?? "light"}`);
const workspacePath = "/workspace/example";
const workspaceIdentity = "fixture-workspace";
const noop = () => {};
// AnimatedSidePanePanel 只在对应 tab 分支消费 services；file-manager fixture 不触达。
const services = {} as IServiceAccessor;

const target: FileManagerTarget = {
  workspacePath,
  workspaceName: "example",
  workspaceIdentity,
};

// 桩掉 WorkspaceFileTree/PreviewPane 的重依赖边界：本验收只覆盖 file-manager tab 的
// 渲染接线（AnimatedSidePanePanel → FileManagerPane → 目录树/预览/导航回调），
// 数据链与文件树本体由 PFT-1 与 e2e 覆盖。
(window as Record<string, unknown>).__fileManagerNavigations = [];
(window as Record<string, unknown>).__fileManagerClosedTabs = [];

function Fixture() {
  const [sidePaneState, setSidePaneState] = useState<WorkspaceSidePaneState | null>(() =>
    stampSidePaneTabsOwnership(openFileManagerSidePane(null, target), {
      workspaceKey: workspaceIdentity,
      ownerTaskId: "session-fixture",
    }),
  );
  const panelRef = useRef<PanelImperativeHandle | null>(null);
  const panelElementRef = useRef<HTMLDivElement | null>(null);
  return (
    <main className="h-screen min-w-0 bg-background text-foreground">
      <output data-testid="navigations" hidden>
        {JSON.stringify((window as Record<string, unknown>).__fileManagerNavigations)}
      </output>
      <div data-testid="panel-fixture" className="h-5/6 min-w-0">
        <ResizablePanelGroup layoutId="file-manager-fixture" orientation="horizontal">
          <ResizablePanel defaultSize={40}>
            <div />
          </ResizablePanel>
          <AnimatedSidePanePanel
            services={services}
            isVisible
            isDesktop
            mobileOverlay={false}
            sidePaneState={sidePaneState}
            recentClosedSidePaneTabs={[]}
            isBrowserOpen={false}
            supportsEmbeddedBrowser={false}
            workspaceAbsPath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            workspaceRemoteSessionId={undefined}
            activeTaskId="session-fixture"
            sidePaneOwnerId="session-fixture"
            gitState={{} as Parameters<typeof AnimatedSidePanePanel>[0]["gitState"]}
            activeGitSourceId="unstaged"
            panelRef={panelRef}
            panelElementRef={panelElementRef}
            browserNavigationRequest={null}
            browserRestoreUrls={{}}
            fileChangeFindActiveIndex={0}
            fileChangeFindNavigationRequestId={0}
            fileChangeFindQuery=""
            onFileChangeFindMatchCountChange={noop}
            onCloseCodeViewer={noop}
            onCloseGit={noop}
            onNavigateFileManager={(tabId, source) => {
              (window as Record<string, unknown>).__fileManagerNavigations.push({ tabId, source });
              setSidePaneState((current) =>
                current
                  ? {
                      ...current,
                      tabs: current.tabs.map((tab) =>
                        tab.id === tabId && tab.type === "file-manager" ? { ...tab, source } : tab,
                      ),
                    }
                  : current,
              );
            }}
            onActivateTab={(id) =>
              setSidePaneState((current) => (current ? { ...current, activeTabId: id } : current))
            }
            onReorderTab={noop}
            onCloseTab={(tabId) => {
              (window as Record<string, unknown>).__fileManagerClosedTabs.push(tabId);
            }}
            onCloseOtherTabs={noop}
            onCloseAllTabs={noop}
            onReopenClosedTab={noop}
            onOpenBrowserTab={noop}
            onOpenWhiteboard={noop}
            onOpenDeveloperTools={noop}
            onOpenTerminalTab={noop}
            onOpenReviewTab={noop}
            onOpenSelectionSideConversation={noop}
            onOpenBrowserUrl={noop}
            onOpenCodeViewer={noop}
            onRefreshGit={noop}
            onBrowserNavigationRequestHandled={noop}
            onBrowserUrlChange={noop}
            onBrowserPageMetadataChange={noop}
            onSelectGitSource={noop}
          />
        </ResizablePanelGroup>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <ZCodeIntlProvider initialLocale={params.get("locale") === "zh-CN" ? "zh-CN" : "en-US"}>
    <TooltipProvider>
      <Fixture />
    </TooltipProvider>
  </ZCodeIntlProvider>,
);

export type { CodeViewerSource };
