import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getRepoRoot, getWorktreeRoot } from "./git.js";

function git(cwd: string, args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", ...args],
    { cwd, encoding: "utf-8" },
  ).trim();
}

describe("getRepoRoot / getWorktreeRoot", () => {
  let base: string;
  let repo: string;
  let sub: string;
  let worktree: string;

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), "honcho-git-test-")));
    repo = join(base, "repo");
    sub = join(repo, "deep", "nested");
    worktree = join(base, "repo-wt");

    mkdirSync(sub, { recursive: true });
    git(repo, ["init", "-b", "main"]);
    git(repo, ["commit", "--allow-empty", "-m", "init"]);
    git(repo, ["worktree", "add", worktree, "-b", "feature-branch"]);
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  test("repo root from the root itself", () => {
    expect(getRepoRoot(repo)).toBe(repo);
  });

  test("repo root from a nested subdirectory", () => {
    expect(getRepoRoot(sub)).toBe(repo);
    expect(getWorktreeRoot(sub)).toBe(repo);
  });

  test("linked worktree resolves to the main repo root", () => {
    expect(getRepoRoot(worktree)).toBe(repo);
  });

  test("worktree root stays on the linked worktree", () => {
    expect(getWorktreeRoot(worktree)).toBe(worktree);
  });

  test("subdirectory of a linked worktree resolves to the main repo root", () => {
    const wtSub = join(worktree, "wt-deep");
    mkdirSync(wtSub, { recursive: true });
    expect(getRepoRoot(wtSub)).toBe(repo);
    expect(getWorktreeRoot(wtSub)).toBe(worktree);
  });

  test("non-git directory returns null", () => {
    const plain = join(base, "plain");
    mkdirSync(plain, { recursive: true });
    expect(getRepoRoot(plain)).toBeNull();
    expect(getWorktreeRoot(plain)).toBeNull();
  });
});
