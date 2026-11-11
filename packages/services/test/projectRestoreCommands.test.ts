import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProjectRepositoryContract, VirtualProject } from "../src/project-storage/contract.js";
import { createProjectService } from "../src/project/index.js";

// 恢复引导服务层命令的回归测试（specs/project-restore-guide.md，2026-11-11 装包实测 bug 1/2）：
// 候选存在性过滤与恢复期跳过语义属于 createProjectService（仓储层保持纯 SQL）。
describe("项目恢复引导服务层命令", () => {
  it("候选排除磁盘上已不存在的目录（bug 1：死目录不建议、不可恢复）", async () => {
    const root = await mkdtemp(join(tmpdir(), "project-restore-candidates-"));
    try {
      const alive = join(root, "alive");
      await mkdir(alive);
      const listRestoreCandidates = vi.fn(() => [
        { path: alive, taskCount: 2, lastActivityAt: 5 },
        { path: join(root, "deleted"), taskCount: 1, lastActivityAt: 9 },
      ]);
      const service = createProjectService({
        repository: async () => ({ listRestoreCandidates }) as unknown as ProjectRepositoryContract,
        workspaceDirectory: root,
      });
      // 旧实现候选只查库不查盘：已删除目录进入候选且一键恢复必炸、无剔除入口；
      // 现死目录不进候选，其任务保留任务区（合法未归类，I17）。
      await expect(service.listRestoreCandidates()).resolves.toEqual([
        { path: alive, taskCount: 2, lastActivityAt: 5, name: "alive" },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("restoreProjects 跳过缺失目录并上报 skipped，部分写入仍广播（bug 1/2）", async () => {
    const root = await mkdtemp(join(tmpdir(), "project-restore-skip-"));
    try {
      const alive = join(root, "alive");
      await mkdir(alive);
      const restoreUnclassifiedDirectory = vi.fn(() => ({
        project: { id: "p" } as VirtualProject,
        adoptedTasks: 2,
      }));
      const afterChange = vi.fn();
      const service = createProjectService({
        repository: async () =>
          ({ restoreUnclassifiedDirectory }) as unknown as ProjectRepositoryContract,
        workspaceDirectory: root,
        afterChange,
      });
      // 旧实现整批 throw：独立事务已提交的前序路径造成「报错但项目已迁入」，
      // 且 changed() 不执行、部分写入当次会话不可见、重启才出现。
      await expect(
        service.restoreProjects({ paths: [alive, join(root, "deleted")] }),
      ).resolves.toEqual({
        projects: 1,
        adoptedTasks: 2,
        skipped: [{ path: join(root, "deleted"), reason: "missing" }],
      });
      expect(restoreUnclassifiedDirectory).toHaveBeenCalledTimes(1);
      expect(restoreUnclassifiedDirectory).toHaveBeenCalledWith({ path: alive });
      expect(afterChange).toHaveBeenCalledTimes(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
