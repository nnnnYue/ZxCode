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

// PRG（specs/project-restore-guide.md）：空项目 + 未归类任务 → 横幅出现 → 一键全量恢复/失败重试/不再提示三路径。
const root = fileURLToPath(new URL("../../../../../../", import.meta.url));
const entry = "/packages/ui/test/browser/manual-review/pending/project-restore-guide.fixture.tsx";
let server;
let browser;
let origin;

before(async () => {
  server = await createServer({
    root,
    configFile: false,
    // 独立依赖缓存：边界 mock 与其他 fixture 回放的 optimizeDeps 互不覆盖。
    cacheDir: join(tmpdir(), "zcode-project-restore-guide-vite-cache"),
    plugins: [
      {
        name: "restore-guide-fixture-boundaries",
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
          // toast 边界 mock：记录调用供断言（跳过提示）；sidebar 链只消费 toast/updateToast/dismissToast。
          if (id.endsWith("/components/ui/toast.tsx"))
            return "export function toast(message){ (window.__toastCalls ??= []).push(String(message)); return window.__toastCalls.length; } export function updateToast(){} export function dismissToast(){}";
        },
      },
      react(),
      tailwindcss(),
      {
        name: "restore-guide-fixture",
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

const artifacts = join(tmpdir(), "zcode-project-restore-guide");

async function openFixture(theme = "light") {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.setDefaultTimeout(10_000);
  await page.goto(`${origin}fixture?theme=${theme}`);
  await page.locator('[data-testid="project-restore-guide"]').waitFor();
  return page;
}

const readFixtureState = (page, name) => page.evaluate((key) => JSON.stringify(window[key]), name);

test("PRG-1 空项目 + 未归类任务：横幅出现，一键恢复全部候选后项目入栏、横幅消失、标记写入", async () => {
  const page = await openFixture();
  try {
    // count 语义为一键全量的未归类任务总数（1 + 2）。
    assert.equal(
      await page.locator('[data-testid="project-restore-guide"]').getAttribute("data-count"),
      "3",
    );
    await page.getByTestId("project-restore-guide-restore").click();
    await page.locator('[data-testid="project-restore-guide"]').waitFor({ state: "hidden" });
    // 无对话框：一次点击覆盖全部候选目录。
    assert.equal(
      await readFixtureState(page, "__restoreCalls"),
      JSON.stringify([["/repos/alpha", "/repos/beta"]]),
    );
    assert.match(await readFixtureState(page, "__settingsUpdates"), /projectRestoreGuideDismissed/);
    await page.locator('[data-project-id="restored-0"]').first().waitFor();
    await page.locator('[data-project-id="restored-1"]').first().waitFor();
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, "restore-light.png"), fullPage: true });
  } finally {
    await page.close();
  }
});

test("PRG-2 恢复失败：内联报错不写标记，横幅保留；重试成功收编", async () => {
  const page = await openFixture();
  try {
    await page.evaluate(() => window.__setFailNextRestore(true));
    await page.getByTestId("project-restore-guide-restore").click();
    await page.getByTestId("project-restore-guide-error").waitFor();
    // 失败不写标记、不消失，可重试。
    assert.equal(await readFixtureState(page, "__settingsUpdates"), "[]");
    await page.locator('[data-testid="project-restore-guide"]').waitFor();
    await page.evaluate(() => window.__setFailNextRestore(false));
    await page.getByTestId("project-restore-guide-restore").click();
    await page.locator('[data-testid="project-restore-guide"]').waitFor({ state: "hidden" });
    assert.equal(
      await readFixtureState(page, "__restoreCalls"),
      JSON.stringify([
        ["/repos/alpha", "/repos/beta"],
        ["/repos/alpha", "/repos/beta"],
      ]),
    );
    assert.match(await readFixtureState(page, "__settingsUpdates"), /projectRestoreGuideDismissed/);
  } finally {
    await page.close();
  }
});

test("PRG-3 不再提示：写标记且不调恢复", async () => {
  const page = await openFixture("dark");
  try {
    await page.getByTestId("project-restore-guide-dismiss").click();
    await page.locator('[data-testid="project-restore-guide"]').waitFor({ state: "hidden" });
    assert.equal(
      await readFixtureState(page, "__settingsUpdates"),
      JSON.stringify([{ projectRestoreGuideDismissed: true }]),
    );
    assert.equal(await readFixtureState(page, "__restoreCalls"), "[]");
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: join(artifacts, "dismiss-dark.png"), fullPage: true });
  } finally {
    await page.close();
  }
});

test("PRG-4 恢复含缺失目录：跳过不构成失败，其余恢复、toast 提示、标记照写", async () => {
  const page = await openFixture();
  try {
    // beta 目录在候选查询后从磁盘消失（服务层此时已过滤；此处模拟恢复期竞争窗口）。
    await page.evaluate(() => window.__setSkipRestorePaths(["/repos/beta"]));
    await page.getByTestId("project-restore-guide-restore").click();
    await page.locator('[data-testid="project-restore-guide"]').waitFor({ state: "hidden" });
    // 一键仍覆盖全部候选；跳过明细随返回值上报，不整批失败。
    assert.equal(
      await readFixtureState(page, "__restoreCalls"),
      JSON.stringify([["/repos/alpha", "/repos/beta"]]),
    );
    assert.equal(
      await readFixtureState(page, "__lastRestoreResult"),
      JSON.stringify({
        projects: 1,
        adoptedTasks: 1,
        skipped: [{ path: "/repos/beta", reason: "missing" }],
      }),
    );
    // 跳过提示 toast（en-US 默认文案）。
    assert.match(await readFixtureState(page, "__toastCalls"), /Skipped 1/);
    assert.match(await readFixtureState(page, "__settingsUpdates"), /projectRestoreGuideDismissed/);
    // 存活目录项目入栏。
    await page.locator('[data-project-id="restored-0"]').first().waitFor();
  } finally {
    await page.close();
  }
});
