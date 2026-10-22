import { useEffect, useState } from "react";

/**
 * grant（手机远控授权链接）的失效倒计时（秒）。
 * 与设置页 MobileRelaySettingsSection、左下角远控弹层共用：
 * expiresAt 未提供时恒为 0，到 0 后不再递减。
 */
export function useGrantCountdown(expiresAt: number | undefined): number {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) : 0,
  );
  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(0);
      return;
    }
    const tick = (): void =>
      setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return remainingSeconds;
}
