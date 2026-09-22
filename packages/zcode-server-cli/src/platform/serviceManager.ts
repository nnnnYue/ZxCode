import { rm } from "node:fs/promises";
import { join } from "node:path";
import { stablePathId, type ServerLayout } from "../runtime/paths.js";

export type ServicePlatform = "darwin" | "linux" | "win32";

/**
 * 去平台化改名前的退役服务名（默认名 + 按 server-root 的 per-root 名）。
 * 升级注册与卸载时都必须按这两个旧名做一次 OS 级清理：
 * 旧 plist/unit/task 可能在改名后仍被 launchd/systemd/schtasks 持有，
 * 不清理会出现新旧双注册、两个服务抢同一 server-root 锁。
 * Windows 的 schtasks 删除按任务名寻址，因此 legacy 固定文件名路径也引用本常量。
 */
export const RETIRED_SERVICE_NAME = "com.zhipu.zxcode.server";

function retiredServiceNames(layout: ServerLayout): string[] {
  return [RETIRED_SERVICE_NAME, `${RETIRED_SERVICE_NAME}.${stablePathId(layout.serverRoot)}`];
}

export interface ServiceDescriptor {
  kind: "launchd" | "systemd" | "task-scheduler";
  name: string;
  content: string;
}

interface ServiceCommandExecutor {
  run(command: string, args: readonly string[]): Promise<void>;
  runResult?: (command: string, args: readonly string[]) => Promise<ServiceCommandResult>;
}

interface ServiceCommandResult {
  exitCode: number;
  stderr: string;
}

export function createDaemonServiceDescriptor(options: {
  platform: ServicePlatform;
  layout: ServerLayout;
}): ServiceDescriptor {
  return createServiceDescriptor({
    platform: options.platform,
    command: join(
      options.layout.stableBinDir,
      options.platform === "win32" ? "zcode.cmd" : "zxcode",
    ),
    args: ["serve", "--supervisor", "--service-entry", "--server-root", options.layout.serverRoot],
    name: `com.zxcode.server.${stablePathId(options.layout.serverRoot)}`,
  });
}

export function serviceDescriptorPath(layout: ServerLayout, descriptor: ServiceDescriptor): string {
  const extension =
    descriptor.kind === "launchd" ? "plist" : descriptor.kind === "systemd" ? "service" : "json";
  return join(layout.serviceDir, `${descriptor.name}.${extension}`);
}

export function createServiceDescriptor(options: {
  platform: ServicePlatform;
  command: string;
  args?: string[];
  name?: string;
}): ServiceDescriptor {
  const name = options.name ?? "com.zxcode.server";
  const args = options.args ?? ["serve", "--daemon"];
  if (options.platform === "darwin") {
    return {
      kind: "launchd",
      name,
      // 正常 stop 会让 Supervisor 以 0 退出；只按异常退出重启，避免 launchd 的无条件
      // KeepAlive 把用户主动停止的 daemon 立即拉起。Supervisor 自身仍负责 Core 崩溃退避。
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>Label</key><string>${name}</string><key>ProgramArguments</key><array>${[options.command, ...args].map((value) => `<string>${escapeXml(value)}</string>`).join("")}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict></dict></plist>`,
    };
  }
  if (options.platform === "linux") {
    return {
      kind: "systemd",
      name,
      content: `[Unit]\nDescription=ZxCode Server\n[Service]\nExecStart=${shellQuote(options.command)} ${args.map(shellQuote).join(" ")}\nRestart=on-failure\n[Install]\nWantedBy=default.target\n`,
    };
  }
  return {
    kind: "task-scheduler",
    name,
    content: JSON.stringify({
      taskName: name,
      command: options.command,
      args,
      trigger: "logon",
      runLevel: "leastPrivilege",
    }),
  };
}

async function defaultExecutorResult(
  command: string,
  args: readonly string[],
): Promise<ServiceCommandResult> {
  const { spawn } = await import("node:child_process");
  return await new Promise<ServiceCommandResult>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ exitCode: code ?? -1, stderr }));
  });
}

async function defaultExecutor(command: string, args: readonly string[]): Promise<void> {
  const result = await defaultExecutorResult(command, args);
  if (result.exitCode !== 0) {
    const error = new Error(
      `${command} ${args.join(" ")} failed (${result.exitCode}): ${result.stderr}`,
    ) as Error & { exitCode?: number };
    error.exitCode = result.exitCode;
    throw error;
  }
}

const defaultServiceCommandExecutor: ServiceCommandExecutor = {
  run: defaultExecutor,
  runResult: defaultExecutorResult,
};

export async function registerService(
  descriptor: ServiceDescriptor,
  descriptorPath: string,
  executor: ServiceCommandExecutor = defaultServiceCommandExecutor,
): Promise<void> {
  try {
    if (descriptor.kind === "launchd") {
      // Label 稳定但 plist 内容可能变化；先卸载旧 job，避免 load 失败后 start 唤醒旧参数。
      try {
        await executor.run("launchctl", ["unload", "-w", descriptorPath]);
      } catch (error: unknown) {
        if (!isServiceMissingError(error)) throw error;
      }
      await executor.run("launchctl", ["load", "-w", descriptorPath]);
      await executor.run("launchctl", ["start", descriptor.name]);
    } else if (descriptor.kind === "systemd") {
      await executor.run("systemctl", ["--user", "daemon-reload"]);
      await executor.run("systemctl", ["--user", "enable", "--now", descriptorPath]);
    } else {
      const parsed = JSON.parse(descriptor.content) as {
        taskName: string;
        command: string;
        args: string[];
      };
      await executor.run("schtasks", [
        "/Create",
        "/TN",
        parsed.taskName,
        "/TR",
        [parsed.command, ...parsed.args]
          .map((value) => `"${value.replaceAll('"', '\\"')}"`)
          .join(" "),
        "/SC",
        "ONLOGON",
        "/F",
      ]);
      await executor.run("schtasks", ["/Run", "/TN", parsed.taskName]);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to register service ${descriptor.name} (${descriptorPath}): ${message}`,
      { cause: error },
    );
  }
}

export async function unregisterService(
  descriptor: ServiceDescriptor,
  descriptorPath: string,
  executor: ServiceCommandExecutor = defaultServiceCommandExecutor,
): Promise<void> {
  try {
    if (descriptor.kind === "launchd")
      await executor.run("launchctl", ["unload", "-w", descriptorPath]);
    else if (descriptor.kind === "systemd")
      await executor.run("systemctl", ["--user", "disable", "--now", descriptorPath]);
    else {
      if (await isMissingWindowsTask(descriptor, executor)) return;
      await executor.run("schtasks", ["/Delete", "/TN", descriptor.name, "/F"]);
    }
  } catch (error) {
    // 注册命令可能在写 descriptor 后失败，卸载时 OS 中并不存在对应服务。
    // 仅容忍“未注册/不存在”，权限或命令执行等真实失败仍需阻止删除运行数据。
    if (!isServiceMissingError(error, descriptor.kind === "task-scheduler")) throw error;
  }
}

function isServiceMissingError(error: unknown, allowWindowsFileNotFound = false): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const exitCode =
    typeof error === "object" &&
    error !== null &&
    "exitCode" in error &&
    typeof error.exitCode === "number"
      ? error.exitCode
      : undefined;
  const commonMissingMessage =
    /could not find specified service|not loaded|does not exist|specified (?:service|task).*not (?:exist|found)|unit .* not found/iu.test(
      message,
    );
  const windowsMissingMessage = /cannot find the file specified/iu.test(message);
  return (
    commonMissingMessage || (allowWindowsFileNotFound && (exitCode === 2 || windowsMissingMessage))
  );
}

async function isMissingWindowsTask(
  descriptor: ServiceDescriptor,
  executor: ServiceCommandExecutor,
): Promise<boolean> {
  if (!executor.runResult) return false;
  const result = await executor.runResult("schtasks", [
    "/Query",
    "/TN",
    descriptor.name,
    "/HResult",
  ]);
  if (result.exitCode === 0) return false;
  // schtasks /Query /HResult returns HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND) for a
  // missing task. Keep permission/service failures fatal instead of treating every non-zero
  // probe result as an idempotent absence.
  if (result.exitCode === 2 || result.exitCode === 0x80070002 || result.exitCode === -2147024894)
    return true;
  const error = new Error(
    `schtasks /Query /TN ${descriptor.name} failed (${result.exitCode}): ${result.stderr}`,
  ) as Error & { exitCode?: number };
  error.exitCode = result.exitCode;
  throw error;
}

/**
 * 尽力而为地移除退役旧名服务（`RETIRED_SERVICE_NAME` 及其 per-root 变体）。
 *
 * 旧 descriptor 文件可能已被手动删除，但 OS 侧注册（launchd job / systemd unit /
 * 计划任务）仍按名持有，因此除按文件卸载外还按名再清一次。
 * 一切失败都吞掉：旧注册不存在是常态，且旧名清理绝不能阻断新名注册或卸载主流程。
 */
export async function unregisterRetiredServices(
  layout: ServerLayout,
  executor: ServiceCommandExecutor = defaultServiceCommandExecutor,
): Promise<void> {
  const platform: ServicePlatform =
    process.platform === "darwin" || process.platform === "linux" ? process.platform : "win32";
  const kind: ServiceDescriptor["kind"] =
    platform === "darwin" ? "launchd" : platform === "linux" ? "systemd" : "task-scheduler";
  const extension = kind === "launchd" ? "plist" : kind === "systemd" ? "service" : "json";
  for (const name of retiredServiceNames(layout)) {
    const descriptorPath = join(layout.serviceDir, `${name}.${extension}`);
    try {
      await unregisterService({ kind, name, content: "" }, descriptorPath, executor);
    } catch {
      // 退役服务不存在是常态；按文件卸载失败继续走按名兜底。
    }
    await rm(descriptorPath, { force: true }).catch(() => undefined);
    try {
      if (kind === "launchd") {
        // plist 可能已被删除但 job 仍 loaded：launchctl remove 只认 label，不认文件。
        await executor.run("launchctl", ["remove", name]);
      } else if (kind === "systemd") {
        // unit 文件可能已被删除但仍 enable：按 unit 名再 disable 一次。
        await executor.run("systemctl", ["--user", "disable", "--now", `${name}.service`]);
      }
      // Windows：unregisterService 内部已按任务名 Query/Delete，文件缺失不影响。
    } catch {
      // 按名移除只覆盖“文件不在但注册仍在”的孤儿场景，失败忽略。
    }
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
