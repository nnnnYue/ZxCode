import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* 守护测试：MCP request-context 命名空间键三方一致。
 *
 * 事故回放（2026-11 定位）：fork rebrand（b8ea19cf）把 client(adapters) 与
 * host(node-repl-host) 两侧统一为 com.zxcode/request-context，但 v3.15.1 / v3.16.2
 * 上游合并把 adapters/src/mcp/index.ts 整文件覆盖回上游的 com.zcode/。host 侧
 * buildRequestMeta 按"安全边界"静默降级为 {}，普通 js 仍可执行，一旦 REPL 代码
 * 触碰 browser/CUA bridge 即报 "node_repl browser request is missing session_id
 * metadata"（browser-bridge.ts / cua-bridge.ts 的硬性必填检查）。
 *
 * 该键属 fork 品牌项（keep-ours，见 REMOVALS.md 第十一节），上游同步不得回退。
 * 这里直接断言两侧源码字面量，任何一侧被打回上游命名都会在本包测试变红，
 * 不依赖运行时链路是否被覆盖。
 */
const HOST_SERVER_PATH = resolve(import.meta.dirname, "../src/server.ts");
const CLIENT_ADAPTER_PATH = resolve(import.meta.dirname, "../../adapters/src/mcp/index.ts");
const FORK_REQUEST_CONTEXT_KEY = "com.zxcode/request-context";
const UPSTREAM_REQUEST_CONTEXT_KEY = "com.zcode/request-context";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("node_repl request-context namespace key", () => {
  it("host reads the fork namespace key", () => {
    expect(readSource(HOST_SERVER_PATH)).toContain(
      `meta?.["${FORK_REQUEST_CONTEXT_KEY}"]`,
    );
  });

  it("client adapter writes the fork namespace key", () => {
    expect(readSource(CLIENT_ADAPTER_PATH)).toContain(
      `"${FORK_REQUEST_CONTEXT_KEY}": requestContext`,
    );
  });

  it("client adapter no longer carries the upstream namespace literal", () => {
    expect(readSource(CLIENT_ADAPTER_PATH)).not.toContain(
      `"${UPSTREAM_REQUEST_CONTEXT_KEY}"`,
    );
  });
});
