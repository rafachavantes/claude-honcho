# Handoff: Source-Aware Injection Work (from honcho-dcp brainstorm session)

**Date:** 2026-06-10. This note carries context from the brainstorming session held in the (now closed) `~/repos/honcho-dcp` directory into this repo, where implementation continues.

## Where things stand

- Brainstorming complete (superpowers flow). Design approved by Rafa and written to [2026-06-10-source-aware-injection-design.md](2026-06-10-source-aware-injection-design.md) — read that first; it has all technical detail, file references, and config decisions.
- Current branch: `feat/source-aware-injection` (this commit). No implementation code yet.
- Companion repo cloned at `~/repos/honcho-codex` (github rafachavantes/honcho-codex) — gets the same `injectOnCompact` treatment in `plugins/honcho-codex/scripts/honcho_codex_hook.py` + `config.py`.
- `~/repos/rafa-plugins` is only the marketplace catalog; its `honcho` entry points at this repo's `plugins/honcho` subdir. No changes needed there to ship.

## Decisions already made (don't re-litigate)

- Hooks-only approach. A true DCP pruning port (opencode-dynamic-context-pruning style) was evaluated and rejected: CC/Codex hooks cannot modify existing context; a BASE_URL proxy is too heavy. Phased proxy idea also dropped.
- Work happens in the two existing plugin repos, not a new shared-core repo.
- `injectOnCompact` default `slim`; `preCompactAnchor` default `false` (rely on the CLI's own compaction summary); `resume`/`clear` behavior unchanged (slim-on-resume is noted future work).
- Upstream PRs to plastic-labs after dogfooding, offering `full` as upstream default if maintainers prefer.

## Next steps

1. Rafa reviews the spec (was pending when the old session closed — confirm before coding).
2. Invoke `superpowers:writing-plans` to produce the implementation plan from the spec.
3. Implement claude-honcho side, then honcho-codex side; incremental commits on this branch (and a feature branch in honcho-codex).
4. Delete `~/repos/honcho-dcp` (exploratory repo, superseded; contains nothing but a CLAUDE.md).
5. Optional per Rafa's workflow: create Linear issues for the two repos' work.
