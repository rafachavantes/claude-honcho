import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

const CONFIG_MODULE = fileURLToPath(new URL("../src/config.ts", import.meta.url));

/** Resolve preCompactAnchor in a subprocess with an isolated HOME.
 *  config.ts freezes homedir() at module load, and `bun test` shares one
 *  process across files — an in-process test would read the real ~/.honcho. */
function resolve(config: unknown, env: Record<string, string> = {}): string {
  const home = mkdtempSync(join(tmpdir(), "honcho-anchor-home-"));
  try {
    mkdirSync(join(home, ".honcho"), { recursive: true });
    writeFileSync(join(home, ".honcho", "config.json"), JSON.stringify(config));

    const runner = join(home, "anchor-runner.ts");
    writeFileSync(
      runner,
      `import { loadConfig, getPreCompactAnchor } from ${JSON.stringify(CONFIG_MODULE)};
const config = loadConfig();
if (!config) throw new Error("config did not load");
console.log(getPreCompactAnchor(config));
`,
    );

    const proc = Bun.spawnSync({
      cmd: ["bun", "run", runner],
      env: { ...process.env, HOME: home, HONCHO_PRE_COMPACT_ANCHOR: "", ...env },
    });
    if (proc.exitCode !== 0) {
      throw new Error(`runner failed (${proc.exitCode}): ${proc.stderr.toString()}`);
    }
    return proc.stdout.toString().trim();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const BASE = { apiKey: "test-key", peerName: "rafa", workspace: "rafa" };

describe("preCompactAnchor resolution", () => {
  test("defaults to full — an unconfigured install behaves like upstream", () => {
    expect(resolve(BASE)).toBe("full");
  });

  test("root-level off disables the anchor", () => {
    expect(resolve({ ...BASE, preCompactAnchor: "off" })).toBe("off");
  });

  test("host block wins over the root value", () => {
    expect(
      resolve({
        ...BASE,
        preCompactAnchor: "full",
        hosts: { claude_code: { preCompactAnchor: "off" } },
      }),
    ).toBe("off");
  });

  test("env var wins over config", () => {
    expect(resolve({ ...BASE, preCompactAnchor: "full" }, { HONCHO_PRE_COMPACT_ANCHOR: "off" })).toBe("off");
  });

  test("an invalid env value falls back to config", () => {
    expect(resolve({ ...BASE, preCompactAnchor: "off" }, { HONCHO_PRE_COMPACT_ANCHOR: "slim" })).toBe("off");
  });
});
