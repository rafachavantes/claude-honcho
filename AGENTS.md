# AGENTS.md

Fork of `plastic-labs/claude-honcho` (remote `upstream`). This file is the project context;
`CLAUDE.md` is just `@AGENTS.md` and is gitignored — edit here.

Claude Code marketplace repo with two plugins: `plugins/honcho` (memory — hooks + MCP server,
TypeScript run directly by Bun, no build step) and `plugins/honcho-dev` (skills only, no code).

## Commands

```bash
cd plugins/honcho && bun install           # node_modules is no longer committed (upstream #116)
cd plugins/honcho && bun test              # full suite; must run from the plugin dir
bash plugins/honcho/scripts/publish-release-branch.sh   # ship it; then /plugin update
```

**Exit gate (keep green)** — from `plugins/honcho/`, and **wider than CI**: `ci.yml` runs
everything below *except* `bun test`, so the suite only ever gates locally and in
`publish-release-branch.sh`:
`bunx tsc --noEmit` · `bun test` · `bun run scripts/build.ts` · `bash scripts/smoke.sh .stage` ·
`claude plugin validate .stage --strict`. Two traps: `tsconfig.json` only includes `src/**`, so
`tsc` never checks `tests/` or `hooks/`; and `smoke.sh` runs every entry point with the plugin
**disabled**, so each hook returns before reading stdin — it cannot catch a bundled entry that
drops the hook payload (that was upstream PR #114).

Claude Code runs the cached copy under `~/.claude/plugins/cache/rafa-plugins/honcho/<version>`,
never this repo, so hook and MCP changes only go live after a `publish-release-branch.sh` release
followed by `/plugin update`. (`install-local.sh` is gone — upstream deleted it in #116, and it
wrote to `cache/honcho/honcho/`, a path Claude Code never reads for this install.)

## Gotchas

- **The plugin is distributed from the `release/honcho` branch, not from `plugins/honcho`.**
  `rafa-plugins/marketplace.json` points at `{source: url, url:
  https://github.com/rafachavantes/claude-honcho.git, ref: release/honcho}`. Use the **`url`**
  source, not `github`: `github` clones over SSH, which dies with `No ED25519 host key is known`
  on any machine without github.com in `known_hosts`. `url` takes the https endpoint explicitly. That branch holds the built bundle — `scripts/build.ts` output, which
  inlines every dependency — so it runs on plain `node` with no `node_modules`. Publish a release
  with `bash plugins/honcho/scripts/publish-release-branch.sh` (build + smoke + validate, then a
  force push that rewrites the branch). **Nothing reaches the user until that script runs**, no
  matter what is on `main`.
- **`plugins/honcho/node_modules/` is no longer committed** (upstream #116). Run `bun install`
  after cloning. Nothing that ships depends on it: the release bundle inlines every dependency.
  If you see a huge node_modules diff, you are on a pre-rebase commit.
- **A release bumps the version in two files** (`plugins/honcho/package.json` and
  `plugins/honcho/.claude-plugin/plugin.json`), plus `.claude-plugin/marketplace.json` when the
  release is user-visible. **The version is upstream's released version plus a 4th segment for the
  fork revision** — `0.3.1.1` means "upstream 0.3.1 plus fork revision 1". Read the base off
  upstream's npm dist-tag (`npm view @honcho-ai/claude-honcho version`), not off their
  `package.json`, which carries a stale dev fallback (releases stamp the version at build time and
  commit nothing). The 4th segment sorts above their 3-segment release, which is honest whenever
  the fork sits on commits they have not released yet. Two consequences:
  `.github/workflows/release.yml` **rejects** a 4-segment version (its semver regex allows three),
  which is why releases go through `publish-release-branch.sh` instead of the workflow; and
  `scripts/check-version.sh` — which runs on every `SessionStart` — compares the local version
  against **upstream's npm dist-tag**, not against the fork's channel. It is live (upstream #116
  repointed it at the registry), so once upstream releases 0.3.2 it will announce an update that
  the fork's `release/honcho` branch does not have. Either repoint it or accept the false positive.
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
  map to one Honcho session. The resolution lives in `src/config.ts` (`sessionRootFor`,
  `getSessionName`) — `src/git.ts` holds branch/commit capture, not session identity.

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
