import { defineConfig } from "tsup";

// 单文件可执行产物：node dist/main.js 直接跑（bin: zxcode-relay）。
// @zcode/shared 走 workspace 源码引用，必须 noExternal 内联进 bundle，
// 否则部署机没有 workspace 源码会以 .ts 扩展名加载失败。
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  sourcemap: true,
  clean: true,
  noExternal: ["@zcode/shared", "@zcode/model-option-map"],
});
