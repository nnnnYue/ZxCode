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

// PRG（specs/project-restore-guide.md）：空项目 + 未归类任务的存量形态，
// 走真实 ProjectSidebar/ProjectDirectoryProvider/useProjectRestoreGuide 链路验证横幅与一键恢复。
// 导航与远端回调用 noop：本验收只覆盖目录读取、横幅可见性、一键恢复写入与失败重试。
const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.className = `${theme} theme-zai-${theme}`;
const noop = () => {};
const dispose = () => ({ dispose: noop });

const tree: ProjectTree = {
  projects: [],
  tasks: [
    {
      taskId: "t1",
      workspacePath: "/repos/alpha",
      hostId: "local",
      projectId: null,
      title: "Alpha task",
      createdAt: 1,
      updatedAt: 30,
      pinned: false,
      archived: false,
    },
    {
      taskId: "t2",
      workspacePath: "/repos/beta",
      hostId: "local",
      projectId: null,
      title: "Beta one",
      createdAt: 1,
      updatedAt: 20,
      pinned: false,
      archived: false,
    },
    {
      taskId: "t3",
      workspacePath: "/repos/beta",
      hostId: "local",
      projectId: null,
      title: "Beta two",
      createdAt: 1,
      updatedAt: 10,
      pinned: false,
      archived: false,
    },
  ],
};
const candidates = [
  { path: "/repos/alpha", name: "alpha", taskCount: 1, lastActivityAt: 30 },
  { path: "/repos/beta", name: "beta", taskCount: 2, lastActivityAt: 20 },
];
const settingsSnapshot: Record<string, unknown> = { projectRestoreGuideDismissed: false };
const settingsUpdates: unknown[] = [];
const restoreCalls: string[][] = [];
// 失败重试开关：置 true 时下一次 restoreProjects 抛错（幂等重试路径）。
let failNextRestore = false;
// 跳过模拟（2026-11-11 bug 1/2 修复验收）：命中集合的目录按缺失跳过，不建项目不收编。
let skipRestorePaths: string[] = [];
let lastRestoreResult: unknown = null;

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
    get: async () => structuredClone(settingsSnapshot),
    update: async (patch: Record<string, unknown>) => {
      Object.assign(settingsSnapshot, patch);
      settingsUpdates.push(patch);
    },
  },
  projectService: {
    readTree: async () => structuredClone(tree),
    listRestoreCandidates: async () => structuredClone(candidates),
    restoreProjects: async (input: { paths: string[] }) => {
      restoreCalls.push(input.paths);
      if (failNextRestore) {
        failNextRestore = false;
        throw new Error("simulated restore failure");
      }
      let adoptedTasks = 0;
      const skipped: Array<{ path: string; reason: "missing" | "unavailable" }> = [];
      let restored = 0;
      input.paths.forEach((path) => {
        if (skipRestorePaths.includes(path)) {
          skipped.push({ path, reason: "missing" });
          return;
        }
        const id = `restored-${restored}`;
        restored++;
        tree.projects.push({
          id,
          hostId: "local",
          name: path.split("/").pop() ?? path,
          nameOverridden: false,
          roots: [{ rootPath: path, position: 0, isPrimary: true }],
          position: tree.projects.length,
          pinned: false,
          deleted: false,
          createdAt: 1,
          updatedAt: 1,
        });
        for (const task of tree.tasks)
          if (task.workspacePath === path && task.projectId === null) {
            task.projectId = id;
            adoptedTasks++;
          }
      });
      const result = { projects: restored, adoptedTasks, skipped };
      lastRestoreResult = result;
      return result;
    },
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
  // 断言通道：数组内容变化不触发 React 重渲染，测试经 evaluate 读取。
  __restoreCalls: restoreCalls,
  __settingsUpdates: settingsUpdates,
  __setFailNextRestore: (value: boolean) => {
    failNextRestore = value;
  },
  __setSkipRestorePaths: (paths: string[]) => {
    skipRestorePaths = paths;
  },
});
// 只读快照（readFixtureState 用 JSON.stringify 读 window 键，不能放函数）。
Object.defineProperty(window, "__lastRestoreResult", {
  get: () => lastRestoreResult,
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
} satisfies ProjectSidebarProps;

function Fixture() {
  return (
    <ServiceProvider services={services}>
      <ProjectDirectoryProvider isDesktop>
        <div className="flex h-screen bg-background text-foreground">
          <div className="w-64 shrink-0 bg-sidebar">
            <ProjectSidebar {...common} />
          </div>
          <main className="min-w-0 p-2 text-ui-sm">
            <output data-testid="fixture-restore">{JSON.stringify(restoreCalls)}</output>
            <output data-testid="fixture-settings">{JSON.stringify(settingsUpdates)}</output>
          </main>
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
