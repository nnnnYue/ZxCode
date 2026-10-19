// fork 完整保留的 open-with 自定义应用（含删除不误触发修复）。
// 修复原因：原文件使用 node:test 风格，vitest 收集时报 "No test suite found"；
// 改写为 vitest 断言，用例语义不变。
import { expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CUSTOM_EDITOR_ID_PREFIX } from "@zcode/shared";
import {
  addCustomEditor,
  deriveCustomEditorName,
  findCustomEditor,
  isCustomEditorId,
  isValidCustomEditorAppPath,
  listCustomEditors,
  removeCustomEditor,
} from "../src/main/customEditors.js";

interface TestContext {
  configDir: string;
  registryFile: string;
  fakeAppBundle: string;
  options: {
    configDir: string;
    createId: () => string;
    resolveIcon: (editorId: string, appPath: string) => Promise<string | null>;
  };
}

function createTestContext(): TestContext {
  const configDir = mkdtempSync(join(tmpdir(), "zxcode-custom-editors-"));
  const fakeAppBundle = join(configDir, "Fake App.app");
  mkdirSync(fakeAppBundle, { recursive: true });
  let seq = 0;
  return {
    configDir,
    registryFile: join(configDir, "custom-editors.json"),
    fakeAppBundle,
    options: {
      configDir,
      createId: () => `test-${String(++seq)}`,
      resolveIcon: async () => "data:image/png;base64,FAKE",
    },
  };
}

function cleanup(context: TestContext): void {
  rmSync(context.configDir, { recursive: true, force: true });
}

it("custom: 前缀判定与 shared 常量一致", () => {
  expect(CUSTOM_EDITOR_ID_PREFIX).toBe("custom:");
  expect(isCustomEditorId("custom:test-1")).toBe(true);
  expect(isCustomEditorId("vscode")).toBe(false);
});

it("注册 → 持久化 → 读取 round-trip", async () => {
  const context = createTestContext();
  try {
    const entry = await addCustomEditor(context.fakeAppBundle, context.options);
    expect(entry).toBeTruthy();
    expect(entry!.id).toBe("custom:test-1");
    // 无 Info.plist 的 .app 目录：显示名回退到文件名去 .app
    expect(entry!.name).toBe("Fake App");
    expect(entry!.appPath).toBe(context.fakeAppBundle);

    const persisted = JSON.parse(readFileSync(context.registryFile, "utf-8")) as unknown[];
    expect(persisted).toHaveLength(1);
    expect(listCustomEditors({ configDir: context.configDir })).toEqual([entry]);
  } finally {
    cleanup(context);
  }
});

it("相同 appPath 幂等：重复注册返回既有条目", async () => {
  const context = createTestContext();
  try {
    const first = await addCustomEditor(context.fakeAppBundle, context.options);
    const second = await addCustomEditor(context.fakeAppBundle, context.options);
    expect(second?.id).toBe(first?.id);
    expect(listCustomEditors({ configDir: context.configDir })).toHaveLength(1);
  } finally {
    cleanup(context);
  }
});

it("删除：命中返回 true 并移除；未知 id 返回 false", async () => {
  const context = createTestContext();
  try {
    const entry = await addCustomEditor(context.fakeAppBundle, context.options);
    expect(entry).toBeTruthy();
    expect(removeCustomEditor(entry!.id, { configDir: context.configDir })).toBe(true);
    expect(listCustomEditors({ configDir: context.configDir })).toEqual([]);
    expect(removeCustomEditor(entry!.id, { configDir: context.configDir })).toBe(false);
  } finally {
    cleanup(context);
  }
});

it("按 id 查找；未知 id 返回 null", async () => {
  const context = createTestContext();
  try {
    const entry = await addCustomEditor(context.fakeAppBundle, context.options);
    expect(entry).toBeTruthy();
    expect(findCustomEditor(entry!.id, { configDir: context.configDir })?.id).toBe(entry!.id);
    expect(findCustomEditor("custom:missing", { configDir: context.configDir })).toBeNull();
  } finally {
    cleanup(context);
  }
});

it("非法路径拒绝注册且不写盘", async () => {
  const context = createTestContext();
  try {
    const plainDir = join(context.configDir, "plain-dir");
    mkdirSync(plainDir);
    expect(await addCustomEditor(plainDir, context.options)).toBeNull();
    expect(
      await addCustomEditor(join(context.configDir, "missing.app"), context.options),
    ).toBeNull();
    expect(listCustomEditors({ configDir: context.configDir })).toEqual([]);
  } finally {
    cleanup(context);
  }
});

it("路径合法性按平台校验", async () => {
  const context = createTestContext();
  try {
    const exeFile = join(context.configDir, "tool.exe");
    writeFileSync(exeFile, "fake");
    const exeDir = join(context.configDir, "dir.exe");
    mkdirSync(exeDir);

    expect(isValidCustomEditorAppPath(context.fakeAppBundle, "darwin")).toBe(true);
    expect(isValidCustomEditorAppPath(join(context.configDir, "plain"), "darwin")).toBe(false);
    expect(isValidCustomEditorAppPath(exeFile, "win32")).toBe(true);
    expect(isValidCustomEditorAppPath(exeDir, "win32")).toBe(false);
    expect(isValidCustomEditorAppPath(context.fakeAppBundle, "linux")).toBe(false);
  } finally {
    cleanup(context);
  }
});

it("注册表 JSON 损坏时按空表处理", async () => {
  const context = createTestContext();
  try {
    writeFileSync(context.registryFile, "not-json", "utf-8");
    expect(listCustomEditors({ configDir: context.configDir })).toEqual([]);
    // 空表状态下注册仍可成功（写盘覆盖损坏文件）
    const entry = await addCustomEditor(context.fakeAppBundle, context.options);
    expect(entry?.name).toBe("Fake App");
  } finally {
    cleanup(context);
  }
});

it("显示名派生：文件名去平台扩展", () => {
  expect(deriveCustomEditorName("/Applications/Fake App.app", "darwin")).toBe("Fake App");
  expect(deriveCustomEditorName(join("/x", "MyTool.EXE"), "win32")).toBe("MyTool");
  expect(deriveCustomEditorName(join("/x", "noext"), "win32")).toBe("noext");
});
