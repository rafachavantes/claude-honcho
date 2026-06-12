# DRAFT — GitHub issue for `plastic-labs/claude-honcho`

> Draft to review before posting to https://github.com/plastic-labs/claude-honcho/issues
> Target repo: **plastic-labs/claude-honcho** (the Claude Code plugin).

---

**Title:** Field report from daily use: 2 bug fixes + 2 feature sets built in a fork — interested in PRs?

**Labels:** enhancement

---

Hi! I've been running the Honcho plugin daily across several projects and CLIs (Claude Code + a Codex CLI port, single shared workspace). Along the way I hit a few bugs and missing pieces, and ended up building fixes and features in a fork: https://github.com/rafachavantes/claude-honcho

Everything below is **config-gated with defaults matching current upstream behavior** (except the two plain bug fixes), covered by `bun test` suites, and dogfooded daily. Rather than dropping one giant PR on you, I'd like to ask first: **which of these (if any) would you take as PRs?** I'm happy to open one focused PR per item, rebased onto your `main`.

## 1. Bug fix: duplicate-hooks load error from `manifest.hooks`

Recent Claude Code versions auto-load `hooks/hooks.json`; also declaring it in the plugin manifest makes the hooks load twice and errors. One-line fix.

- Fork commit: `853d4b6`

## 2. Bug fix: session identity derived from raw cwd splits one repo across sessions

`getSessionName` uses `basename(cwd)`, but hooks receive whatever directory the host CLI happens to pass (launch dir, post-`cd` cwd, a subdirectory, or a git worktree). Result: a single repo's memory gets split across multiple Honcho sessions — e.g. working from `repo/plugins/foo` creates a different session than launching at `repo/`, and every git worktree (per-branch checkout) becomes its own session.

Fix: resolve any path inside a repo to the **main worktree root** (`git rev-parse --show-toplevel` + `--git-common-dir`), falling back to raw cwd outside git. Worktree-aware: branch checkouts of one repo map to the same session, while the `git-branch` session strategy still reads HEAD from the current worktree.

- Fork commit: `8133a48` (includes tests for subdir / worktree / worktree-subdir / non-git)

## 3. Feature: source-aware injection — fixes the post-compaction re-injection loop

After context compaction, Claude Code fires `SessionStart` with `source: "compact"`. The plugin re-warms and re-injects the full memory context right after the CLI generated its own compaction summary — inflating the fresh context and, on long sessions, feeding a compact → re-inject → compact loop.

Changes:
- `injectOnCompact: "full" | "slim" | "off"` (default **slim**; env override `HONCHO_INJECT_ON_COMPACT`). Only compact-source starts are downgraded; startup/resume/clear keep full injection.
- On a compact start with non-full mode, the hook skips the context warm and sets a one-shot flag; the next `UserPromptSubmit` injects a single-line pointer (~110 chars: "Honcho memory is active…") instead of the full profile. The prompt after that returns to normal injection.
- `preCompactAnchor: boolean` (default **false**): gates the PreCompact memory-anchor + dialectic calls, which were both costly and a second inflation vector.
- `get_config`/`set_config` MCP support + skill docs for both settings.

- Fork commits: `6d472dd`..`1f4e884` (policy module, config, hooks, tests, docs)
- Validated live: post-compact prompt receives only the slim pointer; full profile returns on the following prompt.

## 4. Feature set: scoped context + detached writes

Three opt-in config fields, all defaulting to current upstream behavior:

- `contextScope: "global" | "session"` — upstream injects the peer-level (workspace-wide) representation, which leaks other projects' conclusions into unrelated sessions. `session` scope injects session summary + peer card instead. (Related: session-scoped conclusions are currently blocked by a backend bug in `limit_to_session` — reported separately in plastic-labs/honcho issue: <link after posting issue 01>.)
- `writeMode: "inline" | "detached" | "deferred"` — moves message uploads off the hook's critical path into a locked, chunked queue drain (lockfile with stale-break, per-message ids, mark-by-id).
- `captureToolCalls: boolean` — option to skip uploading tool-call payloads to Honcho while keeping local context.

- Fork commits: `289ac57`..`c7c4789` (merge), plus follow-up fixes `04ba42a`, `5369136`, `00da4a1`, `ac2f5ba`

---

If any of these are interesting, tell me which and I'll open separate PRs (no version bumps, no fork-local noise). If some don't fit the plugin's direction, no hard feelings — they'll keep living in the fork.

Thanks for Honcho — the memory model is great to build on.
