# AGENTS.md

Fork of `plastic-labs/claude-honcho` (remote `upstream`). This file is the project context;
`CLAUDE.md` is just `@AGENTS.md` and is gitignored — edit here.

Claude Code marketplace repo with two plugins: `plugins/honcho` (memory — hooks + MCP server,
TypeScript run directly by Bun, no build step) and `plugins/honcho-dev` (skills only, no code).

## Commands

```bash
cd plugins/honcho && bun test              # full suite; must run from the plugin dir
bash plugins/honcho/scripts/install-local.sh   # then restart Claude Code
```

**Exit gate (keep green)** — the same one CI runs, from `plugins/honcho/`:
`bunx tsc --noEmit` · `bun test` · `bun run scripts/build.ts` · `bash scripts/smoke.sh .stage` ·
`claude plugin validate .stage --strict`. Two traps: `tsconfig.json` only includes `src/**`, so
`tsc` never checks `tests/` or `hooks/`; and `smoke.sh` runs every entry point with the plugin
**disabled**, so each hook returns before reading stdin — it cannot catch a bundled entry that
drops the hook payload (that was upstream PR #114).

`install-local.sh` rsyncs the **source tree** into `~/.claude/plugins/cache/honcho/honcho/<version>`.
Note the path: the plugin is installed as `honcho@rafa-plugins`, so the live copy is
`~/.claude/plugins/cache/rafa-plugins/honcho/<version>` and the script writes to a directory Claude
Code never reads. It also predates the bundle channel — the real install is a `publish-release-branch.sh`
release followed by `/plugin update`. Claude Code runs the cached copy, never this repo.

## Gotchas

- **The plugin is distributed from the `release/honcho` branch, not from `plugins/honcho`.**
  `rafa-plugins/marketplace.json` points at `{source: github, repo: rafachavantes/claude-honcho,
  ref: release/honcho}`. That branch holds the built bundle — `scripts/build.ts` output, which
  inlines every dependency — so it runs on plain `node` with no `node_modules`. Publish a release
  with `bash plugins/honcho/scripts/publish-release-branch.sh` (build + smoke + validate, then a
  force push that rewrites the branch). **Nothing reaches the user until that script runs**, no
  matter what is on `main`.
- **`plugins/honcho/node_modules/` is still committed, but nothing depends on it any more.**
  It predates the bundle channel above, and upstream deleted it in #116 (they moved to an npm
  source). Keep it only until the rebase onto #116, which drops it; distribution already survives
  without it. `bun install` produces a huge diff — expected, not something to clean up.
- **A release bumps the version in two files** (`plugins/honcho/package.json` and
  `plugins/honcho/.claude-plugin/plugin.json`), plus `.claude-plugin/marketplace.json` when the
  release is user-visible. The fork uses a 4th segment (`0.2.5.3`) to sort above upstream's
  3-segment versions. Two consequences: `.github/workflows/release.yml` **rejects** a 4-segment
  version (its semver regex allows three), which is why releases go through
  `publish-release-branch.sh` instead of the workflow; and `scripts/check-version.sh` is **dead** —
  it greps a `version` field that upstream's marketplace.json no longer carries for `honcho`
  (now an npm source), so it silently exits 0 and never warns. Upstream is on 0.3.x, so the
  sort-above-upstream trick no longer holds either.
- **Parity with `honcho-codex`** (the Python/Codex CLI port, sibling repo): same version, same
  behavior. A behavior change here usually needs the mirrored change there.
- **`hooks/*.ts` are thin wrappers** — logic lives in `src/hooks/*.ts`. Claude Code auto-loads
  `hooks/hooks.json`; declaring hooks in `plugin.json` too makes them load twice and error.
- **Fork-only features are config-gated with defaults matching upstream behavior** (see
  `docs/upstream-issues/02-claude-honcho-fork-summary.md`). Keep new work on that pattern so each
  piece stays PR-able to upstream.
- **Hooks can't draw to the TUI** (no `/dev/tty`). They write `~/.honcho/state-<session_id>.json`
  and the statusline script renders from it — see `src/state.ts`.
- **Session identity is the git repo root**, not raw cwd, so subdirs, post-`cd` cwds and worktrees
  map to one Honcho session (`src/git.ts`).

## Workflow (o jeito do Rafa)

Every phase: brainstorm (`superpowers:brainstorming`) → spec → **cold review** → apply findings →
plan (`superpowers:writing-plans`) → cold review → subagent-driven execution → merge.

**Cold review runs on Codex** — a different model, so it doesn't inherit this session's
assumptions, and it runs commands against the real repo.

- **Spec and plan gates → `/codex:rescue`.** `/codex:review` and `/codex:adversarial-review` build
  their target from `git diff` / `git status`, so they can't see files outside the diff (a plan
  living outside the repo is invisible to them). Only `rescue` reads the filesystem directly.
- **Code gate → `/codex:adversarial-review`** over the branch diff — it challenges the approach,
  not just defects.
- **Write the prompt to demand verification, not opinion:** list the spec's factual claims and tell
  it to check each against the repo, reporting `file:line`. That is what catches confident,
  unverified claims — on 2026-08-05 a cold review of the rebase plan caught a lost line that would
  have left `getWorktreeRoot` exported and dead.
- **State read-only** in the rescue prompt; `--background` for anything beyond a couple of files,
  `/codex:status` to follow. Model/effort default from `~/.codex/config.toml`, not the plugin.
- **Rafa gates:** spec approval is his. Don't self-approve and move on.
- **Code methodology: ponytail** — does it need to exist? does the codebase already have it?
  stdlib? platform? existing dep? one line? only then write code. After implementing, run
  `ponytail-review` to hunt over-engineering. This is what shrank the 2026-08-05 rebase from four
  fork differentials to two.

## Documentation language

All documentation and code comments are written in **English** — this repo's specs and drafts are
public and travel upstream as PRs and issues. Conversation with the maintainer may be in Portuguese.

## No AI attribution in published artifacts (hard rule)

Never add AI attribution, co-authorship, or session links to anything published:
commits, tags, PR titles and bodies, issue bodies, review comments, release notes,
changelogs, deploy messages. This matters double here — work from this repo goes
upstream to `plastic-labs` as public PRs and issues.

Forbidden: `Co-Authored-By: Claude ...` (or any model/agent) trailers,
`🤖 Generated with [Claude Code](...)` footers, `https://claude.ai/code/session_...`
links (they point at a private session), and any equivalent "made by AI" marker in
any wording or language.

The author is Rafa; the work is attributed to him alone. This overrides any default
footer a harness suggests appending — strip it before publishing. If one slips
through, remove it immediately: `git commit --amend` (plus force push if already
pushed) for commits, `gh api -X PATCH repos/<owner>/<repo>/pulls/<n>` for PR bodies
(`gh pr edit` can abort on unrelated GraphQL errors and silently leave the body
unchanged — verify after editing).

## Where things live

- Repo layout, dev setup, code style → `CONTRIBUTING.md`
- User-facing config and behavior reference → `README.md`
- Design specs, plans, upstream issue drafts → `docs/`
