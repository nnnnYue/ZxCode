import assert from "node:assert/strict";
import test from "node:test";
import type { StorageRootSpec } from "@zcode/shared";
import type {
  FsCleanerPort,
  RootsResolverPort,
  ScanRunnerPort,
  StorageScanProgress,
  StorageScanRunRequest,
} from "../src/storage/app/ports.js";
import { createStorageService } from "../src/storage/app/storageService.js";

const ROOT: StorageRootSpec = {
  id: "root-cache",
  path: "/tmp/demo-cache",
} as StorageRootSpec;

function createDeferredRootsResolver(): RootsResolverPort & {
  release(): void;
} {
  let pending: (() => void) | null = null;
  return {
    async resolveRoots(): Promise<StorageRootSpec[]> {
      if (pending) {
        await new Promise<void>((resolve) => {
          pending = resolve;
        });
      }
      return [ROOT];
    },
    release(): void {
      pending?.();
      pending = null;
    },
  };
}

function createRecordingRunner(): ScanRunnerPort & { requests: StorageScanRunRequest[] } {
  const requests: StorageScanRunRequest[] = [];
  return {
    requests,
    async run(request: StorageScanRunRequest): Promise<StorageScanProgress> {
      requests.push(request);
      return { roots: [], errors: [] };
    },
  };
}

const idleCleaner: FsCleanerPort = {
  async listCandidates() {
    return [];
  },
  async deleteFiles() {
    return { deletedCount: 0, freedBytes: 0, failures: [] };
  },
};

test("startScan 重叠：resolveRoots 等待期间被新扫描取代的 job 不再创建遍历", async () => {
  const resolver = createDeferredRootsResolver();
  const runner = createRecordingRunner();
  const service = createStorageService({ roots: resolver, scanRunner: runner, cleaner: idleCleaner });

  try {
    // 第一次 startScan 停在 resolveRoots 的 IO 等待窗口内。
    const firstStart = service.startScan();
    const secondStart = service.startScan();
    resolver.release();
    const first = await firstStart;
    const second = await secondStart;

    assert.equal(first.jobId, "scan-1");
    assert.equal(second.jobId, "scan-2");
    // 修复前：两次调用都会创建 job 并并发遍历；修复后只有最新一次真正运行。
    assert.equal(runner.requests.length, 1);
    assert.equal(runner.requests[0]?.roots[0]?.id, ROOT.id);
  } finally {
    service.dispose();
  }
});

test("startScan 快照只保留最新 job 的结果", async () => {
  let resolveGate: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    resolveGate = resolve;
  });
  const runner: ScanRunnerPort = {
    async run(request: StorageScanRunRequest): Promise<StorageScanProgress> {
      if (request.signal.aborted) {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      await gate;
      request.onProgress({ roots: [], errors: [] });
      return { roots: [], errors: [] };
    },
  };
  const service = createStorageService({
    roots: { resolveRoots: async () => [ROOT] },
    scanRunner: runner,
    cleaner: idleCleaner,
    progressThrottleMs: 0,
  });

  try {
    await service.startScan();
    const second = await service.startScan();
    resolveGate?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    // 事件流按契约允许旧 job 的 cancelled 终态尾包；但权威快照只能属于最新 job。
    const snapshot = await service.getSnapshot();
    assert.equal(snapshot?.jobId, second.jobId);
  } finally {
    service.dispose();
  }
});
