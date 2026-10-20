import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Web home-only media preview service", () => {
  it("declares an explicit unsupported service before a workspace bridge exists", () => {
    const source = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
    expect(source).toContain("mediaPreviewService:");
    // fork 格式化把泛型折成多行、实参带尾逗号；断言按去空白并去掉 `)` 前尾逗号后的紧凑形态比较。
    const compact = source.replace(/\s+/g, "").replace(/,\)/g, ")");
    expect(compact).toContain(
      'createUnsupportedHomeOnlyService<NonNullable<RootServices["mediaPreviewService"]>>("mediaPreviewService")',
    );
  });
});
