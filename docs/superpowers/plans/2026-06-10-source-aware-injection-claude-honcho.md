# Source-Aware Injection (claude-honcho) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the compact → re-inject → compact loop by making the Honcho plugin's memory injection aware of `SessionStart` `source: "compact"`, gated by a new `injectOnCompact` config (default `slim`) and a `preCompactAnchor` config (default `false`).

**Architecture:** Hooks-only change in `plugins/honcho`. A new pure policy module decides injection mode from (source, config). `session-start.ts` early-exits on post-compact starts and sets a one-shot flag in the existing context cache; `user-prompt.ts` consumes the flag and injects at most a one-line pointer; `pre-compact.ts` becomes a near no-op unless `preCompactAnchor` is enabled. Config/MCP/skill surfaces expose both new fields.

**Tech Stack:** Bun + TypeScript. Tests are colocated `*.test.ts` files run with `bun test` (they run against the real `~/.honcho` cache files — use fake `cwd` keys and clean up, matching `queue.test.ts`). Typecheck with `bunx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-06-10-source-aware-injection-design.md`

**Working directory for all commands:** `/home/rafa/repos/claude-honcho/plugins/honcho`
**Branch:** `feat/source-aware-injection` (already checked out — commit incrementally, do not branch again)

**Note on the repo's git status:** `plugins/honcho/node_modules/` shows many modified files. Never `git add -A`. Stage only the explicit paths listed in each commit step.

---

### Task 1: Injection policy module

The shared policy from the spec: `decideInjection(source, injectOnCompact)` → only a post-compact start is downgraded; every other source keeps full injection.

**Files:**
- Create: `src/injection-policy.ts`
- Test: `src/injection-policy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/injection-policy.test.ts`:

```ts
import { test, expect } from "bun:test";
import { decideInjection, SLIM_POINTER } from "./injection-policy.js";

test("non-compact sources always inject full", () => {
  for (const source of ["startup", "resume", "clear", undefined]) {
    expect(decideInjection(source, "full")).toBe("full");
    expect(decideInjection(source, "slim")).toBe("full");
    expect(decideInjection(source, "off")).toBe("full");
  }
});

test("compact source follows injectOnCompact config", () => {
  expect(decideInjection("compact", "full")).toBe("full");
  expect(decideInjection("compact", "slim")).toBe("slim");
  expect(decideInjection("compact", "off")).toBe("off");
});

test("slim pointer is one short line", () => {
  expect(SLIM_POINTER).not.toContain("\n");
  expect(SLIM_POINTER.length).toBeLessThan(160);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/injection-policy.test.ts`
Expected: FAIL — `Cannot find module './injection-policy.js'`

- [ ] **Step 3: Write the implementation**

Create `src/injection-policy.ts`:

```ts
export type InjectOnCompact = "full" | "slim" | "off";

export const SLIM_POINTER =
  "Honcho memory is active for this session; older details can be recalled via the honcho tools.";

/**
 * Source-aware injection policy. Only a SessionStart fired by context
 * compaction is downgraded — the host CLI's own compaction summary already
 * carries recent context. Every other source (startup, resume, clear,
 * missing) keeps full injection.
 */
export function decideInjection(
  source: string | undefined,
  injectOnCompact: InjectOnCompact,
): InjectOnCompact {
  if (source !== "compact") return "full";
  return injectOnCompact;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/injection-policy.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/honcho/src/injection-policy.ts plugins/honcho/src/injection-policy.test.ts
git commit -m "feat(plugin): add source-aware injection policy module"
```

---

### Task 2: Config plumbing — `injectOnCompact` + `preCompactAnchor`

**Files:**
- Modify: `src/config.ts`
- Test: `src/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/config.test.ts` (it currently has two tests for `getContextScope`/`getWriteMode`/`shouldCaptureToolCalls`; extend the import line and add tests):

Change the import at the top of the file from:

```ts
import { getContextScope, getWriteMode, shouldCaptureToolCalls } from "./config.js";
```

to:

```ts
import { getContextScope, getWriteMode, shouldCaptureToolCalls, getInjectOnCompact, getPreCompactAnchor } from "./config.js";
```

Append:

```ts
test("injectOnCompact defaults to slim, preCompactAnchor defaults to false", () => {
  delete process.env.HONCHO_INJECT_ON_COMPACT;
  expect(getInjectOnCompact({} as any)).toBe("slim");
  expect(getPreCompactAnchor({} as any)).toBe(false);
});

test("explicit injectOnCompact and preCompactAnchor are honored", () => {
  delete process.env.HONCHO_INJECT_ON_COMPACT;
  expect(getInjectOnCompact({ injectOnCompact: "off" } as any)).toBe("off");
  expect(getInjectOnCompact({ injectOnCompact: "full" } as any)).toBe("full");
  expect(getPreCompactAnchor({ preCompactAnchor: true } as any)).toBe(true);
});

test("HONCHO_INJECT_ON_COMPACT env overrides config; invalid values are ignored", () => {
  process.env.HONCHO_INJECT_ON_COMPACT = "off";
  expect(getInjectOnCompact({ injectOnCompact: "full" } as any)).toBe("off");
  process.env.HONCHO_INJECT_ON_COMPACT = "bogus";
  expect(getInjectOnCompact({ injectOnCompact: "full" } as any)).toBe("full");
  delete process.env.HONCHO_INJECT_ON_COMPACT;
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/config.test.ts`
Expected: FAIL — `getInjectOnCompact` is not exported

- [ ] **Step 3: Implement in `src/config.ts`**

3a. Add the type import near the top (after the existing imports, around line 5):

```ts
import type { InjectOnCompact } from "./injection-policy.js";
export type { InjectOnCompact } from "./injection-policy.js";
```

3b. In `interface HostConfig` (after the `captureToolCalls?: boolean;` field, ~line 97), add:

```ts
  /** Injection behavior after context compaction (default: "slim") */
  injectOnCompact?: InjectOnCompact;
  /** Build the pre-compaction memory anchor + dialectic calls (default: false) */
  preCompactAnchor?: boolean;
```

3c. In `interface HonchoFileConfig` (after `captureToolCalls?: boolean;`, ~line 201), add the same two fields:

```ts
  /** Injection behavior after context compaction (default: "slim") */
  injectOnCompact?: InjectOnCompact;
  /** Build the pre-compaction memory anchor + dialectic calls (default: false) */
  preCompactAnchor?: boolean;
```

3d. In `interface HonchoCLAUDEConfig` (after `captureToolCalls?: boolean;`, ~line 248), add the same two fields again (same code as 3c).

3e. In `resolveConfig()`, in the `const config: HonchoCLAUDEConfig = {...}` literal (after the `captureToolCalls:` line, ~line 367), add:

```ts
    injectOnCompact: hostBlock?.injectOnCompact ?? raw.injectOnCompact,
    preCompactAnchor: hostBlock?.preCompactAnchor ?? raw.preCompactAnchor,
```

3f. In `saveConfig()`, after the `setHostIfExplicit("captureToolCalls", ...)` line (~line 525), add:

```ts
  setHostIfExplicit("injectOnCompact", config.injectOnCompact, existing.injectOnCompact);
  setHostIfExplicit("preCompactAnchor", config.preCompactAnchor, existing.preCompactAnchor);
```

3g. Add getters next to `getContextScope`/`getWriteMode` (~line 770):

```ts
const VALID_INJECT_ON_COMPACT = new Set<string>(["full", "slim", "off"]);

/** Post-compaction injection mode. Priority: env > config (host > root) > "slim". */
export function getInjectOnCompact(config: HonchoCLAUDEConfig): InjectOnCompact {
  const env = process.env.HONCHO_INJECT_ON_COMPACT;
  if (env && VALID_INJECT_ON_COMPACT.has(env)) return env as InjectOnCompact;
  return config.injectOnCompact ?? "slim";
}

/** Whether PreCompact builds the memory anchor + dialectic calls (default: false). */
export function getPreCompactAnchor(config: HonchoCLAUDEConfig): boolean {
  return config.preCompactAnchor ?? false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/config.test.ts && bunx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add plugins/honcho/src/config.ts plugins/honcho/src/config.test.ts
git commit -m "feat(plugin): injectOnCompact + preCompactAnchor config fields"
```

---

### Task 3: Post-compact flag in the context cache

One-shot flag keyed by cwd (+ instance id for parallel sessions), stored in the existing `~/.honcho/context-cache.json`.

**Files:**
- Modify: `src/cache.ts`
- Test: `src/cache.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

Create `src/cache.test.ts`. Like `queue.test.ts`, this runs against the real `~/.honcho` cache — use fake cwd keys and clean up so user state is untouched:

```ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { setPostCompactFlag, consumePostCompactFlag, clearPostCompactFlag } from "./cache.js";

const CWD = "/test-postcompact-flag";

beforeEach(() => clearPostCompactFlag(CWD));
afterEach(() => clearPostCompactFlag(CWD));

test("flag is one-shot: consume returns true once, then false", () => {
  setPostCompactFlag(CWD, "inst-1");
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(true);
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(false);
});

test("no flag set -> consume returns false", () => {
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(false);
});

test("flag for another instance is left untouched", () => {
  setPostCompactFlag(CWD, "inst-1");
  expect(consumePostCompactFlag(CWD, "inst-2")).toBe(false);
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(true);
});

test("missing instance ids fall back to cwd-only matching", () => {
  setPostCompactFlag(CWD, undefined);
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(true);
  setPostCompactFlag(CWD, "inst-1");
  expect(consumePostCompactFlag(CWD, undefined)).toBe(true);
});

test("clearPostCompactFlag removes a pending flag", () => {
  setPostCompactFlag(CWD, "inst-1");
  clearPostCompactFlag(CWD);
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/cache.test.ts`
Expected: FAIL — `setPostCompactFlag` is not exported

- [ ] **Step 3: Implement in `src/cache.ts`**

3a. In `interface ContextCache` (~line 120), add a field:

```ts
  postCompact?: Record<string, { instanceId?: string; at: number }>; // cwd -> pending post-compact flag
```

3b. Add `"postCompact"` to `CONTEXT_CACHE_KNOWN_KEYS` (~line 140) so `loadContextCache()` doesn't strip it:

```ts
const CONTEXT_CACHE_KNOWN_KEYS = new Set([
  "userContext", "claudeContext", "summaries", "messageCount", "lastRefreshMessageCount", "postCompact",
]);
```

3c. Add helpers after `resetMessageCount()` (~line 246):

```ts
// ============================================
// Post-Compact Flag — set by session-start (source=compact),
// consumed by the next user-prompt to downgrade injection
// ============================================

export function setPostCompactFlag(cwd: string, instanceId?: string): void {
  const cache = loadContextCache();
  if (!cache.postCompact) cache.postCompact = {};
  cache.postCompact[cwd] = { instanceId, at: Date.now() };
  saveContextCache(cache);
}

/** Remove any pending flag for this cwd (e.g. on a fresh non-compact start). */
export function clearPostCompactFlag(cwd: string): void {
  const cache = loadContextCache();
  if (!cache.postCompact?.[cwd]) return;
  delete cache.postCompact[cwd];
  saveContextCache(cache);
}

/**
 * Check-and-clear. Matches when the stored flag belongs to this instance, or
 * when either side has no instance id (single-session case). A flag owned by
 * a different instance is left untouched for that session to consume.
 */
export function consumePostCompactFlag(cwd: string, instanceId?: string): boolean {
  const cache = loadContextCache();
  const entry = cache.postCompact?.[cwd];
  if (!entry) return false;
  if (entry.instanceId && instanceId && entry.instanceId !== instanceId) return false;
  delete cache.postCompact![cwd];
  saveContextCache(cache);
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/cache.test.ts && bunx tsc --noEmit`
Expected: PASS (5 tests), no type errors

- [ ] **Step 5: Commit**

```bash
git add plugins/honcho/src/cache.ts plugins/honcho/src/cache.test.ts
git commit -m "feat(plugin): post-compact flag helpers in context cache"
```

---

### Task 4: Gate `session-start.ts` on source

**Files:**
- Modify: `src/hooks/session-start.ts`

No unit test (hook handlers are process.exit-heavy and untested in this repo); verified by the smoke test in Step 3 and manual verification in Task 8.

- [ ] **Step 1: Add imports**

In `src/hooks/session-start.ts`, extend the config import (line 2) to include `getInjectOnCompact`:

```ts
import { loadConfig, getSessionForPath, setSessionForPath, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, getObservationMode, getInjectOnCompact } from "../config.js";
```

Extend the cache import block (lines 4–12) with `setPostCompactFlag` and `clearPostCompactFlag`:

```ts
import {
  setCachedUserContext,
  setCachedSessionId,
  resetMessageCount,
  setClaudeInstanceId,
  getCachedGitState,
  setCachedGitState,
  detectGitChanges,
  setPostCompactFlag,
  clearPostCompactFlag,
} from "../cache.js";
```

Add below the other imports:

```ts
import { decideInjection } from "../injection-policy.js";
```

- [ ] **Step 2: Add the gate**

Immediately after `setLogContext(cwd, sessionName);` (line 62, before `clearVerboseLog()`), insert:

```ts
  // Source-aware injection: a post-compact start must not refill the context
  // window the host just freed. Set a one-shot flag for user-prompt and skip
  // the context-cache warm + dialectic queries entirely.
  const injectOnCompact = getInjectOnCompact(config);
  if (decideInjection(hookInput.source, injectOnCompact) !== "full") {
    setPostCompactFlag(cwd, claudeInstanceId);
    logHook("session-start", `Post-compact start: skipped context warm (injectOnCompact=${injectOnCompact})`);
    process.exit(0);
  }
  // Any other start discards a stale flag left by a crashed/abandoned session
  if (hookInput.source !== "compact") {
    clearPostCompactFlag(cwd);
  }
```

Note: this is intentionally placed *before* `resetMessageCount()` so a post-compact start keeps the message-threshold cadence counting across compaction, and *before* the spinner/git/API work so the hook costs nothing after compaction. `startup`/`resume`/`clear` behavior is unchanged.

- [ ] **Step 3: Typecheck and smoke-test**

```bash
bunx tsc --noEmit
echo '{"session_id":"smoke-1","cwd":"/tmp/honcho-smoke","source":"compact"}' | HONCHO_API_KEY=dummy bun run hooks/session-start.ts; echo "exit=$?"
grep -A3 'honcho-smoke' ~/.honcho/context-cache.json
```

Expected: exit=0, no spinner/API output, and the grep shows a `postCompact` entry for `/tmp/honcho-smoke` with `"instanceId": "smoke-1"`. The flag entry is harmless (consumed or cleared by later runs) — leave it; Task 5's smoke test consumes it.

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add plugins/honcho/src/hooks/session-start.ts
git commit -m "feat(plugin): skip context warm on post-compact session start"
```

---

### Task 5: Slim/off injection in `user-prompt.ts`

**Files:**
- Modify: `src/hooks/user-prompt.ts`

- [ ] **Step 1: Add imports**

Extend the config import (line 4) with `getInjectOnCompact`:

```ts
import { loadConfig, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, getWriteMode, getDetectedHost, getInjectOnCompact } from "../config.js";
```

Extend the cache import block (lines 6–18) with `consumePostCompactFlag`:

```ts
import {
  getCachedUserContext,
  getStaleCachedUserContext,
  isContextCacheStale,
  setCachedUserContext,
  getMessageCount,
  incrementMessageCount,
  shouldRefreshKnowledgeGraph,
  markKnowledgeGraphRefreshed,
  getInstanceIdForCwd,
  queueMessage,
  spawnFlusher,
  consumePostCompactFlag,
} from "../cache.js";
```

Add below the other imports:

```ts
import { SLIM_POINTER } from "../injection-policy.js";
```

- [ ] **Step 2: Add the post-compact branch**

In `handleUserPrompt()`, immediately after the trivial-prompt skip block (the `if (shouldSkipContextRetrieval(prompt)) {...}` block ending at line 181) and before the `// Decide whether to refresh` comment, insert:

```ts
  // Post-compact downgrade: the host's compaction summary already carries
  // recent context, so inject at most a slim pointer instead of the full
  // cached package. The flag is one-shot — normal TTL/threshold cadence
  // resumes on the next prompt. (Placed after the trivial-prompt skip so a
  // "y"/"ok" first prompt doesn't burn the flag without an injection.)
  if (consumePostCompactFlag(cwd, instanceId || undefined)) {
    const mode = getInjectOnCompact(config);
    if (mode !== "full") {
      if (mode === "slim") {
        console.log(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: `[Honcho Memory]: ${SLIM_POINTER}`,
          },
        }));
      }
      logHook("user-prompt", `Post-compact prompt: ${mode} injection`);
      process.exit(0);
    }
    // mode flipped to "full" since the flag was set — fall through to normal injection
  }
```

Note message persistence is unaffected: `queueMessage(...)` and the flusher run earlier in the function (lines 139–148) before this branch.

- [ ] **Step 3: Typecheck and smoke-test the pair**

```bash
bunx tsc --noEmit
echo '{"session_id":"smoke-2","cwd":"/tmp/honcho-smoke","source":"compact"}' | HONCHO_API_KEY=dummy bun run hooks/session-start.ts
echo '{"prompt":"continue the refactor please","session_id":"smoke-2","cwd":"/tmp/honcho-smoke"}' | HONCHO_API_KEY=dummy bun run hooks/user-prompt.ts
```

Expected: the second command prints a single JSON line whose `additionalContext` is `[Honcho Memory]: Honcho memory is active for this session; older details can be recalled via the honcho tools.` — and running the second command again prints full context or nothing (flag consumed), not the pointer.

Cleanup: the smoke prompt gets queued to the real message queue (`HONCHO_SAVE_MESSAGES` env does not override a file config — only `loadConfigFromEnv` reads it). Remove the junk entries:

```bash
grep -v honcho-smoke ~/.honcho/message-queue.jsonl > /tmp/mq.tmp && mv /tmp/mq.tmp ~/.honcho/message-queue.jsonl
```

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add plugins/honcho/src/hooks/user-prompt.ts
git commit -m "feat(plugin): slim pointer injection on first post-compact prompt"
```

---

### Task 6: Gate `pre-compact.ts` behind `preCompactAnchor`

**Files:**
- Modify: `src/hooks/pre-compact.ts`

- [ ] **Step 1: Add import**

Extend the config import (line 2) with `getPreCompactAnchor`:

```ts
import { loadConfig, getSessionForPath, getSessionName, getHonchoClientOptions, isPluginEnabled, getCachedStdin, getObservationMode, getPreCompactAnchor } from "../config.js";
```

- [ ] **Step 2: Add the gate**

In `handlePreCompact()`, immediately after `logHook("pre-compact", \`Compaction triggered (${trigger})\`);` (line 117) and **before** the spinner is created, insert:

```ts
  // Memory anchor is opt-in (preCompactAnchor, default false): we rely on the
  // host CLI's own compaction summary. Message persistence does not happen in
  // this hook, so skipping is safe. PreCompact must never block compaction.
  if (!getPreCompactAnchor(config)) {
    logHook("pre-compact", "Memory anchor skipped (preCompactAnchor=false)");
    process.exit(0);
  }
```

With `preCompactAnchor: true`, the existing anchor + 2 dialectic calls run unchanged.

- [ ] **Step 3: Typecheck and smoke-test**

```bash
bunx tsc --noEmit
echo '{"trigger":"manual","cwd":"/tmp/honcho-smoke"}' | HONCHO_API_KEY=dummy bun run hooks/pre-compact.ts; echo "exit=$?"
```

Expected: exit=0, no `[.../Honcho Memory Anchor]` output, no spinner.

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add plugins/honcho/src/hooks/pre-compact.ts
git commit -m "feat(plugin): gate pre-compact memory anchor behind preCompactAnchor (default off)"
```

---

### Task 7: Expose both fields via MCP `set_config` / `get_config`

**Files:**
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Imports and env-shadow map**

1a. `server.ts` imports types from `../config.js` — add `getInjectOnCompact`, `getPreCompactAnchor`, and the `InjectOnCompact` type to that existing import statement (find the `from "../config.js"` import at the top of the file and extend it).

1b. In `ENV_SHADOW_MAP` (line 44), add:

```ts
  injectOnCompact: "HONCHO_INJECT_ON_COMPACT",
```

- [ ] **Step 2: Add `set_config` cases**

In `handleSetConfig()`'s `switch (field)` (after the `case "observationMode":` block, ~line 434), add:

```ts
    case "injectOnCompact": {
      const mode = String(value);
      if (mode !== "full" && mode !== "slim" && mode !== "off") {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "injectOnCompact must be one of: full, slim, off" }, null, 2) }],
          isError: true,
        };
      }
      previousValue = cfg.injectOnCompact ?? "slim";
      cfg.injectOnCompact = mode as InjectOnCompact;
      break;
    }

    case "preCompactAnchor":
      previousValue = cfg.preCompactAnchor ?? false;
      cfg.preCompactAnchor = Boolean(value);
      break;
```

- [ ] **Step 3: Add to the tool schema enum**

In the `set_config` tool definition's `field.enum` array (~line 707), after `"observationMode",` add:

```ts
                  "injectOnCompact",
                  "preCompactAnchor",
```

- [ ] **Step 4: Surface in resolved config output**

There are two `resolved` object literals (one in `handleGetConfig`, one at the tail of `handleSetConfig`, ~line 503). In **both**, after the `sessionPeerPrefix` line, add:

```ts
    injectOnCompact: getInjectOnCompact(cfg),
    preCompactAnchor: getPreCompactAnchor(cfg),
```

(In `handleGetConfig` the config variable may be named differently — match the local name used by the surrounding lines.)

- [ ] **Step 5: Typecheck + full suite**

Run: `bunx tsc --noEmit && bun test`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add plugins/honcho/src/mcp/server.ts
git commit -m "feat(mcp): set_config/get_config support for injectOnCompact + preCompactAnchor"
```

---

### Task 8: Config skill + README docs

**Files:**
- Modify: `skills/config/SKILL.md`
- Modify: `README.md` (repo root — the config reference block that documents `contextRefresh.skipDialectic`)

- [ ] **Step 1: Add a "Compaction" entry to the advanced menu in `skills/config/SKILL.md`**

In the Step 2 advanced-options `AskUserQuestion` block (after the `Statusline` option), add:

```
    - label: "Compaction"
      description: "Post-compact injection + pre-compact anchor (currently: {resolved.injectOnCompact} / anchor {resolved.preCompactAnchor})"
```

- [ ] **Step 2: Add the handling section**

After the `### Statusline` section, add:

```markdown
### Compaction

Use `AskUserQuestion` to pick which setting to change:

```
AskUserQuestion:
  question: "Which compaction setting?"
  header: "Compaction"
  options:
    - label: "Inject on compact"
      description: "Memory re-injection after compaction — currently {resolved.injectOnCompact} (default: slim)"
    - label: "Pre-compact anchor"
      description: "Memory anchor before compaction — currently {resolved.preCompactAnchor} (default: false)"
```

For "Inject on compact", offer the three modes:

```
AskUserQuestion:
  question: "Injection behavior after compaction?"
  header: "Mode"
  options:
    - label: "slim (Recommended)"
      description: "One-line pointer only — the host's compaction summary carries recent context"
    - label: "off"
      description: "Inject nothing after compaction"
    - label: "full"
      description: "Re-inject the full memory package (pre-0.3 behavior; can re-inflate context)"
```

Call `set_config` with field `injectOnCompact`.

For "Pre-compact anchor", offer on/off and call `set_config` with field `preCompactAnchor` (boolean). Explain that `true` restores the HONCHO MEMORY ANCHOR injection + 2 dialectic calls before each compaction.
```

- [ ] **Step 3: Document in README.md**

In the root `README.md` config reference (the JSON block containing `"contextRefresh"` around line 228), add to the host-level settings example, with comments matching the file's style:

```jsonc
  "injectOnCompact": "slim",          // After compaction: "slim" (one-line pointer, default) | "off" | "full"
  "preCompactAnchor": false,          // Inject memory anchor + dialectic before compaction (default: false)
```

Also add `HONCHO_INJECT_ON_COMPACT` to the env-var list if the README has one (search for `HONCHO_SAVE_MESSAGES` to find it; skip if absent).

- [ ] **Step 4: Commit**

```bash
git add plugins/honcho/skills/config/SKILL.md README.md
git commit -m "docs: document injectOnCompact + preCompactAnchor (config skill + README)"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full automated pass**

```bash
cd /home/rafa/repos/claude-honcho/plugins/honcho
bunx tsc --noEmit && bun test
```

Expected: zero type errors, all tests pass.

- [ ] **Step 2: Manual verification (spec §Testing) — requires a real Claude Code session**

1. Start a fresh Claude Code session in any project: confirm full injection on the first prompt (`[Honcho Memory for rafa]: Profile: ...`) and `~/.honcho/hooks.log` shows the normal session-start warm.
2. Run `/compact`. Confirm the logs show `Post-compact start: skipped context warm (injectOnCompact=slim)` and the first prompt after compaction injects only the one-line pointer (`Post-compact prompt: slim injection`).
3. Second prompt after compaction: normal cached injection resumes.
4. Trigger a second `/compact`: confirm context occupancy does not re-inflate from Honcho content (no loop), and PreCompact logs `Memory anchor skipped (preCompactAnchor=false)`.

- [ ] **Step 3: Report results before proceeding to the honcho-codex plan**

This is the dogfooding gate from the spec's rollout section. Do not open upstream PRs yet.
