import { readFileSync, writeFileSync } from "node:fs";

export function rewriteFormalSpecImports(specPath) {
  const original = readFileSync(specPath, "utf8");
  // Bug 根因：pending spec 比 formal spec 多两层目录，只重写 helpers/pages 会让
  // case-local 文件 fixture 在转正后漂移到 packages/desktop/fixtures 并于运行时 ENOENT。
  // 采上游 v3.18.0 通用深度收敛正则：对 fork 原有 3 层场景行为与旧 replaceAll 一致，
  // 且覆盖上游子目录化布局（pending 目录任意深度统一减两层）。
  const rewritten = original.replace(
    /(?:\.\.\/){3,}(?=(?:helpers|pages|bots|fixtures)\/)/gu,
    (prefix) => prefix.slice(6),
  );
  if (rewritten !== original) {
    writeFileSync(specPath, rewritten, "utf8");
  }
}
