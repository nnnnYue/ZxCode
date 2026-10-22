import { useEffect, useState } from "react";
import type { MobileRelayStatus } from "@zcode/shared";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { logger } from "@/logger.js";

const DEFAULT_MOBILE_RELAY_STATUS_POLL_INTERVAL_MS = 5_000;

/**
 * 自部署手机远控 relay 的桌面连接状态（desktop main `desktopRelayClient` 为事实源）。
 *
 * 返回三态：
 * - `undefined`：平台不支持或尚未完成首次查询（入口 gate 据此不渲染）；
 * - `MobileRelayStatus`：只读快照（supported/enabled/connected/serverUrl/lastError）。
 *
 * 查询失败保留上一次快照：控制连接瞬断不该让入口闪烁消失，只有明确的
 * enabled/connected 字段变化才改变 UI。轮询属低频诊断，失败只走 debug。
 */
export function useMobileRelayStatus(
  options: { intervalMs?: number } = {},
): MobileRelayStatus | undefined {
  const platform = useOptionalPlatform();
  const intervalMs = options.intervalMs ?? DEFAULT_MOBILE_RELAY_STATUS_POLL_INTERVAL_MS;
  const [status, setStatus] = useState<MobileRelayStatus | undefined>(undefined);

  useEffect(() => {
    if (!platform?.getMobileRelayStatus) {
      setStatus(undefined);
      return;
    }
    const getMobileRelayStatus = platform.getMobileRelayStatus;
    let disposed = false;

    const syncStatus = async () => {
      try {
        const next = await getMobileRelayStatus();
        if (!disposed) {
          setStatus(next);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.debug("[useMobileRelayStatus] 同步手机远控 relay 状态失败", { error: message });
      }
    };

    void syncStatus();
    const intervalId = window.setInterval(() => {
      void syncStatus();
    }, intervalMs);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [platform, intervalMs]);

  return status;
}
