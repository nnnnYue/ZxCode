/* eslint-disable max-lines -- 生成的目录数据文件，条目数随官方市场增长。 */
// 本文件由 scripts/fetch-official-marketplace.mjs 生成，请勿手工编辑。
// 数据来源：官方插件市场 CDN 目录快照（生成时间 2026-11-14T03:40:28.908Z）。
//
// 去平台化后官方市场目录完全随包分发：条目与内置插件共用同一 filesystem seed
// 机制（rootCandidates 指向随包解压目录，cachePath 由 bundled-plugins.ts 统一写入
// 应用 storage cache），商店展示走 listing seed，图标由 UI 侧生成的本地映射解析，
// 目录数据与图标 URL 均不再引用任何运行时 CDN 地址。
import type { OfficialPluginDefinition } from "./official-plugin-definitions.js";

export const OFFICIAL_MARKETPLACE_OFFLINE_ENTRIES: readonly OfficialPluginDefinition[] = [
  {
    name: "cloudbase-skills",
    version: "0.1.0",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/cloudbase-skills/0.1.0",
      "../official-marketplace/plugins/cloudbase-skills/0.1.0",
      "packages/desktop/resources/official-marketplace/plugins/cloudbase-skills/0.1.0",
      "../../../resources/official-marketplace/plugins/cloudbase-skills/0.1.0",
    ],
    runtimeTopLevelPaths: ["LICENSE", "README_CN.md", "UPSTREAM.md"],
    listing: {
      description_i18n: {
        en: "CloudBase development skills and MCP integration for building, deploying, and troubleshooting Web, WeChat Mini Program, database, cloud function, CloudRun, storage, and AI projects.",
        "zh-CN":
          "腾讯云 CloudBase 开发技能与 MCP 集成，覆盖 Web、微信小程序、数据库、云函数、云托管、云存储和 AI 项目的开发、部署与排障。",
      },
      category: "developer-tools",
      author: {
        name: "TencentCloudBase",
      },
    },
  },
  {
    name: "mimosa",
    version: "1.0.4",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/mimosa/1.0.4",
      "../official-marketplace/plugins/mimosa/1.0.4",
      "packages/desktop/resources/official-marketplace/plugins/mimosa/1.0.4",
      "../../../resources/official-marketplace/plugins/mimosa/1.0.4",
    ],
    runtimeTopLevelPaths: ["LICENSE", "payload", "README_CN.md"],
    listing: {
      displayName: "Code Security Protection",
      displayName_i18n: {
        en: "Code Security Protection",
        "zh-CN": "代码安全防护",
      },
      description_i18n: {
        en: "Local-first security guardrails for ZCode with pre-write hooks, end-of-turn review, Git gates, commands, a security-scan skill, and an optional MCP server for sealed deep scans.",
        "zh-CN":
          "面向 ZCode 的本地优先代码安全防线，提供写入前 Hook、任务收尾复查、Git 门禁、命令、安全扫描 Skill，以及用于密封深扫的可选 MCP 服务。",
      },
      category: "developer-tools",
      author: {
        name: "Mimosa",
      },
    },
  },
  {
    name: "github",
    version: "0.1.4",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/github/0.1.4",
      "../official-marketplace/plugins/github/0.1.4",
      "packages/desktop/resources/official-marketplace/plugins/github/0.1.4",
      "../../../resources/official-marketplace/plugins/github/0.1.4",
    ],
    runtimeTopLevelPaths: ["README_CN.md", "references", "UPSTREAM.md"],
    listing: {
      description_i18n: {
        en: "GitHub CLI workflows for commits, pull requests, issues, releases, Actions, repositories, Codespaces, and other GitHub resources.",
        "zh-CN":
          "基于 GitHub CLI 的 GitHub 工作流，覆盖提交、Pull Request、Issue、Release、Actions、仓库、Codespaces 等资源。",
      },
      category: "developer-tools",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
    },
  },
  {
    name: "video2code",
    version: "0.6.1",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/video2code/0.6.1",
      "../official-marketplace/plugins/video2code/0.6.1",
      "packages/desktop/resources/official-marketplace/plugins/video2code/0.6.1",
      "../../../resources/official-marketplace/plugins/video2code/0.6.1",
    ],
    runtimeTopLevelPaths: ["LICENSE", "mcp", "README_CN.md", "requirements.txt", "tests"],
    listing: {
      description_i18n: {
        en: "Records WebM through ZCode's built-in Browser Use WebView and converts it to MP4 with ffmpeg for video/URL replication; no Playwright or external Chromium required.",
        "zh-CN":
          "基于 ZCode 内置 Browser Use WebView 录制 WebM 并用 ffmpeg 转成 MP4/URL 复刻；无需 Playwright 或外部 Chromium",
      },
      category: "productivity",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
    },
  },
  {
    name: "autoresearch",
    version: "0.1.0",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/autoresearch/0.1.0",
      "../official-marketplace/plugins/autoresearch/0.1.0",
      "packages/desktop/resources/official-marketplace/plugins/autoresearch/0.1.0",
      "../../../resources/official-marketplace/plugins/autoresearch/0.1.0",
    ],
    runtimeTopLevelPaths: ["LICENSE", "mcp", "README_CN.md", "tests"],
    listing: {
      description_i18n: {
        en: "Autonomous experiment loop for ZCode: set a goal, pick a mechanical metric, and let the agent iterate. It measures, keeps what works, reverts what doesn't, and repeats.",
        "zh-CN":
          "ZCode 自主实验循环：设定目标与机械度量，让 agent 迭代。每一轮测量、保留有效改动、回滚无效改动，如此往复。",
      },
      category: "developer-tools",
      author: {
        name: "luochang212",
        url: "https://github.com/luochang212",
      },
      examplePrompts: [
        "Run an experiment loop to make this benchmark faster without breaking the checks",
        "Which approaches were tried so far, and why were the discarded ones rejected?",
      ],
      examplePrompts_i18n: {
        "zh-CN": [
          "跑一个实验循环，在不破坏正确性检查的前提下把这个基准跑得更快",
          "到目前为止试过哪些方向？被丢弃的那些为什么被丢弃？",
        ],
      },
    },
  },
  {
    name: "accounting-and-reporting",
    version: "0.1.1",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/accounting-and-reporting/0.1.1",
      "../official-marketplace/plugins/accounting-and-reporting/0.1.1",
      "packages/desktop/resources/official-marketplace/plugins/accounting-and-reporting/0.1.1",
      "../../../resources/official-marketplace/plugins/accounting-and-reporting/0.1.1",
    ],
    runtimeTopLevelPaths: ["README_CN.md", "UPSTREAM.md"],
    listing: {
      displayName: "核算与报告",
      displayName_i18n: {
        en: "Accounting & Reporting",
        "zh-CN": "核算与报告",
      },
      description_i18n: {
        en: "Accounting close and statutory reporting off the company's own ledger: month-end close checks, ledger reconciliation to transaction-level root cause, account mapping for consolidation, and statutory statements delivered as review-ready drafts",
        "zh-CN":
          "【企业财务】核算与报告:月结关账检查与阻断项、总账与明细账勾稽及交易级差异归因、科目映射与重分类、内部管理报表编制、三表勾稽复核",
      },
      category: "finance",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
    },
  },
  {
    name: "gitlab",
    version: "0.1.3",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/gitlab/0.1.3",
      "../official-marketplace/plugins/gitlab/0.1.3",
      "packages/desktop/resources/official-marketplace/plugins/gitlab/0.1.3",
      "../../../resources/official-marketplace/plugins/gitlab/0.1.3",
    ],
    runtimeTopLevelPaths: ["LICENSE", "README_CN.md", "references", "UPSTREAM.md"],
    listing: {
      description_i18n: {
        en: "GitLab CLI workflows based on GitLab's official Agent Skills for merge requests, issues, CI/CD, repositories, releases, and API operations.",
        "zh-CN":
          "基于官方 GitLab CLI 的 Merge Request、Issue、CI/CD、仓库、Release 与 API 工作流。",
      },
      category: "developer-tools",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
    },
  },
  {
    name: "alibaba-cloud-cli",
    version: "0.1.2",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/alibaba-cloud-cli/0.1.2",
      "../official-marketplace/plugins/alibaba-cloud-cli/0.1.2",
      "packages/desktop/resources/official-marketplace/plugins/alibaba-cloud-cli/0.1.2",
      "../../../resources/official-marketplace/plugins/alibaba-cloud-cli/0.1.2",
    ],
    runtimeTopLevelPaths: ["README_CN.md"],
    listing: {
      displayName: "Alibaba Cloud CLI",
      displayName_i18n: {
        en: "Alibaba Cloud CLI",
        "zh-CN": "阿里云 CLI",
      },
      description_i18n: {
        en: "Alibaba Cloud CLI workflows for credential setup, profile checks, and safe cloud resource operations.",
        "zh-CN": "阿里云 CLI 工作流：配置凭证与 profile，并安全执行云资源查询和操作。",
      },
      category: "developer-tools",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
    },
  },
  {
    name: "lark-cli",
    version: "0.1.2",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/lark-cli/0.1.2",
      "../official-marketplace/plugins/lark-cli/0.1.2",
      "packages/desktop/resources/official-marketplace/plugins/lark-cli/0.1.2",
      "../../../resources/official-marketplace/plugins/lark-cli/0.1.2",
    ],
    runtimeTopLevelPaths: ["README_CN.md"],
    listing: {
      displayName: "Lark CLI",
      displayName_i18n: {
        en: "Lark CLI",
        "zh-CN": "飞书 CLI",
      },
      description_i18n: {
        en: "Lark CLI workflows for docs, sheets, Base, calendar, messaging, and other SaaS resources with guided setup and OAuth login.",
        "zh-CN":
          "Lark CLI 工作流：覆盖文档、表格、多维表格、日历、消息等 SaaS 资源，并引导应用配置与 OAuth 登录。",
      },
      category: "productivity",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
    },
  },
  {
    name: "tencent-meeting-cli",
    version: "0.1.3",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/tencent-meeting-cli/0.1.3",
      "../official-marketplace/plugins/tencent-meeting-cli/0.1.3",
      "packages/desktop/resources/official-marketplace/plugins/tencent-meeting-cli/0.1.3",
      "../../../resources/official-marketplace/plugins/tencent-meeting-cli/0.1.3",
    ],
    runtimeTopLevelPaths: ["README_CN.md"],
    listing: {
      displayName: "Tencent Meeting CLI",
      displayName_i18n: {
        en: "Tencent Meeting CLI",
        "zh-CN": "腾讯会议 CLI",
      },
      description_i18n: {
        en: "Tencent Meeting CLI workflows with OAuth2 setup, meeting management, recordings, and attendee reports.",
        "zh-CN": "腾讯会议 CLI 工作流：OAuth2 授权、会议管理、录制管理和参会报告查询。",
      },
      category: "productivity",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
    },
  },
  {
    name: "dingtalk-cli",
    version: "0.1.1",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/dingtalk-cli/0.1.1",
      "../official-marketplace/plugins/dingtalk-cli/0.1.1",
      "packages/desktop/resources/official-marketplace/plugins/dingtalk-cli/0.1.1",
      "../../../resources/official-marketplace/plugins/dingtalk-cli/0.1.1",
    ],
    runtimeTopLevelPaths: ["README_CN.md"],
    listing: {
      displayName: "DingTalk CLI",
      displayName_i18n: {
        en: "DingTalk CLI",
        "zh-CN": "钉钉 CLI",
      },
      description_i18n: {
        en: "DingTalk Workspace CLI workflows with OAuth/device authorization, profile checks, and optional upstream Skills.",
        "zh-CN": "钉钉 Workspace CLI 工作流：OAuth/设备授权、验证组织账号，并按需安装上游 Skills。",
      },
      category: "productivity",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
      homepage: "https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli",
    },
  },
  {
    name: "wecom-cli",
    version: "0.1.1",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/wecom-cli/0.1.1",
      "../official-marketplace/plugins/wecom-cli/0.1.1",
      "packages/desktop/resources/official-marketplace/plugins/wecom-cli/0.1.1",
      "../../../resources/official-marketplace/plugins/wecom-cli/0.1.1",
    ],
    runtimeTopLevelPaths: ["README_CN.md"],
    listing: {
      displayName: "WeCom CLI",
      displayName_i18n: {
        en: "WeCom CLI",
        "zh-CN": "企业微信 CLI",
      },
      description_i18n: {
        en: "WeCom CLI workflows for messages, docs, sheets, mail, calendar, meetings, contacts, and todos with QR authentication.",
        "zh-CN":
          "企业微信 CLI 工作流：覆盖消息、文档、表格、邮件、日历、会议、通讯录和待办，并支持扫码授权与状态检查。",
      },
      category: "productivity",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
      homepage: "https://github.com/WecomTeam/wecom-cli",
    },
  },
  {
    name: "obsidian",
    version: "0.1.2",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/obsidian/0.1.2",
      "../official-marketplace/plugins/obsidian/0.1.2",
      "packages/desktop/resources/official-marketplace/plugins/obsidian/0.1.2",
      "../../../resources/official-marketplace/plugins/obsidian/0.1.2",
    ],
    runtimeTopLevelPaths: ["LICENSE", "README_CN.md", "UPSTREAM.md"],
    listing: {
      displayName: "Obsidian",
      displayName_i18n: {
        en: "Obsidian",
        "zh-CN": "Obsidian",
      },
      description_i18n: {
        en: "Obsidian authoring skills from kepano/obsidian-skills: Obsidian Flavored Markdown notes, Bases database views, JSON Canvas boards, vault automation via Obsidian CLI, clean web extraction with Defuddle, and Knap template rendering — plus visualization skills from axtonliu/axton-obsidian-visual-skills: Mermaid and Excalidraw diagram generation and text-to-canvas layout. A setup skill verifies and installs the Obsidian CLI, defuddle, and knap.",
        "zh-CN":
          "来自 kepano/obsidian-skills 的 Obsidian 创作技能：Obsidian 风格 Markdown 笔记、Bases 数据库视图、JSON Canvas 白板、Obsidian CLI 库操作、Defuddle 网页正文提取、Knap 模板批量生成笔记；并集成 axtonliu/axton-obsidian-visual-skills 的可视化技能：Mermaid/Excalidraw 图表生成与文本转画布布局。附 setup 技能，检测并安装 Obsidian CLI、defuddle 与 knap。",
      },
      category: "productivity",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
      },
    },
  },
  {
    name: "zcode-mcp-app-dev",
    version: "0.1.1",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/zcode-mcp-app-dev/0.1.1",
      "../official-marketplace/plugins/zcode-mcp-app-dev/0.1.1",
      "packages/desktop/resources/official-marketplace/plugins/zcode-mcp-app-dev/0.1.1",
      "../../../resources/official-marketplace/plugins/zcode-mcp-app-dev/0.1.1",
    ],
    runtimeTopLevelPaths: ["README_CN.md"],
    listing: {
      description_i18n: {
        en: "Develop MCP Apps for ZCode with official SDKs and a small host-extension reference.",
        "zh-CN": "使用官方 SDK 开发 ZCode MCP App，附宿主扩展约定与独立构建指引。",
      },
      category: "developer-tools",
      author: {
        name: "ZCode",
      },
    },
  },
  {
    name: "excalidraw",
    version: "0.3.4",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/excalidraw/0.3.4",
      "../official-marketplace/plugins/excalidraw/0.3.4",
      "packages/desktop/resources/official-marketplace/plugins/excalidraw/0.3.4",
      "../../../resources/official-marketplace/plugins/excalidraw/0.3.4",
    ],
    runtimeTopLevelPaths: ["LICENSE", "licenses"],
    listing: {
      displayName: "Excalidraw",
      displayName_i18n: {
        en: "Excalidraw",
        "zh-CN": "Excalidraw",
      },
      description_i18n: {
        en: "Create and edit diagrams with Excalidraw and MCP tools.",
        "zh-CN": "让 Agent 生成图形，在对话侧栏用 Excalidraw 编辑、引用选区、继续修改并导出。",
      },
      category: "productivity",
      author: {
        name: "zcoder",
      },
    },
  },
  {
    name: "pdfcraft",
    version: "0.2.4",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/pdfcraft/0.2.4",
      "../official-marketplace/plugins/pdfcraft/0.2.4",
      "packages/desktop/resources/official-marketplace/plugins/pdfcraft/0.2.4",
      "../../../resources/official-marketplace/plugins/pdfcraft/0.2.4",
    ],
    runtimeTopLevelPaths: ["README_CN.md"],
    listing: {
      displayName: "PdfCraft",
      displayName_i18n: {
        en: "PdfCraft",
        "zh-CN": "PdfCraft",
      },
      description_i18n: {
        en: "PdfCraft PDF editing in a ZCode panel, with workspace file opening and host-mediated exports.",
        "zh-CN":
          "在 ZCode 面板中使用 PdfCraft 进行PDF 编辑，支持打开工作区文件和通过宿主保存导出。",
      },
      category: "productivity",
      author: {
        name: "zcoder",
      },
    },
  },
  {
    name: "wordcraft",
    version: "0.2.4",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/wordcraft/0.2.4",
      "../official-marketplace/plugins/wordcraft/0.2.4",
      "packages/desktop/resources/official-marketplace/plugins/wordcraft/0.2.4",
      "../../../resources/official-marketplace/plugins/wordcraft/0.2.4",
    ],
    runtimeTopLevelPaths: ["README_CN.md"],
    listing: {
      displayName: "WordCraft",
      displayName_i18n: {
        en: "WordCraft",
        "zh-CN": "WordCraft",
      },
      description_i18n: {
        en: "WordCraft word processing in a ZCode panel, with workspace file opening and host-mediated exports.",
        "zh-CN":
          "在 ZCode 面板中使用 WordCraft 进行文字处理，支持打开工作区文件和通过宿主保存导出。",
      },
      category: "productivity",
      author: {
        name: "zcoder",
      },
    },
  },
  {
    name: "gridcraft",
    version: "0.2.4",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/gridcraft/0.2.4",
      "../official-marketplace/plugins/gridcraft/0.2.4",
      "packages/desktop/resources/official-marketplace/plugins/gridcraft/0.2.4",
      "../../../resources/official-marketplace/plugins/gridcraft/0.2.4",
    ],
    runtimeTopLevelPaths: ["README_CN.md"],
    listing: {
      displayName: "GridCraft",
      displayName_i18n: {
        en: "GridCraft",
        "zh-CN": "GridCraft",
      },
      description_i18n: {
        en: "GridCraft spreadsheets in a ZCode panel, with workspace file opening and host-mediated exports.",
        "zh-CN":
          "在 ZCode 面板中使用 GridCraft 进行电子表格，支持打开工作区文件和通过宿主保存导出。",
      },
      category: "productivity",
      author: {
        name: "zcoder",
      },
    },
  },
  {
    name: "jupyter-notebook",
    version: "0.2.1",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/jupyter-notebook/0.2.1",
      "../official-marketplace/plugins/jupyter-notebook/0.2.1",
      "packages/desktop/resources/official-marketplace/plugins/jupyter-notebook/0.2.1",
      "../../../resources/official-marketplace/plugins/jupyter-notebook/0.2.1",
    ],
    runtimeTopLevelPaths: ["LICENSE", "README_CN.md"],
    listing: {
      displayName: "Jupyter Notebook",
      displayName_i18n: {
        en: "Jupyter Notebook",
        "zh-CN": "Jupyter Notebook",
      },
      description_i18n: {
        en: "Work on Jupyter notebooks in a side panel: connect to a running Jupyter Server or start one for the workspace, and edit and run cells together with the agent.",
        "zh-CN":
          "在对话侧栏打开 Jupyter Notebook：连接已有的 Jupyter Server 或为工作区启动一个，Agent 与用户一起编辑和运行 cell。",
      },
      category: "developer-tools",
      author: {
        name: "ZCode",
      },
    },
  },
  {
    name: "typst-workbench",
    version: "0.2.0",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/typst-workbench/0.2.0",
      "../official-marketplace/plugins/typst-workbench/0.2.0",
      "packages/desktop/resources/official-marketplace/plugins/typst-workbench/0.2.0",
      "../../../resources/official-marketplace/plugins/typst-workbench/0.2.0",
    ],
    runtimeTopLevelPaths: ["LICENSE", "README_CN.md"],
    listing: {
      displayName: "Typst Workbench",
      displayName_i18n: {
        en: "Typst Workbench",
        "zh-CN": "Typst 工作台",
      },
      description_i18n: {
        en: "Live-preview Typst documents in a side panel with the Typst installed on your computer: the preview updates the moment the agent saves a file, the agent checks errors, looks at rendered pages, points at places in the preview and exports PDFs, and you can send selected text to the agent together with its source location.",
        "zh-CN":
          "用你本机的 Typst 在对话侧栏实时预览文档：Agent 改完文件预览即刻更新，查看错误与渲染页面、在预览中标出位置、导出 PDF；你可以选中预览中的文字，连同对应的源码位置发给 Agent。",
      },
      category: "productivity",
      author: {
        name: "ZCode",
      },
    },
  },
  {
    name: "zotero",
    version: "0.2.1",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/zotero/0.2.1",
      "../official-marketplace/plugins/zotero/0.2.1",
      "packages/desktop/resources/official-marketplace/plugins/zotero/0.2.1",
      "../../../resources/official-marketplace/plugins/zotero/0.2.1",
    ],
    runtimeTopLevelPaths: ["LICENSE", "README_CN.md"],
    listing: {
      displayName: "Zotero",
      displayName_i18n: {
        en: "Zotero",
        "zh-CN": "Zotero",
      },
      description_i18n: {
        en: "Work with your Zotero library in a side panel: search and read papers and your highlights, let the agent highlight evidence in PDFs, cite and keep a .bib file, and import papers, write notes and organise collections.",
        "zh-CN":
          "在对话侧栏使用你的 Zotero 文库：搜索与阅读论文和你的高亮，Agent 在 PDF 中标出依据、生成引用与 .bib 文件，并可导入论文、写笔记、整理分类。",
      },
      category: "productivity",
      author: {
        name: "ZCode",
      },
    },
  },
  {
    name: "anet",
    version: "0.1.3",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/anet/0.1.3",
      "../official-marketplace/plugins/anet/0.1.3",
      "packages/desktop/resources/official-marketplace/plugins/anet/0.1.3",
      "../../../resources/official-marketplace/plugins/anet/0.1.3",
    ],
    runtimeTopLevelPaths: ["bin", "LICENSE", "README_CN.md"],
    listing: {
      displayName: "AgentNetwork (anet)",
      displayName_i18n: {
        en: "AgentNetwork (anet)",
        "zh-CN": "AgentNetwork（anet）",
      },
      description_i18n: {
        en: "Delegate tasks to other AI agents over A2A through a local AgentNetwork (anet) node: find agents, send and track end-to-end encrypted tasks, settle priced skills within operator limits, and answer tasks sent to this node.",
        "zh-CN":
          "通过本机 AgentNetwork（anet）节点经 A2A 协议把任务交给其他 AI 智能体：发现智能体，发送并跟踪端到端加密的任务，在运营者设定的额度内支付付费技能，并答复其他智能体发给本节点的任务。",
      },
      category: "developer-tools",
      author: {
        name: "Agent Network Research",
        url: "https://agentnetwork.org.cn",
      },
    },
  },
  {
    name: "ruic-card",
    version: "1.1.1",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/ruic-card/1.1.1",
      "../official-marketplace/plugins/ruic-card/1.1.1",
      "packages/desktop/resources/official-marketplace/plugins/ruic-card/1.1.1",
      "../../../resources/official-marketplace/plugins/ruic-card/1.1.1",
    ],
    runtimeTopLevelPaths: ["assets", "LICENSE", "README_CN.md"],
    listing: {
      description_i18n: {
        en: "Holographic collectible-card generator: layered artwork + Blender + Three.js, in two routes - paint the four layers from a description or reference image, or derive them from a photo you already have (rembg cutout, optional watermark removal, animation render and MP4 / WeChat-sized GIF deliverables). Outputs an interactive parallax card website plus an editable card.blend project.",
        "zh-CN":
          "全息闪卡生成器：分层画稿 + Blender + Three.js，两条路线——用描述或参考图绘制四层图，或直接把已有照片切成四层（rembg 抠图、可选去水印，附动画渲染与 MP4 / 微信动图交付）。产出可交互的 3D 视差闪卡网页与可编辑的 card.blend 工程。",
      },
      category: "游戏/3D",
      author: {
        name: "liuzhiqiang23",
        url: "https://github.com/liuzhiqiang23",
      },
    },
  },
];
