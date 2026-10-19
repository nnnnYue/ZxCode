import { describe, expect, it } from "vitest";

import {
  decodeMarkdownArtifactImageSource,
  extractMarkdownArtifactImageRefs,
  rewriteMarkdownArtifactImageSources,
} from "../src/markdown-artifact-images.js";

describe("Markdown artifact image references", () => {
  it("extracts only image destinations and deduplicates them", () => {
    expect(
      extractMarkdownArtifactImageRefs(
        [
          "![first](zxcode-artifact://session/a)",
          "[download](zxcode-artifact://session/not-an-image)",
          '![again](<zxcode-artifact://session/a> "preview")',
          "![second](zxcode-artifact://session/b 'title')",
        ].join("\n"),
      ),
    ).toEqual(["zxcode-artifact://session/a", "zxcode-artifact://session/b"]);
  });

  it("does not authorize image-looking text inside fenced code", () => {
    expect(
      extractMarkdownArtifactImageRefs(
        "```md\n![secret](zxcode-artifact://session/secret)\n```\n![ok](zxcode-artifact://session/ok)",
      ),
    ).toEqual(["zxcode-artifact://session/ok"]);
  });

  it("rewrites artifact image destinations to a harden-safe relative source", () => {
    const rewritten = rewriteMarkdownArtifactImageSources(
      "before ![shot](zxcode-artifact://session/shot-1) after",
    );
    expect(rewritten).not.toContain("zxcode-artifact://");
    const source = rewritten.match(/!\[shot\]\(([^)]+)\)/u)?.[1];
    expect(source).toBeTruthy();
    expect(decodeMarkdownArtifactImageSource(source ?? "")).toBe("zxcode-artifact://session/shot-1");
  });

  it("leaves normal images, links, and fenced examples unchanged", () => {
    const markdown = [
      "![web](https://example.com/image.png)",
      "[artifact](zxcode-artifact://session/file)",
      "```md",
      "![example](zxcode-artifact://session/example)",
      "```",
    ].join("\n");
    expect(rewriteMarkdownArtifactImageSources(markdown)).toBe(markdown);
  });
});
