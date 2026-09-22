import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ProviderConfigLayerSnapshot, ProviderSource } from "@zcode/provider";
import { decodeZCodeBuiltinRelease, type ZCodeBuiltinRelease } from "./zcode-builtin-release.js";

export interface NodeZCodeBuiltinProviderConfigSourceOptions {
  readonly bundledFilePath: string;
}

/**
 * 内置 Provider 目录已改为纯打包文件：不再有 Active/LKG 缓存与远端同步，
 * Source 只读取随包基线并发布为 Config Snapshot。
 */
export class NodeZCodeBuiltinProviderConfigSource implements ProviderSource<ProviderConfigLayerSnapshot> {
  readonly #bundledFilePath: string;
  readonly #sourceKey: string;
  #disposed = false;

  constructor(options: NodeZCodeBuiltinProviderConfigSourceOptions) {
    const bundledFilePath = options.bundledFilePath.trim();
    if (!bundledFilePath) throw new Error("ZxCode Built-in bundledFilePath 不能为空");
    this.#bundledFilePath = bundledFilePath;
    // 旧标识只有发布序号，不同 Endpoint 同序号会让 Registry 误复用上一来源。
    // 路径哈希保留同一 revision 语义；远端同步删除后该路径即随包基线本身。
    this.#sourceKey = createHash("sha256").update(resolve(this.#bundledFilePath)).digest("hex");
  }

  get bundledFilePath(): string {
    return this.#bundledFilePath;
  }

  /** ProviderSource 合同保留；纯打包文件不再产生变更事件，订阅集合恒为空。 */
  onDidChange(_listener: (reason: string) => void): () => void {
    return () => undefined;
  }

  async read(): Promise<ProviderConfigLayerSnapshot> {
    this.#assertNotDisposed();
    const release = await readRelease(this.#bundledFilePath);
    return snapshotFromRelease(release, this.#sourceKey);
  }

  dispose(): void {
    this.#disposed = true;
  }

  #assertNotDisposed(): void {
    if (this.#disposed) throw new Error("NodeZCodeBuiltinProviderConfigSource 已 dispose");
  }
}

export function createNodeZCodeBuiltinProviderConfigSource(
  options: NodeZCodeBuiltinProviderConfigSourceOptions,
): NodeZCodeBuiltinProviderConfigSource {
  return new NodeZCodeBuiltinProviderConfigSource(options);
}

async function readRelease(filePath: string): Promise<ZCodeBuiltinRelease> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`ZxCode Built-in Provider Config 不可用: ${filePath}`, { cause: error });
  }
  return decodeZCodeBuiltinRelease(JSON.parse(raw));
}

function snapshotFromRelease(
  release: ZCodeBuiltinRelease,
  sourceKey: string,
): ProviderConfigLayerSnapshot {
  return Object.freeze({
    revision: `zxcode-builtin:${release.revision}:${sourceKey}`,
    providers: release.config.providers,
    providerTemplates: release.config.providerTemplates,
    models: release.config.modelConfigRules,
  });
}
