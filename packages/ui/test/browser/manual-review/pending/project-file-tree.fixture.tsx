import { Event, ProxyChannel } from "@zcode/rpc";
import { createRoot } from "react-dom/client";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { ProjectDirectoryProvider, ProjectSidebar } from "@/project-sidebar/index.js";
import { ServiceProvider } from "@/hooks/useServices.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import type { ProjectTree, ProjectSidebarProps } from "@/project-sidebar/contract.js";
import type { IServiceAccessor } from "@zcode/services";
import "@/styles.css";

// 「查看文件」接线验收（specs/sidebar-project-skeleton-swap.md 文件树面板挂点，2026-11-11
// bug 3b 修复）：真实 ProjectSidebar 链路，点击项目行查看文件 → 覆盖面板挂载（WorkspaceFileTree
// 在测试内被边界 mock 为可观测桩）→ 开合回传 onFileTreeOpenChange。远端回调 noop。
const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.className = `${theme} theme-zai-${theme}`;
const noop = () => {};
const dispose = () => ({ dispose: noop });

const tree: ProjectTree = {
  projects: [
    {
      id: "p1",
      hostId: "local",
      name: "alpha",
      nameOverridden: false,
      roots: [{ rootPath: "/repos/alpha", position: 0, isPrimary: true }],
      position: 0,
      pinned: false,
      deleted: false,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  tasks: [
    {
      taskId: "t1",
      workspacePath: "/repos/alpha",
      hostId: "local",
      projectId: "p1",
      title: "Alpha task",
      createdAt: 1,
      updatedAt: 30,
      pinned: false,
      archived: false,
    },
  ],
};
const fileTreeOpenChanges: boolean[] = [];

const tabState = {
  tabs: [],
  activeWorkspacePath: "/example",
  activeWorkspaceIdentity: null,
  openSettingsTab: noop,
};
const tabStore = { getState: () => tabState, subscribe: () => noop };
const services = {
  credentialService: ProxyChannel.toService({
    call: async <T,>() => null as T,
    listen: () => Event.None,
  }),
  settingService: {
    get: async () => ({}),
    update: async () => {},
  },
  projectService: {
    readTree: async () => structuredClone(tree),
    prepareSession: async () => ({
      workspacePath: "/example",
      projectId: null,
      additionalDirectories: [],
    }),
  },
  remoteProjectService: { readDirectory: async () => ({ hosts: [], entries: [] }) },
  broadcastService: { onMessage: dispose },
  zcodeTaskService: { onDynamicWorkspaceEvent: () => dispose },
} as unknown as IServiceAccessor;
Object.assign(window, {
  __renderFixture: { services, tabStore },
  __fileTreeOpenChanges: fileTreeOpenChanges,
});
useZCodeSessionStore.getState().setActiveTaskId("/example", "old-session");

const common = {
  workspacePath: "/example",
  theme,
  isDesktop: true,
  isWebRemoteControl: false,
  onSelectTask: noop,
  onStartDraftInWorkspace: noop,
  onCreateTask: noop,
  onCreateConversationTask: noop,
  onOpenFolderFromWorkspaceMenu: noop,
  onConnectRemote: async () => "remote",
  onSelectRemoteProject: async () => {},
  onCancelRemoteProject: async () => {},
  onReconnectRemoteWorkspace: async () => {},
  reconnectingRemoteWorkspaceKeys: [],
  remoteWorkspaceErrorByWorkspaceKey: {},
  onOpenCommandCenter: noop,
  onFileTreeOpenChange: (open: boolean) => {
    fileTreeOpenChanges.push(open);
  },
} satisfies ProjectSidebarProps;

function Fixture() {
  return (
    <ServiceProvider services={services}>
      <ProjectDirectoryProvider isDesktop>
        <div className="flex h-screen bg-background text-foreground">
          <div className="w-72 shrink-0 bg-sidebar">
            <ProjectSidebar {...common} />
          </div>
        </div>
      </ProjectDirectoryProvider>
    </ServiceProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <ZCodeIntlProvider initialLocale={params.get("locale") === "zh-CN" ? "zh-CN" : "en-US"}>
    <TooltipProvider>
      <Fixture />
    </TooltipProvider>
  </ZCodeIntlProvider>,
);
