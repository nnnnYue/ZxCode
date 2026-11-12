import { PuzzleIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.js";
import { cn } from "@/components/lib/utils.js";
import { buttonVariants } from "@/components/ui/button.js";
import { Spinner } from "@/components/ui/spinner.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { OpenPluginUiSideTabRequest } from "@/plugin-ui/contract.js";
import {
  resolvePluginUiSurfaceTitle,
  usePluginUiSurfaces,
} from "@/plugin-ui/adapters/usePluginUiSurfaces.js";

export interface PluginUiLauncherItemsProps {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  /** 正式会话 id；草稿态为 null，此时不显示入口（面板是会话级，第一版不支持草稿）。 */
  sessionId: string | null;
  onOpenPluginUi: (request: OpenPluginUiSideTabRequest) => void;
  /** 菜单复用标准菜单项；空白页继续使用入口按钮样式。 */
  variant?: "launcher" | "menu";
  itemClassName?: string;
}

export function buildPluginUiLauncherItemId(pluginId: string, surfaceId: string): string {
  return `plugin-ui:${pluginId}/${surfaceId}`;
}

/**
 * "打开标签页"里的插件面板入口，与内建项共用列表/网格。
 * 旧分组容器会占据一个网格单元，导致插件全部挤在同一列；使用 Fragment 让按钮直接参与父级布局。
 */
export function PluginUiLauncherItems(props: PluginUiLauncherItemsProps) {
  const { locale } = useZCodeIntl();
  const surfaces = usePluginUiSurfaces({
    workspacePath: props.workspacePath,
    ...(props.workspaceIdentity ? { workspaceIdentity: props.workspaceIdentity } : {}),
    enabled: props.sessionId !== null,
  });
  if (props.sessionId === null || surfaces.length === 0) return null;
  const sessionId = props.sessionId;
  return (
    <>
      {surfaces.map((surface) => {
        const title = resolvePluginUiSurfaceTitle(surface.title, locale) || surface.id;
        const itemId = buildPluginUiLauncherItemId(surface.pluginId, surface.id);
        const open = () =>
          props.onOpenPluginUi({
            parentSessionId: sessionId,
            surfaceId: surface.id,
            serverName: surface.server,
            pluginId: surface.pluginId,
            resourceUri: surface.resourceUri,
            title,
            workspacePath: props.workspacePath,
            ...(props.workspaceIdentity ? { workspaceIdentity: props.workspaceIdentity } : {}),
            remoteSessionId: props.remoteSessionId ?? null,
          });
        if (props.variant === "menu") {
          return (
            <DropdownMenuItem key={itemId} data-side-pane-add-item={itemId} onSelect={open}>
              <PuzzleIcon className="size-4 text-foreground-subtle" />
              <span className="min-w-0 truncate">{title}</span>
            </DropdownMenuItem>
          );
        }
        return (
          <button
            key={itemId}
            type="button"
            data-side-pane-open-tab-item={itemId}
            className={props.itemClassName}
            onClick={open}
          >
            <PuzzleIcon className="size-4 text-foreground-subtle" />
            <span className="side-pane-open-tab-button-label min-w-0 flex-1 truncate text-left">
              {title}
            </span>
            <span className="truncate text-ui-sm text-foreground-subtlest">
              {surface.pluginName}
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * 「打开标签页」条目：内置应用、UI 插件与扩展共用的横向行（对齐原型 SidePaneAppLauncher）。
 * 整行是一个按钮，尾部「打开」只做视觉胶囊，避免按钮嵌套按钮。
 * 没有 onOpen 时是只读的状态行（如扩展问题行）：不渲染按钮与胶囊，悬停经 title 显示说明。
 */
export function SidePaneLauncherRow({
  itemId,
  icon: Icon,
  avatar,
  label,
  description,
  descriptionTag,
  actionLabel,
  loading,
  disabled,
  title,
  testId,
  onOpen,
}: {
  itemId: string;
  icon: LucideIcon;
  avatar?: ReactNode;
  label: string;
  description?: string;
  descriptionTag?: string;
  actionLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  /** 整行的悬停说明。 */
  title?: string;
  testId?: string;
  onOpen?: () => void;
}) {
  const { intl } = useZCodeIntl();
  const content = (
    <>
      {/* 应用插件复用市场图标来源；固定 PuzzleIcon 会忽略已发布的品牌图片。 */}
      {avatar ?? (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface">
          <Icon className="size-6 text-foreground-subtle" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui-base font-semibold text-foreground">{label}</span>
        {description || descriptionTag ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-ui-sm text-foreground-subtle">
            {descriptionTag ? (
              <span className="inline-flex h-4 shrink-0 items-center rounded-sm bg-tag px-1 text-ui-xs font-medium">
                {descriptionTag}
              </span>
            ) : null}
            {description ? (
              <span className="truncate" title={title ? undefined : description}>
                {description}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </>
  );
  if (!onOpen) {
    return (
      <div
        data-side-pane-open-tab-item={itemId}
        data-testid={testId}
        title={title}
        className="flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2.5 text-left"
      >
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-side-pane-open-tab-item={itemId}
      data-testid={testId}
      title={title}
      className="flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focused"
      onClick={onOpen}
      disabled={disabled}
      aria-busy={loading || undefined}
    >
      {content}
      <span
        aria-hidden="true"
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "shrink-0 rounded-full",
        )}
      >
        {loading ? (
          <Spinner
            data-testid="side-pane-plugin-progress"
            className="size-3.5 motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : null}
        {actionLabel ?? intl.formatMessage({ id: "settings.plugins.store.ui.open" })}
      </span>
    </button>
  );
}
