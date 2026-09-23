import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFileService } from "../src/file/fileService.js";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "zxcode-file-write-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("writeTextFile overwrites an existing text file", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "note.txt");
    await writeFile(filePath, "old content", "utf8");
    const service = createFileService();
    await service.writeTextFile({ path: filePath, content: "new 内容\nline2" });
    assert.equal(await readFile(filePath, "utf8"), "new 内容\nline2");
  });
});

test("writeTextFile rejects oversized content and keeps the original file", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "big.txt");
    await writeFile(filePath, "x", "utf8");
    const service = createFileService();
    await assert.rejects(
      service.writeTextFile({ path: filePath, content: "a".repeat(1024 * 1024 + 1) }),
      /too large to save/,
    );
    assert.equal(await readFile(filePath, "utf8"), "x");
  });
});

test("writeTextFile refuses missing files and directories", async () => {
  await withTempDir(async (dir) => {
    const service = createFileService();
    await assert.rejects(service.writeTextFile({ path: join(dir, "missing.txt"), content: "x" }));
    await assert.rejects(service.writeTextFile({ path: dir, content: "x" }), /not a file/);
  });
});
