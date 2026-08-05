# Source-Aware Injection (honcho-codex) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the direct compact → re-inject loop in the Codex plugin: when `SessionStart` fires with `source: "compact"`, skip the `session_context()`/`peer_card()` REST calls and inject at most a one-line pointer, controlled by `injectOnCompact` config (default `slim`).

**Architecture:** Mirror of the claude-honcho change. A pure `decide_injection(source, mode)` policy in a new `honcho_codex/policy.py`; the `SessionStart` branch of `honcho_codex_hook.py` branches on it. Unlike Claude Code, Codex injection happens directly in SessionStart (no cache/flag indirection needed). The queue flush at the top of `main()` keeps running on every event, including post-compact starts.

**Tech Stack:** Python 3 (stdlib only), pytest. Test command (from `plugins/honcho-codex/`): `PYTHONPATH=scripts uv run --with pytest python -m pytest tests/ -q`

**Spec:** `/home/rafa/repos/claude-honcho/docs/superpowers/specs/2026-06-10-source-aware-injection-design.md` (lives in the claude-honcho repo)

**Working directory for all commands:** `/home/rafa/repos/honcho-codex/plugins/honcho-codex`
**Repo:** `/home/rafa/repos/honcho-codex` — currently on `main`. Task 0 creates the feature branch.

**Prerequisite:** Execute only after the claude-honcho plan is implemented (same policy semantics, and the dogfooding gate is shared).

---

### Task 0: Feature branch

- [ ] **Step 1: Create the branch**

```bash
cd /home/rafa/repos/honcho-codex
git checkout -b feat/source-aware-injection
```

---

### Task 1: Policy module

**Files:**
- Create: `scripts/honcho_codex/policy.py`
- Test: `tests/test_inject_on_compact.py` (new file; grows in Tasks 2–3)

- [ ] **Step 1: Write the failing tests**

Create `tests/test_inject_on_compact.py`:

```python
import pytest

from honcho_codex.policy import SLIM_POINTER, decide_injection


@pytest.mark.parametrize("source", ["startup", "resume", "clear", None])
def test_non_compact_sources_inject_full(source):
    for mode in ("full", "slim", "off"):
        assert decide_injection(source, mode) == "full"


def test_compact_source_follows_config():
    assert decide_injection("compact", "full") == "full"
    assert decide_injection("compact", "slim") == "slim"
    assert decide_injection("compact", "off") == "off"


def test_slim_pointer_is_one_short_line():
    assert "\n" not in SLIM_POINTER
    assert len(SLIM_POINTER) < 160
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=scripts uv run --with pytest python -m pytest tests/test_inject_on_compact.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'honcho_codex.policy'`

- [ ] **Step 3: Write the implementation**

Create `scripts/honcho_codex/policy.py`:

```python
from __future__ import annotations

SLIM_POINTER = (
    "Honcho memory is active for this session; "
    "older details can be recalled via the honcho tools."
)


def decide_injection(source: str | None, inject_on_compact: str) -> str:
    """Source-aware injection policy.

    Only a SessionStart fired by context compaction is downgraded -- the host
    CLI's own compaction summary already carries recent context. Every other
    source (startup, resume, clear, missing) keeps full injection.
    """
    if source != "compact":
        return "full"
    return inject_on_compact
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=scripts uv run --with pytest python -m pytest tests/test_inject_on_compact.py -q`
Expected: PASS (6 tests: 4 parametrized + 2)

- [ ] **Step 5: Commit**

```bash
git add scripts/honcho_codex/policy.py tests/test_inject_on_compact.py
git commit -m "feat: source-aware injection policy module"
```

---

### Task 2: `inject_on_compact` config field

**Files:**
- Modify: `scripts/honcho_codex/config.py`
- Test: `tests/test_inject_on_compact.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_inject_on_compact.py` (add `import json` and the `load_config` import at the top of the file):

```python
import json

from honcho_codex.config import load_config


def test_inject_on_compact_defaults_to_slim(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("HONCHO_INJECT_ON_COMPACT", raising=False)
    cfg = load_config()
    assert cfg.inject_on_compact == "slim"


def test_inject_on_compact_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("HONCHO_INJECT_ON_COMPACT", "off")
    cfg = load_config()
    assert cfg.inject_on_compact == "off"


def test_inject_on_compact_invalid_value_falls_back_to_slim(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("HONCHO_INJECT_ON_COMPACT", "bogus")
    cfg = load_config()
    assert cfg.inject_on_compact == "slim"


def test_inject_on_compact_file_key(monkeypatch, tmp_path):
    # CONFIG_PATH is resolved at import time, so patch the constant directly
    cfg_file = tmp_path / "config.json"
    cfg_file.write_text(json.dumps({"injectOnCompact": "full"}))
    monkeypatch.setattr("honcho_codex.config.CONFIG_PATH", cfg_file)
    monkeypatch.delenv("HONCHO_INJECT_ON_COMPACT", raising=False)
    cfg = load_config()
    assert cfg.inject_on_compact == "full"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=scripts uv run --with pytest python -m pytest tests/test_inject_on_compact.py -q`
Expected: FAIL — `TypeError` / `AttributeError`: `HonchoCodexConfig` has no `inject_on_compact`

- [ ] **Step 3: Implement in `scripts/honcho_codex/config.py`**

3a. Add a module-level constant and helper after `_bool_env` (~line 18):

```python
_INJECT_ON_COMPACT_VALUES = {"full", "slim", "off"}


def _inject_on_compact(file_cfg: dict) -> str:
    value = os.environ.get("HONCHO_INJECT_ON_COMPACT") or str(
        file_cfg.get("injectOnCompact", "slim")
    )
    value = value.lower()
    return value if value in _INJECT_ON_COMPACT_VALUES else "slim"
```

3b. Add the field to the `HonchoCodexConfig` dataclass (after `inject_user_prompt_context: bool`, line 46):

```python
    inject_on_compact: str
```

(Note: dataclass field order matters only for positional construction; the hook tests build it with keyword args, and `load_config` uses keywords.)

3c. In `load_config()`, add to the `HonchoCodexConfig(...)` call (after the `inject_user_prompt_context=` argument):

```python
        inject_on_compact=_inject_on_compact(file_cfg),
```

3d. In the `__main__` debug dump at the bottom, after `"injectUserPromptContext": cfg.inject_user_prompt_context,` add:

```python
                "injectOnCompact": cfg.inject_on_compact,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=scripts uv run --with pytest python -m pytest tests/ -q`
Expected: ALL tests pass (new ones + existing suite — existing tests construct configs via `load_config`, so the new field doesn't break them)

- [ ] **Step 5: Commit**

```bash
git add scripts/honcho_codex/config.py tests/test_inject_on_compact.py
git commit -m "feat: injectOnCompact config (file key + HONCHO_INJECT_ON_COMPACT, default slim)"
```

---

### Task 3: SessionStart branch in the hook

**Files:**
- Modify: `scripts/honcho_codex_hook.py`
- Test: `tests/test_inject_on_compact.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_inject_on_compact.py` (add the new imports at the top of the file):

```python
import io
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import honcho_codex_hook as hook
from honcho_codex.config import HonchoCodexConfig


def _config(**overrides):
    base = dict(
        api_key="test-key",
        base_url="https://api.honcho.dev",
        workspace="test",
        user_peer="rafa",
        assistant_peer="codex",
        session_strategy="per-directory",
        session_peer_prefix=True,
        save_user_messages=True,
        save_assistant_messages=True,
        save_tool_calls=False,
        inject_user_prompt_context=False,
        max_message_chars=12000,
        context_tokens=4000,
        inject_on_compact="slim",
    )
    base.update(overrides)
    return HonchoCodexConfig(**base)


class RecordingClient:
    def __init__(self):
        self.calls = []

    def session_context(self, *args, **kwargs):
        self.calls.append("session_context")
        return "ctx"

    def peer_card(self, *args, **kwargs):
        self.calls.append("peer_card")
        return ["card"]

    def add_message(self, *args, **kwargs):
        self.calls.append("add_message")


def _run_session_start(monkeypatch, capsys, source, mode):
    client = RecordingClient()
    flushes = []
    monkeypatch.setattr(hook, "load_config", lambda: _config(inject_on_compact=mode))
    monkeypatch.setattr(hook, "HonchoClient", lambda cfg: client)
    monkeypatch.setattr(hook, "_flush_queue", lambda c: flushes.append(True))
    monkeypatch.setattr(hook, "log_event", lambda e: None)
    payload = {"hook_event_name": "SessionStart", "cwd": "/tmp/x", "source": source}
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(payload)))
    rc = hook.main()
    assert rc == 0
    return client, flushes, capsys.readouterr().out


def test_compact_slim_skips_rest_and_injects_pointer(monkeypatch, capsys):
    client, flushes, out = _run_session_start(monkeypatch, capsys, "compact", "slim")
    assert client.calls == []  # no session_context / peer_card REST calls
    assert flushes == [True]  # queue flush still runs post-compact
    output = json.loads(out)
    assert SLIM_POINTER in output["hookSpecificOutput"]["additionalContext"]


def test_compact_off_skips_rest_and_injects_nothing(monkeypatch, capsys):
    client, flushes, out = _run_session_start(monkeypatch, capsys, "compact", "off")
    assert client.calls == []
    assert flushes == [True]
    assert out.strip() == ""


def test_compact_full_keeps_current_behavior(monkeypatch, capsys):
    client, _, out = _run_session_start(monkeypatch, capsys, "compact", "full")
    assert "session_context" in client.calls
    assert "peer_card" in client.calls
    assert "[Honcho Memory]" in out


def test_startup_source_unaffected_by_slim_mode(monkeypatch, capsys):
    client, _, out = _run_session_start(monkeypatch, capsys, "startup", "slim")
    assert "session_context" in client.calls
    assert "peer_card" in client.calls
    assert "[Honcho Memory]" in out


def test_missing_source_treated_as_full(monkeypatch, capsys):
    client, _, _ = _run_session_start(monkeypatch, capsys, None, "slim")
    assert "session_context" in client.calls
```

(`source: None` ends up in the payload as JSON `null`; `payload.get("source")` returns `None`, matching a host that omits the field.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=scripts uv run --with pytest python -m pytest tests/test_inject_on_compact.py -q`
Expected: the compact-slim/compact-off tests FAIL (REST calls still happen, no pointer); startup/full tests pass.

- [ ] **Step 3: Implement in `scripts/honcho_codex_hook.py`**

3a. Add the import after the existing `from honcho_codex.config import load_config` (line 10):

```python
from honcho_codex.policy import SLIM_POINTER, decide_injection
```

3b. Replace the `SessionStart` branch (lines 148–157) with:

```python
        if event_name == "SessionStart":
            mode = decide_injection(payload.get("source"), config.inject_on_compact)
            if mode != "full":
                # Post-compact start: the host's own compaction summary carries
                # recent context, so skip the session_context/peer_card REST
                # calls. The queue flush above already ran. slim -> one-line
                # pointer; off -> no output at all.
                if mode == "slim":
                    _json_out(
                        {
                            "hookSpecificOutput": {
                                "hookEventName": "SessionStart",
                                "additionalContext": "[Honcho Memory]\n" + SLIM_POINTER,
                            }
                        }
                    )
                log_event(
                    {"event": "SessionStart", "status": "post_compact", "mode": mode}
                )
                return 0
            context = client.session_context(session_name, config.context_tokens)
            card = client.peer_card()
            # Conclusions (representation) are intentionally NOT injected: the Honcho
            # backend's limit_to_session is a no-op for the semantic/most-derived branches,
            # so session-scoped conclusions leak cross-project. We inject the correctly-scoped
            # session summary + the global peerCard (identity), matching the Claude plugin.
            # See honcho-install/docs/honcho-upstream-issue-limit-to-session.md
            _inject_context("SessionStart", session_name, context, None, card)
            return 0
```

(The full-mode tail is byte-identical to today's code; only the `mode != "full"` block is new. `hooks/hooks.json` needs no change — its `startup|resume|clear|compact` matcher already fires on compact, which is required for the flush + pointer.)

- [ ] **Step 4: Run the full suite**

Run: `PYTHONPATH=scripts uv run --with pytest python -m pytest tests/ -q`
Expected: ALL tests pass (including the pre-existing `test_hook_output.py` / `test_hook_rest.py`)

- [ ] **Step 5: Commit**

```bash
git add scripts/honcho_codex_hook.py tests/test_inject_on_compact.py
git commit -m "feat: source-aware SessionStart — skip REST + slim pointer after compaction"
```

---

### Task 4: Documentation

**Files:**
- Modify: `/home/rafa/repos/honcho-codex/README.md`
- Modify: `skills/honcho-codex/SKILL.md`

- [ ] **Step 1: README config table**

In the config table (around line 70, after the `injectUserPromptContext` row), add:

```markdown
| `injectOnCompact` | `HONCHO_INJECT_ON_COMPACT` | `slim` | Injection after the CLI compacts context: `slim` injects a one-line pointer, `off` injects nothing, `full` re-injects the whole memory package (pre-fix behavior; can re-trigger compaction). |
```

Also add `"injectOnCompact": "slim",` to the example `config.json` block (~line 82, after `"injectUserPromptContext": false,`).

- [ ] **Step 2: Skill doc**

In `skills/honcho-codex/SKILL.md`, near the `injectUserPromptContext` example (~line 47), add a short subsection:

```markdown
To control memory injection after the CLI compacts context (default `slim` — a one-line pointer so the compaction summary isn't refilled):

```json
{
  "injectOnCompact": "slim"
}
```

Valid values: `full` (re-inject everything), `slim`, `off`.
```

- [ ] **Step 3: Commit**

```bash
git add /home/rafa/repos/honcho-codex/README.md skills/honcho-codex/SKILL.md
git commit -m "docs: document injectOnCompact"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full automated pass**

```bash
cd /home/rafa/repos/honcho-codex/plugins/honcho-codex
PYTHONPATH=scripts uv run --with pytest python -m pytest tests/ -q
```

Expected: all tests pass.

- [ ] **Step 2: Config sanity check (README's verify loop)**

```bash
cd /home/rafa/repos/honcho-codex/plugins/honcho-codex
PYTHONPATH=scripts python3 scripts/honcho_codex/config.py | grep injectOnCompact
HONCHO_INJECT_ON_COMPACT=off PYTHONPATH=scripts python3 scripts/honcho_codex/config.py | grep injectOnCompact
```

Expected: `"injectOnCompact": "slim"` then `"injectOnCompact": "off"`.

- [ ] **Step 3: Manual verification (spec §Testing) — requires a real Codex session**

1. Reinstall the plugin per the repo's install instructions, start a Codex session: confirm full `[Honcho Memory]` injection on startup.
2. Trigger compaction. Confirm `~/.honcho/codex/logs.jsonl` shows `{"event": "SessionStart", "status": "post_compact", "mode": "slim"}` and only the pointer line was injected; confirm queued messages flushed.
3. Trigger consecutive compactions; confirm context occupancy does not re-inflate from Honcho content (the loop is gone).

- [ ] **Step 4: Stop here**

Dogfood before upstream PRs (spec §Rollout). Do not push or open PRs without Rafa's go-ahead.
