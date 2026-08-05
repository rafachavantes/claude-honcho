import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

const CACHE_MODULE = fileURLToPath(new URL("../src/cache.ts", import.meta.url));

describe("post-compact flag", () => {
  let home: string;
  let results: Record<string, boolean>;

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), "honcho-flag-home-"));
    mkdirSync(join(home, ".honcho"), { recursive: true });

    const runner = join(home, "flag-runner.ts");
    writeFileSync(
      runner,
      `import { setPostCompactFlag, clearPostCompactFlag, consumePostCompactFlag } from ${JSON.stringify(CACHE_MODULE)};
const cwd = ${JSON.stringify(join(home, "not-a-repo"))};
const r: Record<string, boolean> = {};

r.emptyConsume = consumePostCompactFlag(cwd);

setPostCompactFlag(cwd, "instance-a");
r.firstConsume = consumePostCompactFlag(cwd, "instance-a");
r.secondConsume = consumePostCompactFlag(cwd, "instance-a");

setPostCompactFlag(cwd, "instance-a");
r.otherInstance = consumePostCompactFlag(cwd, "instance-b");
r.ownInstance = consumePostCompactFlag(cwd, "instance-a");

setPostCompactFlag(cwd, "instance-a");
clearPostCompactFlag(cwd);
r.afterClear = consumePostCompactFlag(cwd, "instance-a");

console.log(JSON.stringify(r));
`,
    );

    const proc = Bun.spawnSync({
      cmd: ["bun", "run", runner],
      env: { ...process.env, HOME: home },
    });
    if (proc.exitCode !== 0) {
      throw new Error(`runner failed (${proc.exitCode}): ${proc.stderr.toString()}`);
    }
    results = JSON.parse(proc.stdout.toString().trim());
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("no flag set means nothing to consume", () => {
    expect(results.emptyConsume).toBe(false);
  });

  test("a set flag is consumed exactly once", () => {
    expect(results.firstConsume).toBe(true);
    expect(results.secondConsume).toBe(false);
  });

  test("a different instance does not consume the flag", () => {
    expect(results.otherInstance).toBe(false);
    expect(results.ownInstance).toBe(true);
  });

  test("clear removes a pending flag", () => {
    expect(results.afterClear).toBe(false);
  });
});
