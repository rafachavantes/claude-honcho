# DRAFT — Pull request for `plastic-labs/claude-honcho`

> Draft to review before opening at https://github.com/plastic-labs/claude-honcho/pulls
> Target repo: **plastic-labs/claude-honcho** (the Claude Code plugin).
> Branch ready locally: `fix/bundled-hook-payload` (worktree `~/repos/claude-honcho-upstream-fix`), 1 commit on top of `ff5f5b7`, 2 files changed.
> Found on 2026-08-05 while rebasing a fork onto `upstream/main`. Verified against **pristine upstream**, not the fork.

---

## Title

`fix: keep the hook payload across the bundled entry point hop`

## Body

### What happens

In the bundled plugin (`.stage/` — what the npm package ships since #92), `dist/hooks/session-start.js` never sees the hook payload. `cwd` falls back to `process.cwd()`, and `session_id`, `source` and `workspace_roots` arrive `undefined`.

Running from source is unaffected, so this only reaches users installing the npm package.

### Why

`Bun.build({ splitting: true })` can instantiate a module more than once across entry points. Today it inlines a private copy of `config.js` into `dist/hooks/session-start.js`, while the other seven hooks share a chunk:

```
$ grep -c "var _stdinText = null" .stage/dist/hooks/*.js
session-start.js:1      <- own copy
post-tool-use.js:0      pre-compact.js:0       pre-tool-honcho.js:0
save-user-message.js:0  session-end.js:0       stop.js:0         user-prompt.js:0
```

The entry point does:

```ts
await initHook();            // reads stdin, cacheStdin(text)
await handleSessionStart();  // getCachedStdin() ?? await readStdinText()
```

With two copies of the module, `initHook()` writes `_stdinText` in one and the handler reads `null` from the other. It then falls back to `readStdinText()` — but stdin was already drained by `initHook()`, so it gets `""` and proceeds with `hookInput = {}`.

The bug is a property of the module-state assumption, not of `session-start` specifically: any entry the bundler decides to inline next inherits it.

### Reproducing on a clean checkout

```bash
cd plugins/honcho
bun install && bun run scripts/build.ts

HOME=$(mktemp -d); mkdir -p "$HOME/.honcho"
echo '{"apiKey":"x","peerName":"rafa","workspace":"w","baseUrl":"http://127.0.0.1:1"}' > "$HOME/.honcho/config.json"

echo '{"session_id":"probe","cwd":"/some/other/project","hook_event_name":"SessionStart","source":"startup"}' \
  | node .stage/dist/hooks/session-start.js
```

The spinner names the session after the **current** directory rather than `/some/other/project`, and `~/.honcho/cache.json` never records `probe`. The same payload through `bun run hooks/session-start.ts` behaves correctly.

### Why CI misses it

`smoke.sh` runs every entry point with `{"enabled":false}`, and each hook returns at the `isPluginEnabled()` check — before the handler reads stdin. The bundled entry passes those cases whether or not the payload survives.

### The fix

Key the stdin cache on `globalThis` (`Symbol.for("honcho.hookStdinText")`) so every copy of the module observes the same value. Process-wide state is also what the cache means: the stdin of this process, read once.

Alternatives considered:

- **`splitting: false`** — removes today's duplication but inflates every entry and doesn't stop the module-state assumption from breaking again if bundling changes.
- **Passing the text down** (`handleSessionStart(stdinText)`) — explicit and arguably cleanest, but it touches all 8 handlers plus their wrappers. Happy to switch to this if you prefer it; the fix is mechanical either way.

### Test

`smoke.sh` gains one case: plugin **enabled** and pointed at a closed port, so the handler runs its pre-network work (which records `session_id`) and then fails fast on connect. It asserts the payload's `session_id` reached the cache.

Verified on pristine `ff5f5b7`: the new case **fails** before the fix and **passes** after. `bunx tsc --noEmit` clean, `bun test` 20/20, `claude plugin validate` unaffected.

---

## Notes for Rafa (not part of the PR body)

- This is a **PR**, not an issue — the branch is ready. It's independent of drafts 01–03: pristine upstream, nothing from the fork.
- Sequencing per the strategy already agreed: issue `01` (backend `limit_to_session`) goes first to open the conversation. This one can follow immediately after, or go first if you'd rather lead with a concrete fix — it's self-contained and cheap for them to review.
- If they'd rather have the explicit-parameter version (`handleSessionStart(stdinText)`), that's ~8 wrappers + 8 signatures; say the word and I'll write it.
