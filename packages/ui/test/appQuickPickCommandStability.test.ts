import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readAppSource(): string {
  return readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
}

function getQuickPickCommandsMemoBlock(source: string): string {
  const start = source.indexOf("const quickPickCommands = useMemo");
  const end = source.indexOf("  );", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("App quick pick command render stability", () => {
  it("quick pick commands memo 不订阅用户对象引用", () => {
    const memoBlock = getQuickPickCommandsMemoBlock(readAppSource());

    // 性能回归保护：commands 会一路传给 CommandCenterDialog。
    // fork 已移除登录态，这里只守护 memo 块不重新引入 user 对象订阅。
    expect(memoBlock).not.toMatch(/\n\s+user,\n/);
  });

  it("memoizes task find dialog props before passing them to the shell layout", () => {
    const source = readAppSource();

    // 性能回归保护：taskFindDialogProps 是对象 prop，内联创建会让 WorkspaceShellLayout
    // 在无关流式刷新中看到新引用并继续向下重渲染。
    expect(source).toContain("const taskFindDialogProps = useMemo<TaskFindDialogProps>");
    expect(source).toContain("taskFindDialogProps={taskFindDialogProps}");
  });
});
