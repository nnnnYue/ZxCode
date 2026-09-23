/* eslint-disable max-lines -- 生成的目录数据文件，条目数随官方市场增长。 */
// 本文件由 scripts/fetch-official-marketplace.mjs 生成，请勿手工编辑。
// 数据来源：官方插件市场 CDN 目录快照（生成时间 2026-09-21T22:03:02.920Z）。
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
    version: "1.0.3",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/mimosa/1.0.3",
      "../official-marketplace/plugins/mimosa/1.0.3",
      "packages/desktop/resources/official-marketplace/plugins/mimosa/1.0.3",
      "../../../resources/official-marketplace/plugins/mimosa/1.0.3",
    ],
    runtimeTopLevelPaths: ["LICENSE", "payload", "README_CN.md"],
    listing: {
      displayName: "Code Security Protection",
      displayName_i18n: {
        en: "Code Security Protection",
        "zh-CN": "代码安全防护",
      },
      description_i18n: {
        en: "Local-first security guardrails for ZxCode with pre-write hooks, end-of-turn review, Git gates, commands, a security-scan skill, and an optional MCP server for sealed deep scans.",
        "zh-CN":
          "面向 ZxCode 的本地优先代码安全防线，提供写入前 Hook、任务收尾复查、Git 门禁、命令、安全扫描 Skill，以及用于密封深扫的可选 MCP 服务。",
      },
      category: "developer-tools",
      author: {
        name: "Mimosa",
      },
    },
  },
  {
    name: "github",
    version: "0.1.2",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/github/0.1.2",
      "../official-marketplace/plugins/github/0.1.2",
      "packages/desktop/resources/official-marketplace/plugins/github/0.1.2",
      "../../../resources/official-marketplace/plugins/github/0.1.2",
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
    version: "0.6.0",
    requiredSeedPaths: [".zcode-plugin/plugin.json"],
    rootCandidates: [
      "official-marketplace/plugins/video2code/0.6.0",
      "../official-marketplace/plugins/video2code/0.6.0",
      "packages/desktop/resources/official-marketplace/plugins/video2code/0.6.0",
      "../../../resources/official-marketplace/plugins/video2code/0.6.0",
    ],
    runtimeTopLevelPaths: ["LICENSE", "mcp", "README_CN.md", "requirements.txt", "tests"],
    listing: {
      description_i18n: {
        en: "Records WebM through ZxCode's built-in Browser Use WebView and converts it to MP4 with ffmpeg for video/URL replication; no Playwright or external Chromium required.",
        "zh-CN":
          "基于 ZxCode 内置 Browser Use WebView 录制 WebM 并用 ffmpeg 转成 MP4/URL 复刻；无需 Playwright 或外部 Chromium",
      },
      category: "productivity",
      author: {
        name: "Z.ai",
        url: "https://z.ai",
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
];
