# 官方市场 CDN 快照策展政策

2026-11-14 创建。fork 的官方市场是**随包离线快照**（已移除运行时目录自动刷新），且
官方 id 冒用守卫（adapters/src/plugins/marketplace.ts）拒绝把官方 CDN 目录作为个人来源
添加——**线上有什么不等于随包有什么，收录必须显式策展**。本文件是收录裁决依据，
配套 `scripts/fetch-official-marketplace.mjs` 的 `CURATED_PLUGIN_NAMES` 白名单执行。

## 收录原则

1. **官方平台运行时依赖不收**：挂载 `${ZXCODE_BASE_URL}` / 官方 JWT 的插件随包也不可用，
   进 `REMOVED_PLUGIN_NAMES` 下架清单（specs/official-marketplace-removal-list.md）。
2. **云依赖工作台不收**：核心功能依赖外部云服务才能工作的面板/工作台类插件剔除；
   仅连接用户自建本地服务（本机 Jupyter Server、本地 Zotero、本机 Typst/Blender）的不算。
3. **收录以常用生产力为先**：游戏引擎/3D 生成类（unity、blender、godot、unreal-engine、
   tripo-3d、hyper3d-rodin、libtv-cli、kicad）与低频专业编辑面板（photocraft、
   vectorcraft、deckcraft、soundcraft、cadcraft、designcraft）暂不收录，用户点名可后续增补。
4. 白名单是**正向封闭集**：线上新增插件默认不收；清单内插件从线上消失时刷新必须报错
   （防止悄悄下架后快照悬空）。

## 当前收录清单（2026-11-14 拍板并完成联网审查，快照 12 → 23 插件）

现有 12 个全部保留（github 升 0.1.4、mimosa 升 1.0.4、video2code 升 0.6.1）：

accounting-and-reporting、alibaba-cloud-cli、cloudbase-skills、dingtalk-cli、gitlab、
github、lark-cli、mimosa、obsidian、tencent-meeting-cli、video2code、wecom-cli

新增 11 个（原拍板 12 个，联网依赖审查剔除 1 个）：

- 工作台类：excalidraw、jupyter-notebook、zotero、typst-workbench、ruic-card
- 轻量工具类：zcode-mcp-app-dev、anet、autoresearch
- \*craft office 三件：pdfcraft、wordcraft、gridcraft

下架清单 14 → 16：新增 image-generation、video-generation（官方平台依赖，随包不可用）。

### 联网依赖审查结论（2026-11-14，逐插件下载线上 zip 解包检查）

- **剔除 jev-decisions**：`.mcp.json` 经 `npx -y @jkudish/jev-mcp` 注入
  `TYPESAFE_API_KEY`（docs.typesafe.ai 商业云 API）；README 明示「Every tool call
  sends the input text to the TypeSafe Jev API…billed per input token」，11 个判断
  工具全部走该云 API、无本地替代，按原则 2 剔除。
- **保留 anet**：节点为本机开源进程（stdio 转发本地 daemon），插件自身不开连接；hub
  中继由用户选择、组织可自建（anet-setup skill 原文「an organization may run its
  own」），无官方平台端点、无 key 计费；安装器从 agentnetwork.org.cn 拉取二进制，与
  ruic-card 的 ensure_blender.py 下载 Blender 同性质。
- 其余 10 个均为本地链路：jupyter-notebook 连接/启动本机 Jupyter Server；zotero 只
  接受本机地址（默认 127.0.0.1:23119）；typst-workbench 用本机 Typst；ruic-card 明令
  禁止换用需 key 的付费 API、Blender 本机下载渲染；zcode-mcp-app-dev 纯 skill 文档
  无服务器；autoresearch 本地 benchmark 循环（.auto/measure.sh + git + 127.0.0.1
  dashboard）；pdfcraft/wordcraft/gridcraft/excalidraw 均为本地面板 server，dist 内
  无外部 API 端点（URL 命中仅为打包校验库的 schema/github 参考串）。

## 刷新流程（每次发版可增量执行）

1. `node scripts/fetch-official-marketplace.mjs`（网络走代理 `http://127.0.0.1:7897` 时
   先设 `HTTPS_PROXY`；脚本按白名单过滤、sha256 校验、字节级幂等）。
2. 手工删除被升级插件的旧版本目录与 `.staged-*.json` 标记（脚本不自动清理旧版本）。
3. `pnpm typecheck` + `pnpm lint`（两个生成 TS 会重写）+ bootstrap
   `official-plugin-defaults` 测试；白名单过滤语义由
   `scripts/test/official-marketplace-curation.test.mjs` 回归（随 `test:architecture`
   运行）。
4. 打包时注意 `audit-bundle-size.mjs` 的 500MiB 产物上限（2026-11-14 刷新后快照解压
   体积约 176MB，刷新前 10MB）。
5. 快照目录（`packages/desktop/resources/official-marketplace/`）是 zip 字节级解包的
   第三方内容，不参与 oxlint/oxfmt（两份根配置的 ignorePatterns 已登记）——上游打包
   产物会触发 max-lines 与 WebGL API 名误报 rules-of-hooks，且内容不得改写格式。
