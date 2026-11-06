import { SidebarNativeTooltip } from "@/ControlHintTooltip.js";
import { ChevronsUpDownIcon, LaptopIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { WebRemoteControlDeviceNavigation } from "@/web-remote-control/contract.js";

/**
 * fork 适配：上游经 components/mobile-ui/DevicePlatformIcon 按 relay meta.platform
 * 画 macOS/Windows/Linux 品牌轮廓；mobile-ui 模块 fork 未引入，回退为通用电脑图标
 * （fork relay 为自部署单设备链路，设备平台不是关键识别信息）。
 */

/** 侧栏顶部的当前电脑行：与主导航同款 ghost 行，整行即“切换设备”入口。 */
export function WebRemoteControlDeviceHeader({
  navigation,
}: {
  navigation: WebRemoteControlDeviceNavigation;
}) {
  const { intl } = useZCodeIntl();
  const deviceName =
    navigation.deviceName?.trim() || intl.formatMessage({ id: "webRemoteControl.unnamedDevice" });
  const switchLabel = intl.formatMessage({ id: "webRemoteControl.switchDevice" });

  return (
    <SidebarNativeTooltip>
      <Button
        type="button"
        variant="ghost"
        size="lg"
        aria-label={switchLabel}
        title={switchLabel}
        className="w-full justify-start gap-2"
        onClick={navigation.chooseOtherDevice}
      >
        <LaptopIcon aria-hidden="true" className="size-4 shrink-0 text-foreground-subtle" />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{deviceName}</span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-foreground-subtle" />
      </Button>
    </SidebarNativeTooltip>
  );
}
