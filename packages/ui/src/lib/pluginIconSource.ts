import documentsIconUrl from "@/assets/plugin-icons/documents.png";
import imageSearchIconUrl from "@/assets/plugin-icons/image-search.png";
import pdfIconUrl from "@/assets/plugin-icons/pdf.png";
import pluginCreatorIconUrl from "@/assets/plugin-icons/plugin-creator.png";
import presentationsIconUrl from "@/assets/plugin-icons/presentations.png";
import spreadsheetsIconUrl from "@/assets/plugin-icons/spreadsheets.png";
import {
  OFFICIAL_PLUGIN_HERO_BY_ID_GENERATED,
  OFFICIAL_PLUGIN_ICON_BY_ID_GENERATED,
} from "@/lib/officialPluginIcons.generated.js";
import { isTrustedImageUrl } from "@/lib/trustedImageUrl.js";

const OFFICIAL_PLUGIN_ICON_BY_ID: Readonly<Record<string, string>> = {
  "documents@zcode-plugins-official": documentsIconUrl,
  "image-search@zcode-plugins-official": imageSearchIconUrl,
  "pdf@zcode-plugins-official": pdfIconUrl,
  "plugin-creator@zcode-plugins-official": pluginCreatorIconUrl,
  "presentations@zcode-plugins-official": presentationsIconUrl,
  "spreadsheets@zcode-plugins-official": spreadsheetsIconUrl,
  // 官方市场离线化后的随包图标快照（scripts/fetch-official-marketplace.mjs 生成），
  // 覆盖全部官方插件 id；listing 里即便残留远端 icon URL 也不会再被 UI 加载。
  ...OFFICIAL_PLUGIN_ICON_BY_ID_GENERATED,
};

const TRUSTED_BUNDLED_PLUGIN_ICONS = new Set(Object.values(OFFICIAL_PLUGIN_ICON_BY_ID));

/** 按完整身份解析客户端自有图标，避免商店、候选和消息各自维护不同例外。 */
export function resolvePluginIconSource(
  pluginId: string | undefined,
  icon?: string,
): string | undefined {
  if (pluginId) {
    const bundledIcon = OFFICIAL_PLUGIN_ICON_BY_ID[pluginId];
    if (bundledIcon) return bundledIcon;
  }
  return isTrustedImageUrl(icon) ? icon : undefined;
}

/**
 * 详情页 heroImage 与图标同一机制：先查随包快照映射（当前离线目录暂无 hero 资源，
 * 映射为空），再放行受信 HTTPS URL；目录数据由编译期生成，不含任何平台资源地址。
 */
export function resolvePluginHeroSource(
  pluginId: string | undefined,
  heroImage?: string,
): string | undefined {
  if (pluginId) {
    const bundledHero = OFFICIAL_PLUGIN_HERO_BY_ID_GENERATED[pluginId];
    if (bundledHero) return bundledHero;
  }
  return isTrustedImageUrl(heroImage) ? heroImage : undefined;
}

/** Session 投影已完成身份匹配；仅放行固定打包资源，不放宽任意本地 URL。 */
export function isTrustedPluginIconSource(icon: string | undefined): icon is string {
  return Boolean(icon && TRUSTED_BUNDLED_PLUGIN_ICONS.has(icon)) || isTrustedImageUrl(icon);
}
