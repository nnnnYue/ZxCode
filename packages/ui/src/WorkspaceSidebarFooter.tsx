import { SidebarNativeTooltip, ControlHintTooltip } from "@/ControlHintTooltip.js";
/* oxlint-disable eslint(max-lines) -- footer 聚合账户、主题、模式和快捷键菜单。 */
import type { Locale, UserInfo } from "@zcode/shared";
import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import { DesktopCommandIds } from "@zcode/shared";
import {
  TID_LOGIN_MENU_ITEM,
  TID_LOGIN_TRIGGER,
  TID_LOGOUT_BUTTON,
  TID_TASK_SETTINGS_BUTTON,
} from "@zcode/shared/test-ids";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { PencilRuler, Globe, Maximize, Palette, Settings, ZoomIn, ZoomOut } from "lucide-react";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useShortcutCommandLabel } from "@/shortcuts/useShortcutBindings.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import { normalizeInterfaceMode } from "@/lib/interfaceMode.js";
import type { Theme } from "@/useTheme.js";
import { WorkspaceWebRemoteControlTrigger } from "@/WorkspaceWebRemoteControlTrigger.js";

const DESKTOP_ZOOM_MIN_LEVEL = -3;
const DESKTOP_ZOOM_MAX_LEVEL = 5;

export const WorkspaceSidebarFooter = memo(function WorkspaceSidebarFooterComponent({
  theme,
  localeMenuValue,
  onLocaleChange,
  onThemeChange,
  onSettingsButtonClick,
  settingsButtonMode = "settings",
  isDesktop = false,
  workspacePath,
  workspaceIdentity,
  workspaceRemoteSessionId,
  activeTaskId,
  banner,
  className,
}: {
  theme: Theme;
  localeMenuValue: Locale | "system";
  onLocaleChange: (value: string) => void;
  onThemeChange: (value: string) => void;
  onSettingsButtonClick?: () => void;
  settingsButtonMode?: "settings" | "back";
  isDesktop?: boolean;
  workspacePath?: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  activeTaskId?: string | null;
  banner?: ReactNode;
  className?: string;
}) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const interfaceMode = useZCodeStore((state) => state.interfaceMode);
  const setInterfaceMode = useZCodeStore((state) => state.setInterfaceMode);
  const zoomInShortcutLabel = useShortcutCommandLabel("zoomIn");
  const zoomOutShortcutLabel = useShortcutCommandLabel("zoomOut");
  const resetZoomShortcutLabel = useShortcutCommandLabel("resetZoom");
  const settingsButtonLabel =
    settingsButtonMode === "back"
      ? intl.formatMessage({ id: "workspace.backToWorkspace" })
      : intl.formatMessage({ id: "settings.title" });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [desktopZoomLevel, setDesktopZoomLevel] = useState(0);
  const runDesktopZoomCommand = useCallback(
    (command: (typeof DesktopCommandIds)["ZoomIn" | "ZoomOut" | "ResetZoom"]) => {
      void platform.executeDesktopCommand(command);
    },
    [platform],
  );

  useEffect(() => {
    if (!isDesktop) {
      setDesktopZoomLevel(0);
      return;
    }

    let isCancelled = false;
    void platform.getDesktopZoomLevel?.().then((state) => {
      if (!isCancelled && Number.isFinite(state.zoomLevel)) {
        setDesktopZoomLevel(state.zoomLevel);
      }
    });

    const dispose = platform.onDesktopZoomLevelChanged?.((state) => {
      if (Number.isFinite(state.zoomLevel)) {
        setDesktopZoomLevel(state.zoomLevel);
      }
    });

    return () => {
      isCancelled = true;
      dispose?.();
    };
  }, [isDesktop, platform]);

  const canResetDesktopZoom = desktopZoomLevel !== 0;
  const canZoomIn = desktopZoomLevel < DESKTOP_ZOOM_MAX_LEVEL;
  const canZoomOut = desktopZoomLevel > DESKTOP_ZOOM_MIN_LEVEL;

  return (
    // footer 被 Settings 复用，页面专属边距由调用方传入，避免修改共享默认样式。
    <footer className={cn("flex shrink-0 flex-col gap-2.5 px-4 pt-2 pb-4", className)}>
      {banner}
      <div className="flex min-w-0 gap-2">
        <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
          <DropdownMenuTrigger asChild>
            {/* 偏好菜单（语言/主题/界面模式/缩放）收敛在这个入口；账号区块已随登录功能删除。 */}
            <Button
              type="button"
              variant="ghost"
              size={"lg"}
              className="min-w-0 flex-1 justify-start gap-2 overflow-hidden rounded-tl-2xl rounded-bl-2xl border-0 pl-0"
              aria-label={intl.formatMessage({ id: "settings.title" })}
            >
              <span className="min-w-0 flex-1 overflow-hidden text-left">
                <span className="block min-w-0 truncate text-ui-base font-semibold text-foreground">
                  ZxCode
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          {/* Bugfix: 菜单内容保持挂载，避免每次点击头像菜单都重建 footer 内部状态。 */}
          <DropdownMenuContent
            align="start"
            className="w-max min-w-50 max-w-[calc(100vw-2rem)]"
            forceMount
          >
            {user ? (
              <>
                <div
                  data-testid="profile-menu-header"
                  className="flex max-w-80 items-center gap-2 px-2 py-1.5"
                >
                  <Avatar key={avatarKey} size="default">
                    {user.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={profileBadge} />
                    ) : null}
                    <AvatarFallback className="bg-background text-foreground">
                      {avatarFallbackText}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        data-testid="profile-menu-name"
                        className="truncate text-ui-base font-medium"
                      >
                        {profileBadge}
                      </span>
                      <span
                        data-testid="profile-menu-plan"
                        className="flex shrink-0 [&>span]:border-border/50 [&>span]:bg-transparent [&>span]:font-normal"
                      >
                        <WorkspaceSidebarFooterPlanBadge state={usageSummaryState} />
                      </span>
                    </div>
                    {user.id ? (
                      <div className="flex min-w-0 items-center gap-1 text-ui-sm text-foreground-subtle">
                        <span data-testid="profile-menu-id" className="min-w-0 truncate">
                          {intl.formatMessage({ id: "sidebar.profile.accountId" }, { id: user.id })}
                        </span>
                        <DropdownMenuItem
                          asChild
                          className="data-[highlighted]:bg-transparent data-[highlighted]:hover:bg-menu-hover data-[highlighted]:focus-visible:bg-menu-hover"
                          onSelect={(event) => {
                            event.preventDefault();
                            void copyUserId();
                          }}
                        >
                          <SidebarNativeTooltip>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              data-testid="copy-user-id"
                              className="min-h-0 p-0 text-foreground-subtle"
                              aria-label={intl.formatMessage({ id: "sidebar.profile.copyUserId" })}
                              title={intl.formatMessage({ id: "sidebar.profile.copyUserId" })}
                            >
                              <Copy className="size-3" />
                            </Button>
                          </SidebarNativeTooltip>
                        </DropdownMenuItem>
                      </div>
                    ) : null}
                  </div>
                </div>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Globe className="size-4" />
                {intl.formatMessage({ id: "settings.locale" })}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuRadioGroup value={localeMenuValue} onValueChange={onLocaleChange}>
                  <DropdownMenuRadioItem value="system">
                    {intl.formatMessage({
                      id: "sidebar.settings.systemDefault",
                    })}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="en-US">
                    {intl.formatMessage({
                      id: "sidebar.settings.locale.en-US",
                    })}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="zh-CN">
                    {intl.formatMessage({
                      id: "sidebar.settings.locale.zh-CN",
                    })}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette className="size-4" />
                {intl.formatMessage({ id: "settings.themeMode" })}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuRadioGroup value={theme} onValueChange={onThemeChange}>
                  <DropdownMenuRadioItem value="system">
                    {intl.formatMessage({
                      id: "sidebar.settings.systemDefault",
                    })}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="zai-dark">
                    {intl.formatMessage({
                      id: "sidebar.settings.theme.zai-dark",
                    })}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="zai-light">
                    {intl.formatMessage({
                      id: "sidebar.settings.theme.zai-light",
                    })}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PencilRuler className="size-4" />
                {intl.formatMessage({ id: "settings.interfaceMode" })}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuRadioGroup
                  value={interfaceMode}
                  onValueChange={(value) => setInterfaceMode(normalizeInterfaceMode(value))}
                >
                  <DropdownMenuRadioItem value="coding">
                    {intl.formatMessage({ id: "settings.interfaceMode.coding" })}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="office">
                    {intl.formatMessage({ id: "settings.interfaceMode.office" })}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {/* 快捷键设置：缩放子菜单 label 读生效表，设置页改绑后即时跟随 */}
            {isDesktop ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ZoomIn className="size-4" />
                  {intl.formatMessage({ id: "sidebar.settings.interfaceZoom" })}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-50">
                  <DropdownMenuItem
                    disabled={!canZoomIn}
                    onSelect={() => runDesktopZoomCommand(DesktopCommandIds.ZoomIn)}
                  >
                    <ZoomIn className="size-4" />
                    {intl.formatMessage({ id: "titleBar.menu.view.zoomIn" })}
                    <DropdownMenuShortcut>{zoomInShortcutLabel}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canZoomOut}
                    onSelect={() => runDesktopZoomCommand(DesktopCommandIds.ZoomOut)}
                  >
                    <ZoomOut className="size-4" />
                    {intl.formatMessage({ id: "titleBar.menu.view.zoomOut" })}
                    <DropdownMenuShortcut>{zoomOutShortcutLabel}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canResetDesktopZoom}
                    onSelect={() => runDesktopZoomCommand(DesktopCommandIds.ResetZoom)}
                  >
                    <Maximize className="size-4" />
                    {intl.formatMessage({ id: "titleBar.menu.view.actualSize" })}
                    <DropdownMenuShortcut>{resetZoomShortcutLabel}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex shrink-0 items-center gap-1.5">
          {isDesktop && workspacePath ? (
            <WorkspaceWebRemoteControlTrigger
              workspacePath={workspacePath}
              workspaceIdentity={workspaceIdentity}
              remoteSessionId={workspaceRemoteSessionId}
              initialTaskId={activeTaskId ?? undefined}
              compact
            />
          ) : null}
          <ControlHintTooltip title={settingsButtonLabel}>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              data-testid={TID_TASK_SETTINGS_BUTTON}
              aria-label={settingsButtonLabel}
              disabled={!onSettingsButtonClick}
              onClick={onSettingsButtonClick}
            >
              <Settings className="size-4" />
            </Button>
          </ControlHintTooltip>
        </div>
      </div>
    </footer>
  );
});
