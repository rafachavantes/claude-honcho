import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { sessionRootFor, worktreeMainRootFor } from "../src/config";

function makeTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "honcho-session-root-")));
}

describe("sessionRootFor", () => {
  test("regular repository root resolves to itself", () => {
    const tmp = makeTmp();
    try {
      mkdirSync(join(tmp, ".git"), { recursive: true });
      expect(sessionRootFor(tmp)).toBe(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("subdirectory of a regular repository resolves to the repo root", () => {
    const tmp = makeTmp();
    try {
      mkdirSync(join(tmp, ".git"), { recursive: true });
      const sub = join(tmp, "packages", "api");
      mkdirSync(sub, { recursive: true });
      expect(sessionRootFor(sub)).toBe(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("linked worktree resolves to the main repository", () => {
    const tmp = makeTmp();
    try {
      const main = join(tmp, "main");
      const wt = join(tmp, "wt");
      mkdirSync(join(main, ".git", "worktrees", "feature-x"), { recursive: true });
      mkdirSync(join(wt, "src", "deep"), { recursive: true });
      writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "feature-x")}\n`);
      expect(sessionRootFor(wt)).toBe(main);
      expect(sessionRootFor(join(wt, "src", "deep"))).toBe(main);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("outside any repository returns null", () => {
    const tmp = makeTmp();
    try {
      expect(sessionRootFor(tmp)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Guards the upstream contract: their function still returns null for a
  // regular repository, which is exactly why sessionRootFor exists.
  test("worktreeMainRootFor still returns null for a regular repository", () => {
    const tmp = makeTmp();
    try {
      mkdirSync(join(tmp, ".git"), { recursive: true });
      expect(worktreeMainRootFor(tmp)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
