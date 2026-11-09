import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeContextSourceAdapter } from "../src/context/index.js";

interface GitResponse {
  code: number;
  // 没有 git 退出码的失败：timeout 被 kill、signal 取消、git 无法启动。
  failure?: "timeout" | "abort" | "spawn";
  stdout?: string;
  stderr?: string;
}

interface GitCall {
  args: string[];
  command: string;
  options: {
    cwd?: string;
    maxBuffer?: number;
    signal?: AbortSignal;
    timeout?: number;
    windowsHide?: boolean;
  };
}

const { execFileMock, gitCalls, heldGitArgs, holdGitCommands, resetGitMock, setGitResponse } =
  vi.hoisted(() => {
    const calls: GitCall[] = [];
    const responses = new Map<string, GitResponse>();
    // 设置后，git 命令先记进 held，等放行后才执行，用来证明快照命令是并行发出的。
    let gate: Promise<void> | undefined;
    const held: string[][] = [];
    const commandKey = (args: string[]) => args.join("\0");
    const runGitMock = (command: string, args: string[], options: GitCall["options"]) => {
      calls.push({ args: [...args], command, options });
      const response = responses.get(commandKey(args)) ?? { code: 1, stdout: "", stderr: "" };
      const stdout = response.stdout ?? "";
      const stderr = response.stderr ?? "";
      if (response.failure) {
        throw execFailure(response.failure);
      }
      if (response.code === 0) {
        return { stdout, stderr };
      }

      const error = new Error(`git exited with ${response.code}`) as Error & {
        code?: number;
        stderr?: string;
        stdout?: string;
      };
      error.code = response.code;
      error.stdout = stdout;
      error.stderr = stderr;
      throw error;
    };
    const mock = vi.fn(
      (
        command: string,
        args: string[],
        options: GitCall["options"],
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        try {
          const result = runGitMock(command, args, options);
          callback(null, result.stdout, result.stderr);
        } catch (error) {
          const execError = error as Error & { stderr?: string; stdout?: string };
          callback(execError, execError.stdout ?? "", execError.stderr ?? "");
        }
      },
    );
    // 与 Node execFile 的失败形状一致：timeout 时 killed 且 code 为 null；取消时是 AbortError；
    // 无法启动时 code 是字符串。
    const execFailure = (failure: NonNullable<GitResponse["failure"]>) => {
      if (failure === "abort") {
        return Object.assign(new Error("The operation was aborted"), {
          code: "ABORT_ERR",
          name: "AbortError",
        });
      }
      if (failure === "spawn") {
        return Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
      }
      return Object.assign(new Error("Command failed: git"), {
        code: null,
        killed: true,
        signal: "SIGTERM",
      });
    };
    const customPromisify = Symbol.for("nodejs.util.promisify.custom");
    Object.defineProperty(mock, customPromisify, {
      value: async (command: string, args: string[], options: GitCall["options"]) => {
        if (gate) {
          held.push([...args]);
          await gate;
        }
        return runGitMock(command, args, options);
      },
    });

    return {
      execFileMock: mock,
      gitCalls: calls,
      heldGitArgs: held,
      holdGitCommands: () => {
        let release!: () => void;
        gate = new Promise<void>((resolveGate) => {
          release = resolveGate;
        });
        return () => {
          gate = undefined;
          release();
        };
      },
      resetGitMock: () => {
        calls.length = 0;
        mock.mockClear();
        responses.clear();
        gate = undefined;
        held.length = 0;
      },
      setGitResponse: (args: string[], response: GitResponse) => {
        responses.set(commandKey(args), response);
      },
    };
  });

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

// 记录对 `.git` 的 stat，用来证明一次 context 解析只向上查找一遍。
const { gitEntryStats } = vi.hoisted(() => ({ gitEntryStats: [] as string[] }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const stat = ((path: Parameters<typeof actual.stat>[0], options?: { bigint?: false }) => {
    if (String(path).endsWith(".git")) gitEntryStats.push(String(path));
    return actual.stat(path, options);
  }) as typeof actual.stat;
  return { ...actual, stat };
});

const SNAPSHOT_COMMANDS = [
  ["symbolic-ref", "--short", "-q", "HEAD"],
  ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
  ["config", "user.name"],
  ["--no-optional-locks", "status", "--short", "--ignore-submodules=dirty"],
  ["--no-optional-locks", "log", "--oneline", "-n", "5"],
];
const STATUS_COMMAND = SNAPSHOT_COMMANDS[3]!;

let root: string;
let repoDirectory: string;
let nestedDirectory: string;
let worktreeDirectory: string;
let outsideDirectory: string;
// 临时目录的上级里有 .git 时（例如 TMPDIR 指向某个仓库内部），"不在仓库"的结论不成立。
let outsideIsReliable: boolean;

function hasGitAncestor(directory: string): boolean {
  for (let current = directory; ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) return true;
    if (dirname(current) === current) return false;
  }
}

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "zcode-git-snapshot-")));
  repoDirectory = join(root, "repo");
  nestedDirectory = join(repoDirectory, "src", "deep");
  worktreeDirectory = join(root, "worktree");
  outsideDirectory = join(root, "outside");
  await mkdir(join(repoDirectory, ".git"), { recursive: true });
  await mkdir(nestedDirectory, { recursive: true });
  await mkdir(worktreeDirectory, { recursive: true });
  // worktree / submodule 的 .git 是指向 gitdir 的文件。
  await writeFile(join(worktreeDirectory, ".git"), "gitdir: /elsewhere/.git/worktrees/wt\n");
  await mkdir(outsideDirectory, { recursive: true });
  outsideIsReliable = !hasGitAncestor(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolveGitSnapshot command semantics", () => {
  beforeEach(() => {
    resetGitMock();
  });

  it("falls back to HEAD when HEAD is detached", async () => {
    setGitResponse(["symbolic-ref", "--short", "-q", "HEAD"], { code: 1 });
    const { resolveGitSnapshot } = await import("../src/context/git-snapshot.js");
    expect((await resolveGitSnapshot(repoDirectory)).gitBranch).toBe("HEAD");
  });

  it("decides repository membership from .git without starting git", async () => {
    const { resolveIsGitRepository } = await import("../src/context/git-snapshot.js");
    for (const directory of [repoDirectory, nestedDirectory, worktreeDirectory]) {
      expect(await resolveIsGitRepository(directory)).toBe(true);
    }
    if (outsideIsReliable) {
      expect(await resolveIsGitRepository(outsideDirectory)).toBe(false);
    }
    // 修复原因：原来用 git rev-parse 判定，超时、取消、没装 git 都没有结论；现在只看文件系统。
    expect(gitCalls).toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "follows a symlinked directory and ignores a dangling .git link",
    async () => {
      const linked = join(root, "repo-link");
      const dangling = join(root, "dangling");
      await symlink(repoDirectory, linked, "dir");
      await mkdir(dangling, { recursive: true });
      await symlink(join(root, "missing-git-dir"), join(dangling, ".git"));
      const { resolveIsGitRepository } = await import("../src/context/git-snapshot.js");
      expect(await resolveIsGitRepository(linked)).toBe(true);
      if (outsideIsReliable) expect(await resolveIsGitRepository(dangling)).toBe(false);
    },
  );

  // 修复原因：原来从打开时的路径（链接本身的位置）逐级向上找 .git，git 却在链接指向的真实位置运行，
  // 两边结论相反：指向仓库子目录的链接被判为"不是仓库"；仓库里指向外部的链接被判为仓库，
  // git 命令全部失败，模型看到默认值拼成的假快照。现在是否仓库按真实路径判断，与 git 一致；
  // 项目根、AGENTS.md 查找和给模型看的路径仍用打开时的路径。junction 在 Windows 上不需要权限。
  it("decides membership from the real path of a link while paths keep the opened form", async (context) => {
    // 临时目录的上级里有 .git 时，"不是仓库"的两种结论都不成立。
    if (!outsideIsReliable) context.skip();
    const home = join(root, "link-home");
    const mono = join(root, "link-mono");
    const intoRepo = join(home, "pkg");
    const outOfRepo = join(mono, "data-link");
    await mkdir(join(mono, ".git"), { recursive: true });
    await mkdir(join(mono, "packages", "pkg"), { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(join(mono, "AGENTS.md"), "mono rule\n");
    await symlink(join(mono, "packages", "pkg"), intoRepo, "junction");
    await symlink(outsideDirectory, outOfRepo, "junction");
    const adapter = createNodeContextSourceAdapter({
      env: { SHELL: "/bin/zsh", HOME: home, USERPROFILE: home },
    });
    const { resolveGitSnapshot, resolveIsGitRepository } = await import(
      "../src/context/git-snapshot.js"
    );

    // 链接指向仓库子目录：是仓库；git 命令在打开时的路径下运行，cwd 也保持原样。
    expect(await resolveIsGitRepository(intoRepo)).toBe(true);
    const intoSnapshot = await adapter.resolveContextSources({ workingDirectory: intoRepo });
    expect(intoSnapshot.workingDirectory).toBe(intoRepo);
    expect(intoSnapshot.envInfo).toMatchObject({ cwd: intoRepo, isGitRepository: true });
    expect(gitCalls.length).toBeGreaterThan(0);
    expect(new Set(gitCalls.map((call) => call.options.cwd))).toEqual(new Set([intoRepo]));

    // 仓库里指向外部的链接：不是仓库，不启动 git；项目根仍按打开时的路径找到 mono 的 AGENTS.md。
    resetGitMock();
    expect(await resolveIsGitRepository(outOfRepo)).toBe(false);
    expect(await resolveGitSnapshot(outOfRepo)).toEqual({
      isGitRepository: false,
      gitStatus: "not_repo",
    });
    const outSnapshot = await adapter.resolveContextSources({
      workingDirectory: outOfRepo,
      userInstructions: { workingDirectory: outOfRepo },
    });
    expect(outSnapshot.envInfo).toMatchObject({
      cwd: outOfRepo,
      isGitRepository: false,
      gitStatus: "not_repo",
    });
    expect(outSnapshot.userInstructions?.filePath).toBe(join(mono, "AGENTS.md"));
    expect(gitCalls).toEqual([]);

    // 真实路径读不到（目录已删除）时按打开时的路径判断，不抛错。
    expect(await resolveIsGitRepository(join(mono, "deleted"))).toBe(true);
  });

  it("reads a fresh git snapshot without host facts", async () => {
    setGitResponse(["symbolic-ref", "--short", "-q", "HEAD"], { code: 0, stdout: "feature\n" });
    setGitResponse(STATUS_COMMAND, { code: 0, stdout: " M a.ts\n" });
    const { resolveGitSnapshot } = await import("../src/context/git-snapshot.js");
    const snapshot = await resolveGitSnapshot(repoDirectory);
    expect(snapshot).toMatchObject({
      isGitRepository: true,
      gitBranch: "feature",
      gitStatus: "dirty",
      gitStatusLines: ["M a.ts"],
    });
    expect(snapshot).not.toHaveProperty("shell");
    expect(gitCalls.every(({ options }) => options.cwd === repoDirectory)).toBe(true);
  });

  it("keeps the local three second timeout for every git snapshot command", async () => {
    setGitResponse(["symbolic-ref", "--short", "-q", "HEAD"], { code: 0, stdout: "feature\n" });
    setGitResponse(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
      code: 0,
      stdout: "origin/main\n",
    });
    setGitResponse(["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"], {
      code: 0,
    });
    setGitResponse(["config", "user.name"], { code: 0, stdout: "ZCode Tester\n" });
    setGitResponse(STATUS_COMMAND, {
      code: 0,
      stdout: " M tracked.txt\n",
    });
    setGitResponse(["--no-optional-locks", "log", "--oneline", "-n", "5"], {
      code: 0,
      stdout: "abc123 first commit\n",
    });

    const { resolveGitSnapshot } = await import("../src/context/git-snapshot.js");
    const snapshot = await resolveGitSnapshot(repoDirectory);

    expect(snapshot.isGitRepository).toBe(true);
    expect(gitCalls).not.toHaveLength(0);
    expect(gitCalls.every((call) => call.command === "git")).toBe(true);
    expect(gitCalls.every((call) => call.options.cwd === repoDirectory)).toBe(true);
    expect(gitCalls.every((call) => call.options.maxBuffer === 1024 * 1024)).toBe(true);
    expect(gitCalls.every((call) => call.options.timeout === 3000)).toBe(true);
    expect(gitCalls.every((call) => call.options.windowsHide === true)).toBe(true);
  });

  it("starts the snapshot commands in parallel and keeps the result unchanged", async () => {
    setGitResponse(["symbolic-ref", "--short", "-q", "HEAD"], { code: 0, stdout: "feature\n" });
    setGitResponse(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
      code: 0,
      stdout: "origin/trunk\n",
    });
    setGitResponse(["show-ref", "--verify", "--quiet", "refs/remotes/origin/trunk"], { code: 0 });
    setGitResponse(["config", "user.name"], { code: 0, stdout: "ZCode Tester\n" });
    setGitResponse(STATUS_COMMAND, { code: 0, stdout: " M a.ts\n" });
    setGitResponse(["--no-optional-locks", "log", "--oneline", "-n", "5"], {
      code: 0,
      stdout: "abc123 first\ndef456 second\n",
    });
    const { resolveGitSnapshot } = await import("../src/context/git-snapshot.js");
    const release = holdGitCommands();
    const pending = resolveGitSnapshot(repoDirectory);
    // 修复原因：串行执行时，git 卡住的仓库每条命令都要等满 3 秒。
    await vi.waitFor(() => expect(heldGitArgs).toHaveLength(SNAPSHOT_COMMANDS.length));
    expect(heldGitArgs).toEqual(expect.arrayContaining(SNAPSHOT_COMMANDS));
    release();
    expect(await pending).toEqual({
      isGitRepository: true,
      gitBranch: "feature",
      gitMainBranch: "trunk",
      gitUser: "ZCode Tester",
      gitStatus: "dirty",
      gitStatusLines: ["M a.ts"],
      recentCommits: ["abc123 first", "def456 second"],
    });
  });

  it("drops stdout from failed optional git commands and keeps the snapshot usable", async () => {
    setGitResponse(["symbolic-ref", "--short", "-q", "HEAD"], { code: 0, stdout: "feature\n" });
    setGitResponse(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
      code: 1,
      stdout: "origin/should-not-leak\n",
    });
    setGitResponse(["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"], {
      code: 1,
    });
    setGitResponse(["show-ref", "--verify", "--quiet", "refs/remotes/origin/master"], {
      code: 1,
    });
    setGitResponse(["config", "user.name"], { code: 1, stdout: "Leaked User\n" });
    setGitResponse(STATUS_COMMAND, {
      code: 128,
      stdout: " M leaked.txt\n",
    });
    setGitResponse(["--no-optional-locks", "log", "--oneline", "-n", "5"], {
      code: 128,
      stdout: "abc123 leaked commit\n",
    });

    const { resolveGitSnapshot } = await import("../src/context/git-snapshot.js");
    const snapshot = await resolveGitSnapshot(repoDirectory);

    expect(snapshot).toMatchObject({
      isGitRepository: true,
      gitBranch: "feature",
      gitMainBranch: "main",
      gitStatus: "clean",
      gitStatusLines: [],
      recentCommits: [],
    });
    expect(snapshot.gitUser).toBeUndefined();
  });

  it("walks up for .git once when resolving context sources", async () => {
    const adapter = createNodeContextSourceAdapter({ env: {} });
    gitEntryStats.length = 0;
    const snapshot = await adapter.resolveContextSources({ workingDirectory: nestedDirectory });
    expect(snapshot.envInfo).toMatchObject({ isGitRepository: true });
    // 项目根与是否在仓库用同一次查找：deep → src → repo，各 stat 一次。
    expect(gitEntryStats).toEqual([
      join(nestedDirectory, ".git"),
      join(repoDirectory, "src", ".git"),
      join(repoDirectory, ".git"),
    ]);
  });

  it("reports a directory without .git as a non-repository and starts no git", async () => {
    if (!outsideIsReliable) return;
    const { resolveGitSnapshot } = await import("../src/context/git-snapshot.js");
    expect(await resolveGitSnapshot(outsideDirectory)).toEqual({
      isGitRepository: false,
      gitStatus: "not_repo",
    });
    expect(gitCalls).toEqual([]);
  });

  it.each([
    ["a timeout", { code: 0, failure: "timeout" }],
    ["an abort", { code: 0, failure: "abort" }],
    ["a missing git", { code: 0, failure: "spawn" }],
  ] as const)(
    "still reports a repository when every git command fails with %s",
    async (_label, response) => {
      const adapter = createNodeContextSourceAdapter({ env: {} });
      for (const args of SNAPSHOT_COMMANDS) setGitResponse(args, response);
      const { resolveGitSnapshot } = await import("../src/context/git-snapshot.js");
      // 修复原因：git 卡住或没装时原来被记成"不是仓库"，Environment 与之后的 gitStatus 互相矛盾。
      expect(await resolveGitSnapshot(repoDirectory)).toEqual({
        isGitRepository: true,
        gitBranch: "HEAD",
        gitMainBranch: "main",
        gitStatus: "clean",
        gitStatusLines: [],
        recentCommits: [],
      });
      const snapshot = await adapter.resolveContextSources({ workingDirectory: repoDirectory });
      expect(snapshot.envInfo).toMatchObject({ isGitRepository: true, gitStatus: "clean" });
    },
  );

  it("passes the request signal to every git command", async () => {
    const controller = new AbortController();
    setGitResponse(["symbolic-ref", "--short", "-q", "HEAD"], { code: 0, stdout: "feature\n" });
    const { resolveGitSnapshot } = await import("../src/context/git-snapshot.js");
    await resolveGitSnapshot(repoDirectory, controller.signal);
    expect(gitCalls.length).toBeGreaterThan(2);
    expect(gitCalls.every(({ options }) => options.signal === controller.signal)).toBe(true);
  });
});
