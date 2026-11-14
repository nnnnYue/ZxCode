import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSubagentsService } from "#src/subagents/subagentsService.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

/**
 * 根因回归（打包产物 createSession 100% 失败）：
 * v3.18.0 采纳共享 task runtime 后，共享 CLI 进程的 spawn 参数固定是 dataRoot
 * （zcodeAgentProcessManager.startClient 的 SHARED_TASK_RUNTIME_KEY 分支），Host 在
 * resolveSpawnEnv 里的 prepareRuntimeState 只注册了 dataRoot 这个 workspace key；
 * 其余逻辑工作区的 subagent 配置缓存永远未 prepare，agent 一经 subagentsReadRuntimeConfig
 * 读取就抛 "Subagent runtime configuration is not prepared"，createSession/restoreSession
 * 全量失败。修复分两层：主修是读时补 prepare（subagentsReadRuntimeConfig handler 读前按
 * 请求 workspace 调 ensureRuntimeStatePrepared，覆盖 CLI create-app 启动期早于屏障的读）；
 * entry 启动屏障保留为纵深。本用例锁定 Host 缓存的 prepare/read 所有权语义——read 之前
 * 对应 workspace 必须先 prepare，prepare 后 read 返回可用快照，且不同 workspace key 互不串扰。
 */
describe("subagent runtime config prepare/read under shared task runtime", () => {
  it("read 先于对应 workspace 的 prepare 时抛 not prepared；补 prepare 后恢复", async () => {
    const home = await mkdtemp(join(tmpdir(), "subagent-shared-prepare-"));
    roots.push(home);
    const storageDir = join(home, "storage");
    await mkdir(join(home, ".zxcode", "cli"), { recursive: true });
    await writeFile(
      join(home, ".zxcode", "cli", "config.json"),
      JSON.stringify({ storage: { dir: storageDir } }),
      "utf8",
    );
    await mkdir(join(storageDir, "v2"), { recursive: true });
    await writeFile(
      join(storageDir, "v2", "agents-state.json"),
      JSON.stringify({
        disabledAgentIds: [],
        builtInModelSelectionOverrides: {},
        pluginAgentModelSelectionOverrides: {},
      }),
      "utf8",
    );
    const service = createSubagentsService({ homeDir: home });
    try {
      // 模拟共享进程 spawn 时的 prepare：只覆盖 spawn 参数（dataRoot）这个 workspace key。
      const dataRootWorkspace = { workspacePath: join(home, "data-root") };
      await service.prepareRuntimeState(dataRootWorkspace);
      // 会话所属的逻辑工作区与 spawn 参数不同（共享 CLI 的进程 cwd 不代表任务目录）。
      const sessionWorkspace = { workspacePath: join(home, "workspace-a") };
      // 修复前：entry 屏障缺失，agent 以会话 workspace 读快照必抛——createSession 失败根因。
      await expect(service.readRuntimeConfig(sessionWorkspace)).rejects.toThrow(
        "Subagent runtime configuration is not prepared",
      );
      // 修复后：读路径/屏障补 prepare 后 read 恢复（二者共用同一 per-key 去重语义）。
      await service.prepareRuntimeState(sessionWorkspace);
      const snapshot = await service.readRuntimeConfig(sessionWorkspace);
      expect(["ready", "built-in-fallback"]).toContain(snapshot.kind);
      // 既有 workspace 的快照不受新增 prepare 影响（显式重启重建语义保留）。
      const dataRootSnapshot = await service.readRuntimeConfig(dataRootWorkspace);
      expect(["ready", "built-in-fallback"]).toContain(dataRootSnapshot.kind);
    } finally {
      service.disposeAll();
    }
  });

  it("读路径 ensure 前置 prepare：直接 read 抛错、ensure+read 成功、同 key 不重复 prepare", async () => {
    const home = await mkdtemp(join(tmpdir(), "subagent-ensure-read-"));
    roots.push(home);
    const storageDir = join(home, "storage");
    await mkdir(join(home, ".zxcode", "cli"), { recursive: true });
    await writeFile(
      join(home, ".zxcode", "cli", "config.json"),
      JSON.stringify({ storage: { dir: storageDir } }),
      "utf8",
    );
    await mkdir(join(storageDir, "v2"), { recursive: true });
    await writeFile(
      join(storageDir, "v2", "agents-state.json"),
      JSON.stringify({
        disabledAgentIds: [],
        builtInModelSelectionOverrides: {},
        pluginAgentModelSelectionOverrides: {},
      }),
      "utf8",
    );
    const service = createSubagentsService({ homeDir: home });
    // 计数断言挂在 prepareRuntimeState 上：ensureRuntimeStatePrepared 经它触发真实 prepare，
    // spy 能看到 ensure 的实际触发次数（ready set/in-flight 去重不产生额外调用）。
    const prepareSpy = vi.spyOn(service, "prepareRuntimeState");
    try {
      const workspace = { workspacePath: join(home, "workspace-a") };
      // 1. prepare 从未被调用时直接 read：required() 抛错，且不触发任何 prepare。
      await expect(service.readRuntimeConfig(workspace)).rejects.toThrow(
        "Subagent runtime configuration is not prepared",
      );
      expect(prepareSpy).toHaveBeenCalledTimes(0);
      // 2. 同 key 并发 ensure（模拟 CLI 启动期多条读同时到达）：in-flight 合并为一次 prepare。
      await Promise.all([
        service.ensureRuntimeStatePrepared(workspace),
        service.ensureRuntimeStatePrepared(workspace),
      ]);
      expect(prepareSpy).toHaveBeenCalledTimes(1);
      // 读路径前置 prepare 后 read 成功。
      const snapshot = await service.readRuntimeConfig(workspace);
      expect(["ready", "built-in-fallback"]).toContain(snapshot.kind);
      // 3. 同 key 重复读/重复 ensure：ready set 短路，不重复 prepare。
      await service.ensureRuntimeStatePrepared(workspace);
      expect(prepareSpy).toHaveBeenCalledTimes(1);
      await service.readRuntimeConfig(workspace);
      expect(prepareSpy).toHaveBeenCalledTimes(1);
      // 4. 不同 key 是独立记账：各自 prepare 一次。
      const otherWorkspace = { workspacePath: join(home, "workspace-b") };
      await expect(service.readRuntimeConfig(otherWorkspace)).rejects.toThrow(
        "Subagent runtime configuration is not prepared",
      );
      await service.ensureRuntimeStatePrepared(otherWorkspace);
      expect(prepareSpy).toHaveBeenCalledTimes(2);
      await service.readRuntimeConfig(otherWorkspace);
      expect(prepareSpy).toHaveBeenCalledTimes(2);
    } finally {
      service.disposeAll();
    }
  });
});
