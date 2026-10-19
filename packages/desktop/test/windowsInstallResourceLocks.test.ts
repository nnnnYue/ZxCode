import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// fork：自动更新链路（runWindowsUpdateProcessCleanup / WINDOWS_UPDATE_LOCK_RELEASE_GRACE_MS /
// isWindowsProcessReferencingResourceMarkers 导出面）已随功能剔除，对应用例一并删除；
// 保留安装前资源锁诊断的现存导出（markers / snapshot / probe / 扫描查询）。
import {
  findWindowsProcessesReferencingResourceMarkers,
  probeWindowsPackagedResourceWritable,
  resolveWindowsPackagedResourceLockMarkers,
  snapshotWindowsPackagedResources,
} from "../src/main/windowsInstallResourceLocks.js";

describe("windows install resource locks", () => {
  it.runIf(process.platform === "win32")(
    "does not report the PowerShell query process as a resource lock",
    async () => {
      // 修复原因：marker 会直接出现在 powershell.exe 的 -Command 参数里；如果脚本排除的是
      // Electron PID 而不是 PowerShell 自身 PID，扫描器必然把自己误报为资源占用进程。
      const uniqueMarker = `zcode-process-scan-self-${process.pid}-${Date.now()}`;

      await expect(
        // CI/开发机的 WMI 在高负载时可能超过生产 3 秒 fail-open 边界；测试只放宽
        // 查询等待，不改变产品更新路径的超时策略。
        findWindowsProcessesReferencingResourceMarkers([uniqueMarker], 10_000),
      ).resolves.toEqual([]);
    },
  );

  it("builds markers for packaged runtime resource directories", () => {
    const resourcesPath = join(
      "C:",
      "Users",
      "demo",
      "AppData",
      "Local",
      "Programs",
      "ZCode",
      "resources",
    );

    expect(resolveWindowsPackagedResourceLockMarkers(resourcesPath)).toEqual([
      join(resourcesPath, "glm"),
      join(resourcesPath, "tools"),
    ]);
  });

  it("snapshots packaged resource dirs without throwing on missing dirs", () => {
    const root = mkdtempSync(join(tmpdir(), "zcode-resource-snapshot-"));
    try {
      const toolsDir = join(root, "tools");
      mkdirSync(toolsDir, { recursive: true });
      writeFileSync(join(toolsDir, "rg"), "binary", "utf8");

      const snapshot = snapshotWindowsPackagedResources(root);

      expect(snapshot.find((entry) => entry.dir === "tools")).toMatchObject({
        path: toolsDir,
        exists: true,
        entries: ["rg"],
      });
      expect(snapshot.find((entry) => entry.dir === "glm")).toMatchObject({
        exists: false,
        entries: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("probes packaged resource dirs with writable and missing states", () => {
    const root = mkdtempSync(join(tmpdir(), "zcode-resource-probe-"));
    try {
      const glmDir = join(root, "glm");
      mkdirSync(glmDir, { recursive: true });

      const probes = probeWindowsPackagedResourceWritable(root);

      expect(probes.find((entry) => entry.dir === "glm")).toMatchObject({
        path: glmDir,
        exists: true,
        writable: true,
      });
      expect(probes.find((entry) => entry.dir === "tools")).toMatchObject({
        exists: false,
        writable: false,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
