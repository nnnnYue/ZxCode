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

// file-manager side pane 渲染验收（2026-11-14「查看文件」面板全白回归）：
// AnimatedSidePanePanel 的 file-manager 分支必须渲染 FileManagerPane（目录树 + 预览 + 导航回调），
// 不再落回空占位 div；tab 标题用 fileManager.* i18n 文案。WorkspaceFileTree/PreviewPane 用边界桩。
const root = fileURLToPath(new URL("../../../../../../", import.meta.url));
const entry = "/packages/ui/test/browser/manual-review/pending/side-pane-file-manager.fixture.tsx";
let server;
let browser;
let origin;

before(async () => {
  server = await createServer({
    root,
    configFile: false,
    // 独立依赖缓存：边界桩与其他 fixture 回放的 optimizeDeps 互不覆盖。
    cacheDir: join(tmpdir(), "zcode-side-pane-file-manager-vite-cache"),
    plugins: [
      {
        name: "side-pane-file-manager-fixture-boundaries",
        enforce: "pre",
        load(id) {
          if (id.endsWith("/workspace-file-tree/WorkspaceFileTree.tsx"))
            return "import {jsx as _jsx, jsxs as _jsxs} from 'react/jsx-runtime'; export function WorkspaceFileTree(props){return _jsxs('div',{'data-testid':'fixture-file-tree','data-workspace':props.workspacePath,'data-identity':props.workspaceIdentity ?? '',children:[_jsxs('button',{'data-testid':'fixture-open-file',onClick:()=>props.onOpenPreview?.({type:'file',title:'app.ts',path:'src/app.ts'}),children:['open app.ts']})]});}";
          if (id.endsWith("/PreviewPane.tsx"))
            return "import {jsx as _jsx} from 'react/jsx-runtime'; export function PreviewPane(props){return _jsx('div',{'data-testid':'fixture-preview-pane','data-source':props.source?.path ?? '',children:props.source?.title ?? 'empty'});}";
          // FileManagerPane 消费 useZCodeStore 的目录显隐偏好；偏好持久化本体不在本验收内，
          // 桩成固定 state（PFT-1 同款模式）。
          if (id.endsWith("/store/StoreProvider.tsx"))
            return "import {createContext} from 'react'; export const StoreContext=createContext(null); const state={setTheme:()=>{},interfaceMode:'coding',fileManagerNavigationOpenByWorkspace:{},setFileManagerNavigationOpen:()=>{}}; export const useZCodeStore=s=>s(state); export const useZCodeStoreWithDefault=(_s,value)=>value;";
        },
      },
      react(),
      tailwindcss(),
      {
        name: "side-pane-file-manager-fixture",
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

const artifacts = join(tmpdir(), "zcode-side-pane-file-manager");

test("SFM-1 file-manager tab 渲染 FileManagerPane 与目录树，不再落空占位", async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(10_000);
  try {
    await page.goto(`${origin}fixture?theme=light`);
    // 回归断言：空占位 div 不再出现。
    await page
      .locator('[data-side-pane-placeholder="file-manager"]')
      .waitFor({ state: "detached" })
      .catch(() => {});
    assert.equal(
      await page.locator('[data-side-pane-placeholder="file-manager"]').count(),
      0,
      "file-manager 不允许落回空占位",
    );
    const pane = page.locator("[data-file-manager-pane]");
    await pane.waitFor();
    // 目录树边界桩挂载，目标 workspace 贯穿传递（identity key 约定）。
    const tree = page.locator('[data-testid="fixture-file-tree"]');
    await tree.waitFor();
    assert.equal(await tree.getAttribute("data-workspace"), "/workspace/example");
    assert.equal(await tree.getAttribute("data-identity"), "fixture-workspace");
    // 空态（source=null）显示 fileManager.empty 文案（en-US）。
    await page.getByText("Select a file from the navigation").waitFor();
    // tab 标题用 fileManager.title i18n（不是原始 key）。
    assert.equal(await page.getByText("fileManager.title").count(), 0);
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, "file-manager-pane-light.png"), fullPage: true });
  } finally {
    await page.close();
  }
});

test("SFM-2 目录导航回调贯穿 onNavigateFileManager，导航后 tab 换预览", async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(10_000);
  try {
    await page.goto(`${origin}fixture?theme=light`);
    const tree = page.locator('[data-testid="fixture-file-tree"]');
    await tree.waitFor();
    // 目录显隐切换按钮（FileManagerPane 顶栏）可交互。
    const toggle = page.locator("[data-file-manager-pane] button").first();
    await toggle.click();
    // 点目录树里的文件 → onOpenPreview → onNavigateFileManager 回调 → tab.source 更新。
    await page.locator('[data-testid="fixture-open-file"]').click();
    await page.waitForFunction(
      () => JSON.parse(JSON.stringify(window.__fileManagerNavigations ?? [])).length > 0,
      undefined,
      { timeout: 5_000 },
    );
    const navigations = await page.evaluate(() => window.__fileManagerNavigations);
    assert.equal(navigations.length, 1);
    assert.equal(navigations[0].source.path, "src/app.ts");
    assert.equal(navigations[0].source.workspacePath, "/workspace/example");
    // 导航后预览区挂载（source 非空）。
    const preview = page.locator('[data-testid="fixture-preview-pane"]');
    await preview.waitFor();
    assert.equal(await preview.getAttribute("data-source"), "src/app.ts");
  } finally {
    await page.close();
  }
});
