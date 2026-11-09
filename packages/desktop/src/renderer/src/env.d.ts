// fork：renderer tsconfig 没有引入 vite/client 类型，CSS 导入与 import.meta.env 均以
// TS2307/TS2339 记账；此处补最小声明面（对齐 vite/client 语义），不引入 vite 依赖。
declare module "*.css";

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
