import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

const CONFIG_MODULE = fileURLToPath(new URL("../src/config.ts", import.meta.url));

function git(cwd: string, args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", ...args],
    { cwd, encoding: "utf-8" },
  ).trim();
}

describe("getSessionName follows the repository root", () => {
  let base: string;
  let home: string;        // sessionStrategy: per-directory (default)
  let homeBranch: string;  // sessionStrategy: git-branch
  let repo: string;
  let sub: string;
  let worktree: string;
  let runner: string;
  let overrideRunner: string;

  function writeHome(dir: string, extra: Record<string, unknown>): void {
    mkdirSync(join(dir, ".honcho"), { recursive: true });
    writeFileSync(
      join(dir, ".honcho", "config.json"),
      JSON.stringify({ apiKey: "test", workspace: "test-ws", peerName: "rafa", aiPeer: "claude", ...extra }),
    );
  }

  /** Resolve the session name for `cwd` in a child bun process with an isolated HOME. */
  function sessionNameFor(cwd: string, homeDir: string = home): string {
    const proc = Bun.spawnSync({
      cmd: ["bun", "run", runner, cwd],
      env: { ...process.env, HOME: homeDir },
    });
    if (proc.exitCode !== 0) {
      throw new Error(`runner failed (${proc.exitCode}): ${proc.stderr.toString()}`);
    }
    return proc.stdout.toString().trim();
  }

  /** What SessionStart would persist for `cwd`, or "" for nothing. */
  function overrideKeyFor(cwd: string, homeDir: string = home): string {
    const proc = Bun.spawnSync({
      cmd: ["bun", "run", overrideRunner, cwd],
      env: { ...process.env, HOME: homeDir },
    });
    if (proc.exitCode !== 0) {
      throw new Error(`runner failed (${proc.exitCode}): ${proc.stderr.toString()}`);
    }
    return proc.stdout.toString().trim();
  }

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), "honcho-session-test-")));
    home = join(base, "home");
    homeBranch = join(base, "home-branch");
    repo = join(base, "my-project");
    sub = join(repo, "packages", "api");
    worktree = join(base, "my-project-wt");

    writeHome(home, {});
    writeHome(homeBranch, { sessionStrategy: "git-branch" });

    mkdirSync(sub, { recursive: true });
    git(repo, ["init", "-b", "main"]);
    git(repo, ["commit", "--allow-empty", "-m", "init"]);
    git(repo, ["worktree", "add", worktree, "-b", "feature-branch"]);

    runner = join(base, "session-name-runner.ts");
    writeFileSync(
      runner,
      `import { getSessionName } from ${JSON.stringify(CONFIG_MODULE)};\n` +
        `console.log(getSessionName(process.argv[2]));\n`,
    );

    overrideRunner = join(base, "override-runner.ts");
    writeFileSync(
      overrideRunner,
      `import { sessionOverrideToPersist } from ${JSON.stringify(CONFIG_MODULE)};\n` +
        `console.log(sessionOverrideToPersist(process.argv[2]) ?? "");\n`,
    );
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  test("repository root itself", () => {
    expect(sessionNameFor(repo)).toBe("rafa-my-project");
  });

  test("subdirectory maps to the same session as the root", () => {
    expect(sessionNameFor(sub)).toBe("rafa-my-project");
  });

  test("linked worktree maps to the same session as the main repo", () => {
    expect(sessionNameFor(worktree)).toBe("rafa-my-project");
  });

  test("a root-keyed override is found from a subdirectory and from a worktree", () => {
    // SessionStart keys the override it persists on sessionRootFor(cwd). This
    // is the read side of that contract: one entry at the root must serve the
    // whole repo, or every subdirectory visited would mint its own.
    const overrideHome = join(base, "home-override");
    writeHome(overrideHome, { sessions: { [repo]: "renamed-session" } });
    expect(sessionNameFor(repo, overrideHome)).toBe("renamed-session");
    expect(sessionNameFor(sub, overrideHome)).toBe("renamed-session");
    expect(sessionNameFor(worktree, overrideHome)).toBe("renamed-session");
  });

  test("the persisted override is keyed on the repo root, not the cwd", () => {
    // The writer half of the contract: starting anywhere inside the repo
    // persists one entry, at the root.
    expect(overrideKeyFor(repo)).toBe(repo);
    expect(overrideKeyFor(sub)).toBe(repo);
    expect(overrideKeyFor(worktree)).toBe(repo);
  });

  test("nothing is persisted when a mapping already covers the cwd", () => {
    // Root-keyed mapping: no write from anywhere in the repo.
    const covered = join(base, "home-covered");
    writeHome(covered, { sessions: { [repo]: "renamed-session" } });
    expect(overrideKeyFor(repo, covered)).toBe("");
    expect(overrideKeyFor(sub, covered)).toBe("");

    // Legacy mapping written under a raw subdirectory path. Persisting the
    // root here would promote that subdirectory's session to the whole repo.
    const legacy = join(base, "home-legacy");
    writeHome(legacy, { sessions: { [sub]: "api-special" } });
    expect(sessionNameFor(sub, legacy)).toBe("api-special");
    expect(overrideKeyFor(sub, legacy)).toBe("");
    expect(sessionNameFor(repo, legacy)).toBe("rafa-my-project");
  });

  test("dynamic strategies persist nothing", () => {
    expect(overrideKeyFor(repo, homeBranch)).toBe("");
  });

  test("non-git directory falls back to the raw cwd basename", () => {
    const plain = join(base, "plain-dir");
    mkdirSync(plain, { recursive: true });
    expect(sessionNameFor(plain)).toBe("rafa-plain-dir");
  });

  // git-branch: the base name unifies on the repo, but the branch comes from
  // the current worktree's HEAD — and must work from a subdirectory too.
  test("git-branch keeps the branch suffix from a subdirectory", () => {
    expect(sessionNameFor(repo, homeBranch)).toBe("rafa-my-project-main");
    expect(sessionNameFor(sub, homeBranch)).toBe("rafa-my-project-main");
  });

  test("git-branch reads the linked worktree's own HEAD", () => {
    expect(sessionNameFor(worktree, homeBranch)).toBe("rafa-my-project-feature-branch");
  });
});
