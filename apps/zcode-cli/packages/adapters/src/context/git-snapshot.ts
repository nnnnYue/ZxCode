import { execFile as execFileCallback } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { EnvInfo } from "@zcode/contracts";

const DEFAULT_GIT_COMMAND_TIMEOUT_MS = 3000;
const DEFAULT_COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;
const GIT_COMMAND = "git";
const GIT_STATUS_NOT_REPO = "not_repo" as const;
const GIT_STATUS_CLEAN = "clean" as const;
const GIT_STATUS_DIRTY = "dirty" as const;
const MAX_RECENT_COMMITS = 5;
const DEFAULT_MAIN_BRANCH_CANDIDATES = ["main", "master"] as const;
const MAX_GIT_STATUS_CONTEXT_CHARS = 2000;
const GIT_DIRECTORY_ENTRY = ".git";

const execFile = promisify(execFileCallback);

interface GitCommandResult {
  // git 自己的退出码；timeout、取消、无法启动时没有退出码。
  code: number | undefined;
  stderr: string;
  stdout: string;
}

interface ExecFileFailure extends Error {
  code?: number | string | null;
}

/**
 * 从目录向上走到文件系统根，返回第一个含 `.git` 的目录。`.git` 是目录或文件都算
 * （worktree / submodule 的 gitdir 文件）；symlink 按目标判断，目标不存在不算。
 * 修复原因：原来用 git rev-parse 判定，超时、取消、没装 git 都没有结论，调用方只能把
 * 结论写成"不是仓库"或每次请求重跑 git。是否在仓库只是一个文件系统事实，不需要启动 git。
 */
export async function findGitRoot(directory: string): Promise<string | undefined> {
  for (let current = directory; ; current = dirname(current)) {
    if (await hasGitEntry(current)) return current;
    // 盘符根、UNC 根与 POSIX 根的 dirname 都是它自己。
    if (dirname(current) === current) return undefined;
  }
}

/**
 * 是否在仓库：从目录的真实路径向上查找 `.git`，git 自己也在真实路径下运行。
 * 修复原因：原来从打开时的路径（链接本身的位置）向上查找。指向仓库子目录的链接被判为"不是仓库"；
 * 仓库里指向外部的链接被判为仓库，git 命令全部失败，模型看到默认值拼成的假快照。
 * 真实路径读不到（例如目录已删除）时按打开时的路径查找。
 */
export async function resolveIsGitRepository(
  workingDirectory: string,
  // 调用方已从打开时的路径查找过时传入结果；真实路径与它相同时直接复用，不再查找。
  givenPathGitRoot?: string | null,
): Promise<boolean> {
  const realPath = await realpath(workingDirectory).catch(() => workingDirectory);
  if (givenPathGitRoot !== undefined && realPath === workingDirectory) {
    return givenPathGitRoot !== null;
  }
  return (await findGitRoot(realPath)) !== undefined;
}

export async function resolveGitSnapshot(
  workingDirectory: string,
  signal?: AbortSignal,
  // 调用方已经查找过 `.git` 时传入结论，不再向上查找。
  isGitRepository?: boolean,
): Promise<Partial<EnvInfo>> {
  if (!(isGitRepository ?? (await resolveIsGitRepository(workingDirectory)))) {
    return { isGitRepository: false, gitStatus: GIT_STATUS_NOT_REPO };
  }

  // 修复原因：命令串行时，git 卡住的仓库要等 7–9 次 3 秒超时。命令互不依赖，并行执行，
  // 结果按固定字段组装，字节与串行时相同。
  const [gitBranch, gitMainBranch, gitUser, statusOutput, recentCommitOutput] = await Promise.all([
    resolveGitBranch(workingDirectory, signal),
    resolveMainBranch(workingDirectory, signal),
    resolveGitUser(workingDirectory, signal),
    readGitOutput(
      ["--no-optional-locks", "status", "--short", "--ignore-submodules=dirty"],
      workingDirectory,
      signal,
    ),
    readGitOutput(
      ["--no-optional-locks", "log", "--oneline", "-n", String(MAX_RECENT_COMMITS)],
      workingDirectory,
      signal,
    ),
  ]);
  const gitStatusLines = splitGitStatusForContext(statusOutput.trim());
  const recentCommits = splitNonEmptyLines(recentCommitOutput).slice(0, MAX_RECENT_COMMITS);

  return {
    isGitRepository: true,
    gitBranch,
    gitMainBranch,
    gitUser,
    gitStatus: gitStatusLines.length > 0 ? GIT_STATUS_DIRTY : GIT_STATUS_CLEAN,
    gitStatusLines,
    recentCommits,
  };
}

async function hasGitEntry(directory: string): Promise<boolean> {
  try {
    await stat(join(directory, GIT_DIRECTORY_ENTRY));
    return true;
  } catch {
    return false;
  }
}

async function resolveGitBranch(
  workingDirectory: string,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  // 修复原因：无提交时 rev-parse --abbrev-ref HEAD 以 128 退出，分支名丢失为 HEAD。
  // symbolic-ref 只读符号引用，不要求有提交；detached 时没有符号引用，仍退回 HEAD。
  const branch = await readTrimmedGitOutput(
    ["symbolic-ref", "--short", "-q", "HEAD"],
    workingDirectory,
    signal,
  );
  return branch || "HEAD";
}

async function resolveMainBranch(
  workingDirectory: string,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  const remoteHead = await readTrimmedGitOutput(
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    workingDirectory,
    signal,
  );
  const originHeadBranch = remoteHead?.replace(/^origin\//, "");
  const candidates = originHeadBranch
    ? [originHeadBranch, ...DEFAULT_MAIN_BRANCH_CANDIDATES]
    : [...DEFAULT_MAIN_BRANCH_CANDIDATES];

  for (const candidate of candidates) {
    if (
      await gitCommandSucceeds(
        ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${candidate}`],
        workingDirectory,
        signal,
      )
    ) {
      return candidate;
    }
  }

  return "main";
}

async function resolveGitUser(
  workingDirectory: string,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  return readTrimmedGitOutput(["config", "user.name"], workingDirectory, signal);
}

async function gitCommandSucceeds(
  args: string[],
  workingDirectory: string,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  const result = await execGitNoThrow(args, workingDirectory, signal);
  return result.code === 0;
}

async function readTrimmedGitOutput(
  args: string[],
  workingDirectory: string,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  const output = await readGitOutput(args, workingDirectory, signal);
  const trimmed = output?.trim();
  return trimmed ? trimmed : undefined;
}

async function readGitOutput(
  args: string[],
  workingDirectory: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const result = await execGitNoThrow(args, workingDirectory, signal);
  return result.stdout;
}

async function execGitNoThrow(
  args: string[],
  workingDirectory: string,
  signal: AbortSignal | undefined,
): Promise<GitCommandResult> {
  try {
    const result = await execFile(GIT_COMMAND, args, {
      cwd: workingDirectory,
      encoding: "utf8",
      maxBuffer: DEFAULT_COMMAND_MAX_BUFFER_BYTES,
      // 请求取消时 git 立即结束，不必等到 3 秒超时。
      signal,
      timeout: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    return {
      code: 0,
      stderr: outputToString(result.stderr),
      stdout: outputToString(result.stdout),
    };
  } catch (error) {
    const failure = error as ExecFileFailure;
    return {
      code: typeof failure.code === "number" ? failure.code : undefined,
      // 命令失败时丢弃 stdout/stderr，避免把不可靠的错误输出写入 provider-visible git context。
      stderr: "",
      stdout: "",
    };
  }
}

function outputToString(output: Buffer | string | undefined): string {
  if (typeof output === "string") {
    return output;
  }
  return output?.toString("utf8") ?? "";
}

function splitGitStatusForContext(status: string): string[] {
  if (status.length === 0) {
    return [];
  }

  const boundedStatus =
    status.length > MAX_GIT_STATUS_CONTEXT_CHARS
      ? `${status.substring(0, MAX_GIT_STATUS_CONTEXT_CHARS)}
... (truncated because it exceeds 2k characters. If you need more information, run "git status" using ${gitStatusToolName()})`
      : status;

  // 与上游 CLI 保持一致：git status 只按 2k 字符截断，不按文件条目数截断，避免 provider-visible prompt 形状漂移。
  return boundedStatus.split(/\r?\n/u).filter((line) => line.length > 0);
}

function gitStatusToolName(): "Bash" | "PowerShell" {
  return process.platform === "win32" ? "PowerShell" : "Bash";
}

function splitNonEmptyLines(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}
