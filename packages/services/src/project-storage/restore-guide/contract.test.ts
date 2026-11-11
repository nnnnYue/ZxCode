import { describe, expect, it } from "vitest";
import { fixture } from "#src/project-storage/test-fixture.js";
import { migrateProjects } from "#src/project-storage/migrate-projects.js";
import { ProjectRepository } from "#src/project-storage/project-repository.js";

/** 引导场景的既有库：迁移后 projects 表为空、任务全部未归类（fork 切库存量用户形态）。 */
async function restoredFixture() {
  const { db, add: legacyAdd, context } = await fixture([]);
  migrateProjects(db, context);
  // 迁移后新插入的行不会走 initializeLegacyTaskIdentity 的身份回填；
  // 模拟 admitTaskIdentity 的结果：本机行补 host_id 与 root_path（=workspace_path）。
  const add = (id: string, path: string) => {
    legacyAdd(id, path);
    db.exec("UPDATE tasks SET host_id='local',root_path=workspace_path WHERE host_id IS NULL");
  };
  return { db, add, repository: new ProjectRepository(db, undefined) };
}

describe("项目恢复引导候选（specs/project-restore-guide.md）", () => {
  it("只列出本地未归类未归档未删除任务的目录，排除双拼写会话目录并按最近活动倒序", async () => {
    const { db, add, repository } = await restoredFixture();
    add("older", "/repos/alpha");
    add("newer-a", "/repos/beta");
    add("newer-b", "/repos/beta");
    add("conversation", "/Users/test/.zxcode/workspace/default");
    add("conversation-legacy", "/Users/test/.zcode/workspace/7788");
    add("conversation-windows", "C:\\Users\\test\\.zxcode\\workspace\\default");
    add("deleted", "/repos/gone");
    add("cli-deleted", "/repos/gone");
    add("archived-only", "/repos/quiet");
    db.exec(
      "UPDATE tasks SET cli_updated_at=30 WHERE task_id='newer-a';" +
        "UPDATE tasks SET cli_updated_at=20 WHERE task_id='newer-b';" +
        "UPDATE tasks SET cli_updated_at=10 WHERE task_id='older';" +
        "UPDATE tasks SET deleted=1 WHERE task_id='deleted';" +
        "UPDATE tasks SET cli_deleted=1 WHERE task_id='cli-deleted';" +
        "UPDATE tasks SET archived=1 WHERE task_id='archived-only'",
    );

    expect(repository.listRestoreCandidates()).toEqual([
      { path: "/repos/beta", taskCount: 2, lastActivityAt: 30 },
      { path: "/repos/alpha", taskCount: 1, lastActivityAt: 10 },
    ]);
  });

  it("root_path 缺失的行按 workspace_path 参与候选聚合", async () => {
    const { db, add, repository } = await restoredFixture();
    add("legacy", "/repos/alpha");
    db.exec("UPDATE tasks SET root_path=NULL");
    expect(repository.listRestoreCandidates()).toEqual([
      { path: "/repos/alpha", taskCount: 1, lastActivityAt: 2 },
    ]);
  });
});

describe("restoreUnclassifiedDirectory", () => {
  it("创建项目并归入该目录未归类任务（含归档），只写组织态且可幂等重试", async () => {
    const { db, add, repository } = await restoredFixture();
    add("active", "/repos/alpha");
    add("archived", "/repos/alpha");
    db.exec(
      "UPDATE tasks SET archived=1 WHERE task_id='archived';" +
        "UPDATE tasks SET root_path=NULL WHERE task_id='archived'",
    );
    const before = db
      .prepare(
        "SELECT workspace_path,workspace_identity,title,created_at,updated_at,archived,pinned,unread_at FROM tasks ORDER BY task_id",
      )
      .all();

    const first = repository.restoreUnclassifiedDirectory({ path: "/repos/alpha" });
    expect(first.adoptedTasks).toBe(2);
    expect(first.project.name).toBe("alpha");
    expect(first.project.roots).toEqual([
      { rootPath: "/repos/alpha", position: 0, isPrimary: true },
    ]);
    const projectId = first.project.id;
    expect(
      db.prepare("SELECT project_id,root_path FROM tasks WHERE task_id='archived'").get(),
    ).toEqual({ project_id: projectId, root_path: "/repos/alpha" });
    // 重试复用同一项目且不再重复收编。
    const retry = repository.restoreUnclassifiedDirectory({ path: "/repos/alpha" });
    expect(retry.project.id).toBe(projectId);
    expect(retry.adoptedTasks).toBe(0);
    expect(db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 1 });
    // 组织态之外的列一字不动。
    expect(
      db
        .prepare(
          "SELECT workspace_path,workspace_identity,title,created_at,updated_at,archived,pinned,unread_at FROM tasks ORDER BY task_id",
        )
        .all(),
    ).toEqual(before);
  });

  it("同目录已有未删除项目时复用，不新建", async () => {
    const { add, repository } = await restoredFixture();
    add("task", "/repos/alpha");
    const existing = repository.saveProject({
      name: "已有项目",
      roots: ["/repos/alpha"],
      primaryRoot: "/repos/alpha",
    });
    const result = repository.restoreUnclassifiedDirectory({ path: "/repos/alpha" });
    expect(result.project.id).toBe(existing.id);
    expect(result.project.name).toBe("已有项目");
    expect(result.adoptedTasks).toBe(1);
  });
});
