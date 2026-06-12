# DRAFT — GitHub issue for `plastic-labs/honcho`

> Draft to review before posting to https://github.com/plastic-labs/honcho/issues
> Target repo: **plastic-labs/honcho** (the backend / main repo) — announcement / community contribution offer, not a bug.
> Alternative venue if they prefer: GitHub Discussions on the same repo, or plastic-labs/claude-honcho.

---

**Title:** Community project: Honcho memory plugin for OpenAI Codex CLI (honcho-codex)

---

Hi! I use Honcho as shared memory across coding CLIs, and since there was a plugin for Claude Code but nothing for OpenAI Codex, I built one: https://github.com/rafachavantes/honcho-codex

It's the Codex counterpart to `claude-honcho` — same memory model (one user peer, per-repo sessions, single workspace), so identity and project context stay consistent when switching between tools.

## How it works

Four Codex lifecycle hooks (`hooks/hooks.json`), all running one Python script:

| Hook | Behavior |
|------|----------|
| `SessionStart` | Injects session summary (project-scoped) + peer card (global identity); flushes queued writes. Source-aware: after a compaction it injects a one-line pointer instead of the full context (configurable `injectOnCompact: full\|slim\|off`, default slim) to avoid the compact → re-inject inflation loop. |
| `UserPromptSubmit` | Saves the prompt to Honcho (optional context injection, off by default). |
| `Stop` | Saves the assistant's final response. |
| `PreCompact` | Flushes the local write queue. |

Design notes:
- **Zero runtime dependencies** — talks to the Honcho v3 REST API via stdlib `urllib` on the bare `python3` Codex invokes. No SDK, no venv; the `honcho` CLI is only used by the setup/status skill.
- **Lazy ensure + disk cache** for workspace/peer/session (24h TTL), local **write queue with dedup** (`queue.jsonl` + state file) so transient failures retry instead of losing or duplicating writes, and self-healing on server-side session deletion (404 → evict cache → recreate → retry once).
- **Sessions are keyed by git repo root** (worktree-aware), not raw cwd, so subdirectories and per-branch worktrees of one repo share a session.
- Tool calls intentionally not captured (MVP scope). Tests via pytest (57 passing). MIT.

## Why I'm posting

Mostly a heads-up that this exists for anyone wanting Honcho memory in Codex. But if you'd like it under the plastic-labs umbrella — as an official plugin, a transfer, or upstreamed however fits — I'm open to that and happy to adapt it to your conventions. If you'd rather keep it community-side, that's fine too.
