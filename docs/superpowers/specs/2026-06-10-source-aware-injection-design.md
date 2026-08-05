# Source-Aware Memory Injection (Compact-Loop Fix)

**Date:** 2026-06-10
**Repos affected:**
- `rafachavantes/claude-honcho` → `plugins/honcho` (Claude Code plugin, distributed via the `rafa-plugins` marketplace)
- `rafachavantes/honcho-codex` → `plugins/honcho-codex` (Codex CLI plugin)

## Problem

Both host CLIs fire a `SessionStart` hook after context compaction (Claude Code with `source: "compact"`; Codex matches the same event via the `startup|resume|clear|compact` matcher). Neither Honcho plugin distinguishes a post-compact start from a cold start, so each compaction triggers a full memory re-injection (peer card + session summary + context). The host's own compact summary already preserves recent context, so the re-injection is redundant — it refills the context window, accelerates the next compaction, and creates a compact → re-inject → compact loop that progressively shortens working context.

Verified in code:

- **honcho-codex** (`plugins/honcho-codex/scripts/honcho_codex_hook.py`, `SessionStart` branch around lines 148–157): always calls `session_context()` + `peer_card()` and injects via `additionalContext`, never reading `payload["source"]`. Direct loop.
- **claude-honcho** (`plugins/honcho/src/hooks/session-start.ts`): declares `source` in `HookInput` (line 25) but never branches on it. SessionStart warms the context cache and fires dialectic queries; the next `UserPromptSubmit` (`src/hooks/user-prompt.ts`) injects the full cached package. Indirect loop.

## Decision

Make injection **source-aware**, gated by config so the change is small and upstream-PR-friendly. After a compaction, inject at most a slim pointer; rely entirely on the host CLI's compaction summary for continuity. No pruning proxy, no shared-core library — the shared policy is one enum and a branch per plugin. (A "true DCP" request-rewriting proxy was evaluated and rejected for now: Claude Code/Codex hooks cannot modify existing context, and a `BASE_URL` proxy is a heavy separate project.)

## Config

One new setting with identical semantics in both plugins:

`injectOnCompact: "full" | "slim" | "off"` — default **`"slim"`**

- `full` — today's behavior (escape hatch; also the conservative default to offer upstream if maintainers prefer no behavior change).
- `slim` — inject only a short pointer (≤ ~1 sentence): `Honcho memory is active for this session; older details can be recalled via the honcho tools.`
- `off` — inject nothing after compaction.

Placement follows each plugin's existing conventions:

- **claude-honcho:** host-block field in `~/.honcho/config.json` (`hosts.<host>.injectOnCompact`), resolved in `plugins/honcho/src/config.ts` alongside fields like `sessionStrategy` / `captureToolCalls`. Env override: `HONCHO_INJECT_ON_COMPACT`.
- **honcho-codex:** camelCase file key `injectOnCompact` in its config file + env override `HONCHO_INJECT_ON_COMPACT`, added to `HonchoCodexConfig` in `plugins/honcho-codex/scripts/honcho_codex/config.py` (same pattern as `injectUserPromptContext`).

Additionally, **claude-honcho only**: `preCompactAnchor: boolean` — default **`false`**. Gates the existing "HONCHO MEMORY ANCHOR" injection and its two dialectic queries in `src/hooks/pre-compact.ts`. Default off: we rely on the CLI's own compaction summary.

## Changes — claude-honcho (`plugins/honcho`)

1. **`src/hooks/session-start.ts`**
   - Read `hookInput.source`. When `source === "compact"` and `injectOnCompact !== "full"`:
     - Skip the expensive context-cache warm and the fire-and-forget dialectic queries.
     - Persist a `postCompact` flag in the context cache (`src/cache.ts`, per cwd + instance id, same storage as the existing context cache).
   - All other sources (`startup`, `resume`, `clear`): unchanged.
2. **`src/hooks/user-prompt.ts`**
   - If the `postCompact` flag is set: instead of the full cached context package, inject per config — `slim` → the one-line pointer; `off` → nothing. Clear the flag either way.
   - Subsequent prompts resume the normal TTL/message-threshold refresh cadence.
3. **`src/hooks/pre-compact.ts`**
   - Wrap the memory-anchor build + 2 dialectic `peer.chat` calls in `if (preCompactAnchor)`. With the default `false`, the hook becomes a near no-op (message persistence in this plugin happens inline in other hooks, not here — verified: `pre-compact.ts` contains no flush/addMessages logic).
   - PreCompact must never block compaction (existing graceful-degrade behavior preserved).
4. **`src/cache.ts`** — add `setPostCompactFlag(cwd, instanceId)` / `consumePostCompactFlag(cwd, instanceId)` helpers.
5. **`src/config.ts`** — add `injectOnCompact` and `preCompactAnchor` to the host block types, resolution chain (env > host block > root > default), and the config skill/MCP `set_config` validation list (non-dangerous fields).

## Changes — honcho-codex (`plugins/honcho-codex`)

1. **`scripts/honcho_codex_hook.py`**, `SessionStart` branch:
   - Read `payload.get("source")`. When `source == "compact"`:
     - `slim` (default) → skip `session_context()` + `peer_card()` REST calls entirely; inject only the pointer line via the existing `_inject_context` JSON shape.
     - `off` → inject nothing (plain exit 0).
     - `full` → current behavior.
   - The unconditional `_flush_queue(client)` at the top of `main()` stays — queue persistence must run on every event, including post-compact starts.
2. **`scripts/honcho_codex/config.py`** — add `inject_on_compact` to `HonchoCodexConfig` (file key `injectOnCompact`, env `HONCHO_INJECT_ON_COMPACT`, default `"slim"`, validated against the three allowed values).
3. **`hooks/hooks.json`** — matcher stays `startup|resume|clear|compact` (the hook must still run on compact, both to flush the queue and to emit the slim pointer).
4. **PreCompact branch** — unchanged (already flush-only, returns `continue: true`).

## Out of Scope (explicit)

- No pruning/rewriting of existing conversation context (impossible via hooks; proxy approach deferred indefinitely).
- `resume` and `clear` sources keep current full-injection behavior. Future improvement (not built now): `slim` on `resume`, since resumed transcripts already contain earlier injections.
- No changes to message-saving, dedup, observation modes, or session naming.
- The exploratory `honcho-dcp` repo is closed; this spec supersedes it.

## Testing

- **Policy unit tests** — pure function `decideInjection(source, config) → "full" | "slim" | "off"` in each repo:
  - claude-honcho: Bun test alongside existing patterns in `plugins/honcho`.
  - honcho-codex: pytest in `plugins/honcho-codex/tests/` (suite already covers config/state/hook output — add `test_inject_on_compact.py` covering source × config matrix and that `SessionStart(compact)` performs no `session_context`/`peer_card` REST calls in slim/off modes).
- **Manual verification, per CLI:**
  1. Start a session, confirm full injection on `startup`.
  2. Run `/compact`, confirm hook logs (`~/.honcho/` logs for Claude Code, `~/.honcho/codex/logs.jsonl` for Codex) show slim/no injection and that the queue flushed.
  3. Trigger consecutive compactions; confirm context occupancy does not re-inflate from Honcho content (no loop).

## Rollout / Upstream

1. Implement on a feature branch in each repo; incremental commits.
2. Dogfood locally (marketplace update for `rafa-plugins`/honcho; reinstall for honcho-codex).
3. After it proves out, open upstream PRs (plastic-labs) presenting `injectOnCompact` as config-gated; offer `full` as default upstream if maintainers prefer zero behavior change, while the fork defaults to `slim`.
