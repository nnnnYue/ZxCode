# 自部署手机远控 relay 的部署镜像：单进程 node 运行 tsup 单文件产物。
# 构建上下文为本目录（packages/relay）；web 页面产物经 /web-root 卷注入。
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/model-option-map/package.json packages/model-option-map/
COPY packages/shared/package.json packages/shared/
COPY packages/relay/package.json packages/relay/
RUN pnpm --filter @zcode/relay... install --frozen-lockfile --ignore-scripts
COPY packages/model-option-map packages/model-option-map
COPY packages/shared packages/shared
COPY packages/relay packages/relay
RUN pnpm --filter @zcode/relay run build

FROM node:22-alpine
WORKDIR /relay
ENV ZXCODE_RELAY_HOST=0.0.0.0 \
    ZXCODE_RELAY_PORT=8787 \
    ZXCODE_RELAY_WEB_ROOT=/web-root
COPY --from=build /repo/packages/relay/dist/main.js ./main.js
# 未注入 web-root 时显示内置引导页，容器仍可健康启动。
VOLUME ["/web-root"]
EXPOSE 8787
USER node
CMD ["node", "main.js"]
