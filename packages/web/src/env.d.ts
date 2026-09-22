declare module "*.css";
declare module "@zcode/ui/styles.css";

interface ImportMetaEnv {
  // 本文件手写声明了 Vite env 形状，内置 BASE_URL 也需要显式补上，
  // 否则按构建 base 生成路由时无法通过 typecheck。
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_DEV_ORIGIN?: string;
  readonly VITE_CONVERSATION_SHARE_PREVIEW_MOCK?: string;
  readonly VITE_WEB_REMOTE_ALLOW_DEV_RETURN_TO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
