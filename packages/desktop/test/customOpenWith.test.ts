import assert from "node:assert/strict";
import test from "node:test";
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

test("custom: 前缀判定与 shared 常量一致", () => {
  assert.equal(CUSTOM_EDITOR_ID_PREFIX, "custom:");
  assert.equal(isCustomEditorId("custom:test-1"), true);
  assert.equal(isCustomEditorId("vscode"), false);
});

test("注册 → 持久化 → 读取 round-trip", async () => {
  const context = createTestContext();
  try {
    const entry = await addCustomEditor(context.fakeAppBundle, context.options);
    assert.ok(entry);
    assert.equal(entry.id, "custom:test-1");
    // 无 Info.plist 的 .app 目录：显示名回退到文件名去 .app
    assert.equal(entry.name, "Fake App");
    assert.equal(entry.appPath, context.fakeAppBundle);

    const persisted = JSON.parse(readFileSync(context.registryFile, "utf-8")) as unknown[];
    assert.equal(persisted.length, 1);
    assert.deepEqual(listCustomEditors({ configDir: context.configDir }), [entry]);
  } finally {
    cleanup(context);
  }
});

test("相同 appPath 幂等：重复注册返回既有条目", async () => {
  const context = createTestContext();
  try {
    const first = await addCustomEditor(context.fakeAppBundle, context.options);
    const second = await addCustomEditor(context.fakeAppBundle, context.options);
    assert.equal(second?.id, first?.id);
    assert.equal(listCustomEditors({ configDir: context.configDir }).length, 1);
  } finally {
    cleanup(context);
  }
});

test("删除：命中返回 true 并移除；未知 id 返回 false", async () => {
  const context = createTestContext();
  try {
    const entry = await addCustomEditor(context.fakeAppBundle, context.options);
    assert.ok(entry);
    assert.equal(removeCustomEditor(entry.id, { configDir: context.configDir }), true);
    assert.deepEqual(listCustomEditors({ configDir: context.configDir }), []);
    assert.equal(removeCustomEditor(entry.id, { configDir: context.configDir }), false);
  } finally {
    cleanup(context);
  }
});

test("按 id 查找；未知 id 返回 null", async () => {
  const context = createTestContext();
  try {
    const entry = await addCustomEditor(context.fakeAppBundle, context.options);
    assert.ok(entry);
    assert.equal(findCustomEditor(entry.id, { configDir: context.configDir })?.id, entry.id);
    assert.equal(findCustomEditor("custom:missing", { configDir: context.configDir }), null);
  } finally {
    cleanup(context);
  }
});

test("非法路径拒绝注册且不写盘", async () => {
  const context = createTestContext();
  try {
    const plainDir = join(context.configDir, "plain-dir");
    mkdirSync(plainDir);
    assert.equal(await addCustomEditor(plainDir, context.options), null);
    assert.equal(
      await addCustomEditor(join(context.configDir, "missing.app"), context.options),
      null,
    );
    assert.deepEqual(listCustomEditors({ configDir: context.configDir }), []);
  } finally {
    cleanup(context);
  }
});

test("路径合法性按平台校验", async () => {
  const context = createTestContext();
  try {
    const exeFile = join(context.configDir, "tool.exe");
    writeFileSync(exeFile, "fake");
    const exeDir = join(context.configDir, "dir.exe");
    mkdirSync(exeDir);

    assert.equal(isValidCustomEditorAppPath(context.fakeAppBundle, "darwin"), true);
    assert.equal(isValidCustomEditorAppPath(join(context.configDir, "plain"), "darwin"), false);
    assert.equal(isValidCustomEditorAppPath(exeFile, "win32"), true);
    assert.equal(isValidCustomEditorAppPath(exeDir, "win32"), false);
    assert.equal(isValidCustomEditorAppPath(context.fakeAppBundle, "linux"), false);
  } finally {
    cleanup(context);
  }
});

test("注册表 JSON 损坏时按空表处理", async () => {
  const context = createTestContext();
  try {
    writeFileSync(context.registryFile, "not-json", "utf-8");
    assert.deepEqual(listCustomEditors({ configDir: context.configDir }), []);
    // 空表状态下注册仍可成功（写盘覆盖损坏文件）
    const entry = await addCustomEditor(context.fakeAppBundle, context.options);
    assert.equal(entry?.name, "Fake App");
  } finally {
    cleanup(context);
  }
});

test("显示名派生：文件名去平台扩展", () => {
  assert.equal(deriveCustomEditorName("/Applications/Fake App.app", "darwin"), "Fake App");
  assert.equal(deriveCustomEditorName(join("/x", "MyTool.EXE"), "win32"), "MyTool");
  assert.equal(deriveCustomEditorName(join("/x", "noext"), "win32"), "noext");
});
