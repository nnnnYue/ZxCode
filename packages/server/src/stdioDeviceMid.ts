import { ensureDeviceMid as ensureSharedDeviceMid } from "@zcode/services/node";

interface EnsureRemoteServerDeviceMidOptions {
  /** 仅测试注入；生产固定使用 services 的 ensureDeviceMid。 */
  ensureDeviceMid?: () => Promise<string>;
  log: (...args: unknown[]) => void;
}

/**
 * 远端 server 启动时确保所在主机拥有自己的 deviceMid。
 *
 * 远程工作区（SSH/WSL/Docker）里没有 Desktop main 进程，过去没有任何进程会在远端主机
 * 写设备身份文件。deviceMid 是跨端共享的本地设备身份（onboarding 记录锚点、流客户端 ID、
 * 反馈等本地链路读它；X-Device-Mid 请求头已随去平台化清理删除）。
 * Desktop main 通过 ensureDesktopDeviceMidSync 承担本地的这一职责，这里让
 * 远端 stdio entry 承担同一职责，复用同一个文件、字段与锁，与同机 zcode-cli 共享同一个设备身份。
 *
 * 失败不阻断启动：设备标识缺失只影响上述本地链路的设备锚点，
 * 远端 server 的其余能力不依赖它；这里记录 warn 并保留原因，不伪造设备 ID。
 */
export async function ensureRemoteServerDeviceMid(
  options: EnsureRemoteServerDeviceMidOptions,
): Promise<string | undefined> {
  const ensureDeviceMid = options.ensureDeviceMid ?? ensureSharedDeviceMid;
  try {
    return await ensureDeviceMid();
  } catch (error) {
    options.log(
      "deviceMid 初始化失败，onboarding/流客户端 ID 等本地链路将缺少设备锚点:",
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}
