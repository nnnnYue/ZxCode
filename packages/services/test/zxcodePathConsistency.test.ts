import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { it as test } from "vitest";

/**
 * Bugfix 探针（specs/zxcode-path-consistency.md 检查项 1 的工程化）：
 * 2026-11-14「插件创建器暂不可用」的根因是 host 进程 skillsService 硬编码读上游目录
 * `~/.zcode`，而 fork CLI 把官方插件 cache seed 在 `~/.zxcode`——两个进程读两个数据根，
 * 扫描静默返回空后技能解析失败，被 UI 折叠成"请检查连接"。同类劈叉已在
 * skills / commands / settings-sync / data-sync 六文件一并收口（对照 subagentsService 先例）。
 *
 * 本探针扫 packages/services/src 全部源码：不得出现品牌数据目录字面量 `".zcode"` 与
 * `"~/.zcode"`。`.zcode-plugin`（插件 manifest 约定名，CLI 同款）不含引号紧跟引号的
 * `.zcode` 形态，不会误报；确需读旧上游数据的新代码必须写双名兼容并更新
 * specs/zxcode-path-consistency.md 的允许清单。
 */

const SRC_ROOT = join(import.meta.dirname, "..", "src");

function listTsFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      result.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      result.push(full);
    }
  }
  return result;
}

// 品牌数据目录字面量：字符串恰好是 ".zcode"（join 段）或 "~/.zcode"（兜底路径）。
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /["']\.zcode["']/, label: '字符串字面量 ".zcode"' },
  { pattern: /["']~\/\.zcode["']/, label: '字符串字面量 "~/.zcode"' },
];

test("services 源码不出现 .zcode 品牌目录字面量（fork 收口探针）", () => {
  const violations: string[] = [];
  for (const file of listTsFiles(SRC_ROOT)) {
    // 逐行扫描并跳过注释行：注释可以描述历史劈叉（如 subagentRuntimeConfig 修复说明），
    // 探针只拦真实代码里的字面量。
    const codeLines = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !(trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*"));
      });
    const code = codeLines.join("\n");
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        violations.push(`${file}: ${label}`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `发现 rebrand 劈叉残留（fork 数据根是 .zxcode，见 specs/zxcode-path-consistency.md）:\n${violations.join("\n")}`,
  );
});
