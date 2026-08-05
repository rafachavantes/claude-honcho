# DRAFT — GitHub issue for `plastic-labs/claude-honcho`

> Draft to review before posting to https://github.com/plastic-labs/claude-honcho/issues
> Target repo: **plastic-labs/claude-honcho** (the Claude Code plugin).
> Rewritten 2026-08-05 after rebasing the fork onto `ff5f5b7` (0.2.11 + 4 commits).
> Scope shrank from 4 items to 2, then grew back to 3 when measuring a real compaction
> surfaced the anchor cost — see "Histórico" at the bottom.

---

**Title:** What compaction costs, and session naming for subdirectories — three things I carry in a fork

**Labels:** enhancement

---

Hi! I run the plugin daily across several repos, on Claude Code and on a Codex CLI port sharing one workspace. I rebased my fork onto current `main` this week and, in doing so, most of what I'd been carrying either landed upstream or stopped being necessary. Two things survived the rebase; a third came out of measuring an actual compaction afterwards. I'd rather ask than dump PRs on you: **would any of these be welcome?**

All three are implemented, tested, and running here daily. Happy to open one focused PR per item.

## 1. SessionStart re-injects the full package right after a compaction

`SessionStart` fires with `source: "compact"` after the CLI compacts, but the hook doesn't look at `source` — so the full session-start package goes back in immediately after the CLI just freed the window. Right before that, `PreCompact` has already written its memory anchor into the summary being built, so a good part of it lands twice.

Measured on my own peer (`directives` + `summary` + `peerCard`, the current defaults):

| Component | Size |
|---|---|
| `directives` (with `rememberTool` on) | 1,484 chars |
| `peerCard` | 40 items, ~1,500 chars |
| long `summary` | ~4,900 chars |
| **total, re-injected on every compact** | **~7,900 chars ≈ 2,000 tokens** |

On long sessions this feeds a compact → re-inject → compact loop.

What I run:

- `injectOnCompact: "full" | "slim" | "off"` — **default `"full"`, i.e. today's upstream behavior**; env override `HONCHO_INJECT_ON_COMPACT`. Only compact-source starts are affected; startup/resume/clear are untouched.
- On a compact start in non-full mode, the hook sets a one-shot flag and returns before any fetch. The next `UserPromptSubmit` injects a single line (~110 chars: *"Honcho memory is active for this session; older details can be recalled via the honcho tools."*) instead of the per-turn package. The prompt after that is back to normal.
- The flag is keyed on the repo root and scoped to the instance id, so parallel sessions in one repo don't consume each other's downgrade.

Three small pieces: a pure policy module (`decideInjection(source, mode)`), the flag in `cache.ts`, and ~20 lines across the two hooks. Tests cover the policy, the flag's one-shot/instance semantics, and the two hook paths.

## 2. The `PreCompact` anchor is expensive, and most of it doesn't survive

Item 1 is about what goes back in *after* a compaction. This one is about what goes in *before* it — and I only found it by watching a real compaction once item 1 had silenced the noise around it.

`PreCompact` builds the memory anchor from four calls (`context`, `summaries`, and two `peer.chat` dialectics) and prints it with `MUST be preserved in the summary`. Measured on my peer, 2026-08-05:

| Component | Chars | Share |
|---|---:|---:|
| dialectic `peer.chat(user)` | 3,206 | 23% |
| dialectic `peer.chat(assistant)` | 2,814 | 20% |
| session summary | 3,633 | 26% |
| conclusions | 2,382 | 17% |
| `peerCard` | 1,618 | 11% |
| session identity | 99 | 1% |
| **total** | **14,122 ≈ 3,500 tokens** | |

Three things stood out:

- **The summarizer dropped most of it.** Despite the `PRESERVE` markers, the summary I got back carried none of the `peerCard` or the `IDENTITY:`/`ATTRIBUTE:` lines. The cost is paid on the way in; the content doesn't make it out. (n=1 — but a summarizer focused on the technical work has little reason to keep "prefers bullet points".)
- **The session summary is behind the conversation, so it competes with the host's own.** Mine listed as `Next Steps` two items that had been finished before I compacted. Marked `MUST be preserved`, that's stale state arguing with a fresher summary.
- **The conclusions aren't session-scoped.** `aiPeer.context()` is peer-global, so conclusions from a *different* repo's session landed in this session's anchor — same cross-project bleed that `injection.perTurn: []` avoids on the per-turn path.

The two dialectics are 43% of the payload and essentially all of the latency: the hook took 7s wall-clock, and `peer.chat` is the expensive call. On the Codex port sharing this workspace I also see `HTTP 429: Rate limit exceeded: 600 per 1 minute`, which two dialectics per compaction can only make worse.

Worth noting for anyone weighing this: the hook is **read-only**. It issues four reads, formats, prints, exits — messages are already persisted by `UserPromptSubmit`/`Stop`. Skipping it loses no memory, only the injection.

What I run: `preCompactAnchor: "full" | "off"` — **default `"full"`, i.e. today's upstream behavior**; env override `HONCHO_PRE_COMPACT_ANCHOR`. On `off` the hook logs and exits before constructing the client. Verified against a dead endpoint: `off` returns in 131ms with no network call, `full` still attempts the fetch. Two states rather than three deliberately — a `peerCard`-only middle ground is the one component worth keeping, and it's also the one the summarizer already discards.

## 3. `#107` covers worktrees, but not subdirectories of a regular checkout

`#107` was exactly the fix I'd been carrying for worktrees, so that half is now yours. The other half is still open: opening the CLI in a subdirectory of a plain repo still mints a session named after the subdirectory.

`resolveWorktreeMainRoot` returns `null` for a regular repository by contract (`if (!statSync(gitPath).isFile()) return null`), and `tests/config-helpers.test.ts` locks that in — correctly, given what the function is for. Verified against your current `main`:

```
repo                → null
repo/packages/api   → null          ← this one
wt                  → <repo root>
wt/deep             → <repo root>
```

Concretely: working from `~/repos/my-project/docs` gets its own Honcho session, separate from `~/repos/my-project`. My config had accumulated several of those (`rafa-docs`, `rafa-code`, …), each holding a slice of the same project's memory.

What I run: `worktreeMainRootFor`'s walk-up is extracted into a small helper, and a sibling `sessionRootFor` reuses it — `resolveWorktreeMainRoot(dir) ?? dir`, so a worktree still resolves to the main repo and a plain checkout resolves to its own root. `getSessionName` calls that instead. `worktreeMainRootFor` keeps its exact current behavior and your test stays green — that was a constraint, not an accident.

One adjacent fix rides along: in the `git-branch` strategy, `captureGitState(cwd)` gates on `isGitRepo()`, which is a bare `.git` `existsSync` and is false in any subdirectory — so the branch suffix silently disappears when you start from one. Passing the directory that actually holds `.git` fixes it.

## What I'm *not* bringing

- **Write-path work** (detached/queued uploads) — `#73` and `#88` covered it; my version is gone.
- **`captureToolCalls`** — the `session-end` transcript parsing it hung off no longer exists.
- **`contextScope: session`** — this was to avoid cross-project conclusions bleeding into a session. It relied on `limit_to_session`, which `#881` fixed on your backend in July; once that reaches the cloud, the plugin can just pass `limitToSession` and the flag stops being useful. Until then `injection.perTurn: []` already handles it with no code.
- **Duplicate-hooks manifest fix** — already upstream.

Separately, I opened #114 for a bundling bug found while rebasing (the bundled `session-start` loses the hook payload); it's independent of everything above.

---

If either item is interesting, say which and I'll open focused PRs against `main` — no version bumps, no fork-local noise. If they don't fit the plugin's direction, no hard feelings.

Thanks for Honcho — the memory model is a good thing to build on.

---

### Notas para o Rafa (não incluir ao postar)

- **Reescrita completa em 2026-08-05.** A versão anterior oferecia 4 blocos; três morreram: `writeMode`/fila (upstream `#73`/`#88`), `captureToolCalls` (o `session-end.ts` sumiu), `contextScope` (backend corrigido em `#881`, ver draft 01 marcado como obsoleto). A metade de worktree do item de identidade de sessão virou o `#107` deles.
- **Item 2 é posterior ao rebase**, escrito no mesmo dia depois da primeira compactação real com o `injectOnCompact: slim` ligado. A ordem importa: só dava para enxergar o custo do anchor depois que o `SessionStart` parou de injetar por cima. Vale como argumento na issue — não é teoria, é o que apareceu ao medir.
- **Commits citáveis** (branch `rebase/0.2.11`, worktree `~/repos/claude-honcho-rebase`, ainda não publicado): `9881faf` subdiretórios, `73eb725` política, `f75a777` flag, `f335969` hooks. Se for postar, decida antes se quer publicar o branch para poder linkar os SHAs — hoje eles não são públicos.
- **Números dos itens 1 e 2** foram medidos no seu peer real em 2026-08-05, não estimados.
- **O item 2 tem um flanco que eles podem atacar:** ao desligar o anchor, o `peerCard` deixa de existir na janela pós-compactação (o `SessionStart` já está em `slim`). A resposta honesta é que ele hoje já não sobrevive ao sumarizador, e que as tools MCP são a via de recall — mas se o mantenedor discordar, o meio-termo `peerCard`-only é a concessão natural.
- Ordem sugerida: deixar o `#114` responder primeiro. Se houver receptividade, esta vai em seguida; a `03` (Codex) é anúncio e não tem pressa.
