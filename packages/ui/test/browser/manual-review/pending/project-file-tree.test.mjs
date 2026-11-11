import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright-core";

// 「查看文件」接线验收（2026-11-11 bug 3b）：项目行查看文件 → 覆盖面板挂载（WorkspaceFileTree
// 边界桩）→ 导航面板仍在 → onFileTreeOpenChange 回传 → 关闭面板。
const root = fileURLToPath(new URL("../../../../../../", import.meta.url));
const entry = "/packages/ui/test/browser/manual-review/pending/project-file-tree.fixture.tsx";
let server;
let browser;
let origin;

before(async () => {
  server = await createServer({
    root,
    configFile: false,
    // 独立依赖缓存：边界 mock 与其他 fixture 回放的 optimizeDeps 互不覆盖。
    cacheDir: join(tmpdir(), "zcode-project-file-tree-vite-cache"),
    plugins: [
      {
        name: "project-file-tree-fixture-boundaries",
        enforce: "pre",
        load(id) {
          if (id.endsWith("/store/TabStoreProvider.tsx"))
            return "export const useTabStoreApi=()=>window.__renderFixture.tabStore; export const useTabStore=s=>s(window.__renderFixture.tabStore.getState()); export const useOptionalTabStore=useTabStore;";
          if (id.endsWith("/store/StoreProvider.tsx"))
            return "import {createContext} from 'react'; export const StoreContext=createContext(null); const state={setTheme:()=>{},interfaceMode:'coding'}; export const useZCodeStore=s=>s(state); export const useZCodeStoreWithDefault=(_s,value)=>value;";
          if (id.endsWith("/hooks/usePlatform.tsx"))
            return "export const useOptionalPlatform=()=>null; export const usePlatform=()=>({}); export const useSelectDirectory=()=>async()=>null;";
          if (id.endsWith("/hooks/useConfirmDialog.ts"))
            return "const confirm=async()=>true; export const useConfirmDialog=()=>confirm;";
          if (id.endsWith("/hooks/useWebRemoteControlStatus.ts"))
            return "export const useWebRemoteControlStatus=()=>({mobileConnected:false});";
          if (id.endsWith("/v4/useWorkspaceSessionsIndexItems.ts"))
            return "import {useSyncExternalStore} from 'react'; const empty={items:[]}; export const useWorkspaceSessionsIndexItems=()=>useSyncExternalStore(()=>()=>{},()=>empty);";
          if (id.endsWith("/settings/CodingPlanUpgradeDialogProvider.tsx"))
            return "export const useCodingPlanUpgradeDialog=()=>({openCodingPlanUpgrade:()=>{}}); export const useOptionalCodingPlanUpgradeDialog=()=>null;";
          if (id.endsWith("/WorkspaceSidebarFooter.tsx"))
            return "export const WorkspaceSidebarFooter=()=>null;";
          if (id.endsWith("/shortcuts/useShortcutBindings.ts"))
            return "export const useShortcutCommandLabel=()=>'';";
          // WorkspaceFileTree 面板本体换骨架后另有 e2e 覆盖；本验收只验证接线——
          // 桩渲染面板 testid + 目标 workspace + 关闭按钮。
          if (id.endsWith("/workspace-file-tree/WorkspaceFileTree.tsx"))
            return "import {jsx as _jsx, jsxs as _jsxs} from 'react/jsx-runtime'; export function getWorkspaceFileTreeDirectoryLoadDepth(){return 1;} export function WorkspaceFileTree(props){return _jsxs('div',{'data-testid':'workspace-file-tree-panel','data-workspace':props.workspacePath,children:[_jsx('span',{}),_jsx('button',{'data-testid':'fixture-file-tree-close',onClick:()=>props.onClose?.(),children:'close'})]});}";
        },
      },
      react(),
      tailwindcss(),
      {
        name: "project-file-tree-fixture",
        configureServer(vite) {
          vite.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith("/fixture?")) return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await vite.transformIndexHtml(
                req.url,
                `<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`,
              ),
            );
          });
        },
      },
    ],
    resolve: { alias: { "@": `${root}packages/ui/src` } },
    optimizeDeps: { entries: [entry.slice(1)] },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  origin = server.resolvedUrls.local[0];
  browser = await chromium.launch(
    process.env.CHROME_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
      : { channel: "chrome" },
  );
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const artifacts = join(tmpdir(), "zcode-project-file-tree");

test("PFT-1 项目行「查看文件」打开覆盖面板，导航仍在，开合回传，关闭后收起", async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(10_000);
  try {
    await page.goto(`${origin}fixture?theme=light`);
    const projectRow = page.locator('[data-project-id="p1"]').first();
    await projectRow.waitFor();
    await projectRow.hover();
    // 修复回归（2026-11-11 bug 3b）：此前 onOpenFileManager 全仓无提供方，点击静默 no-op。
    await page.locator('[data-testid="virtual-project-files"]').click();
    const panel = page.locator('[data-testid="workspace-file-tree-panel"]');
    await panel.waitFor();
    assert.equal(await panel.getAttribute("data-workspace"), "/repos/alpha");
    // 面板是侧栏内覆盖层，导航面板本身仍在 DOM 且可见（不被卸载）。
    await page.locator('[data-project-sidebar-panel="navigation"]').waitFor();
    // 开合状态回传 shell（isSidebarFileTreeOpen 消费方）。
    await page.waitForFunction(
      () => (window.__fileTreeOpenChanges ?? []).includes(true),
      undefined,
      { timeout: 5_000 },
    );
    await page.getByTestId("fixture-file-tree-close").click();
    await page.waitForFunction(
      () => (window.__fileTreeOpenChanges ?? []).at(-1) === false,
      undefined,
      { timeout: 5_000 },
    );
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, "file-tree-light.png"), fullPage: true });
  } finally {
    await page.close();
  }
});
