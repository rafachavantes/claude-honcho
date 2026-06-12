# DRAFT — GitHub issue for `plastic-labs/honcho`

> Draft to review before posting to https://github.com/plastic-labs/honcho/issues
> Target repo: **plastic-labs/honcho** (the backend), NOT claude-honcho (the plugin).
> Re-validated against upstream `main` on **2026-06-11**: `_query_documents_semantic` (def ~L370) still takes no `session_name`, `_query_documents_most_derived` (def ~L434) still has no `session_name` param, only `_query_documents_recent` (~L408, filter ~L421) applies it; `test_get_session_context_with_limit_to_session` (~L1336) still asserts only status 200 + key presence. Bug intact.

---

**Title:** `limit_to_session` does not scope the semantic/most-derived parts of `GET /sessions/{id}/context` — cross-session conclusions leak when `search_query` is set

**Labels:** bug

---

## Summary

`GET /v3/workspaces/{ws}/sessions/{session_id}/context` with `peer_target` + `search_query` + `limit_to_session=true` still returns conclusions that belong to **other sessions**. The docs state `limit_to_session` should *"limit the representation to this session only"* / *"only include conclusions from the current session"*, but in practice it only filters the **recent** observations branch — the **semantic** and **most-derived** branches ignore `session_name` entirely. Since `search_query` routes results primarily through the semantic branch, `limit_to_session` is effectively a no-op for the typical "scoped recall" use case.

## Environment

- Honcho Cloud (`api.honcho.dev`, v3 API). Reproduced via raw REST and via the TypeScript SDK `session.context({ limitToSession: true, representationOptions: { searchQuery } })`.
- Same observer/observed peer participating in multiple sessions within one workspace.

## Steps to reproduce

Given a peer `rafa` (observed) / `assistant` (observer) with conclusions across several sessions (e.g. a conclusion `"rafa analyzed 3 jobs in staging"` whose `session_id` is `session-A`), call the context endpoint **scoped to a different session** `session-B`:

```bash
# limit_to_session = TRUE, scoped to session-B, query that matches a session-A conclusion
curl -s "$URL/v3/workspaces/$WS/sessions/session-B/context?\
peer_target=rafa&peer_perspective=assistant&\
search_query=kill%20dev%20server%20jobs%20staging&limit_to_session=true&max_conclusions=6" \
  -H "Authorization: Bearer $KEY"

# limit_to_session = FALSE (same call)
curl -s "$URL/.../sessions/session-B/context?...&limit_to_session=false&..." -H "Authorization: Bearer $KEY"
```

**Result:** both responses are **identical**, and both include the `session-A` conclusion `"rafa analyzed 3 jobs in staging"` in `peer_representation`, even though the request was scoped to `session-B` with `limit_to_session=true`.

Confirming the conclusion truly belongs to another session:

```bash
curl -s -X POST "$URL/v3/workspaces/$WS/conclusions/query" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"query":"analyzed 3 jobs in staging","top_k":3}'
# → returns the conclusion with "session_id": "session-A"
```

## Expected vs actual

- **Expected:** with `limit_to_session=true` and `peer_target=rafa`, `peer_representation` contains only conclusions whose `session_id == session-B`.
- **Actual:** conclusions from any session are returned; `true` and `false` produce identical output when `search_query` is provided.

## Root cause (code)

In `src/crud/representation.py`, `_get_working_representation_internal` blends three sources, but only one applies the session filter:

- `_query_documents_semantic(...)` (≈ line 370) — used for `search_query`. **Signature has no `session_name`; the underlying `crud.query_documents(...)` is not session-filtered.**
- `_query_documents_most_derived(self, db, top_k)` (≈ line 434) — **no `session_name` parameter at all.**
- `_query_documents_recent(self, db, top_k, session_name=None)` (≈ line 408) — **the only one** that applies the filter:
  ```python
  *( [models.Document.session_name == session_name] if session_name is not None else [] )  # ≈ line 421
  ```

The router (`src/routers/sessions.py`) correctly forwards `session_name=session_id if limit_to_session else None` into `_get_working_representation_task` → `get_working_representation`, so the value reaches the CRUD layer — it's just dropped by the semantic and most-derived branches. Because a `search_query` allocates most of `max_observations` to the semantic branch, the session filter has little to no effect on the returned representation.

## Why the existing test doesn't catch it

`tests/routes/test_sessions.py::test_get_session_context_with_limit_to_session` only asserts `response.status_code == 200` and `"peer_representation" in data`. It never asserts that the returned conclusions actually belong to the scoped session, so a non-filtering implementation passes.

## Suggested fix

1. Thread `session_name` into the semantic and most-derived branches:
   - `_query_documents_semantic(...)` → forward `session_name` to `crud.query_documents(...)` and add `Document.session_name == session_name` to its `WHERE` when provided.
   - `_query_documents_most_derived(...)` → accept and apply `session_name` the same way `_query_documents_recent` does.
2. Strengthen the test: seed conclusions in two sessions, request context scoped to one with `limit_to_session=true` + a `search_query` that matches the *other* session's conclusion, and assert the foreign conclusion is **absent**.

## Impact

Any integration relying on `limit_to_session` for per-session isolation (e.g. coding-agent plugins that map one session per project/repo) leaks conclusions across projects whenever semantic recall is used. This is the "cross-project context bleed" several downstream plugins try to avoid.

---

### Internal notes (do not include when posting)

- Our local fix in the fork (`rafachavantes/claude-honcho`) currently drops the representation entirely when there's no `searchQuery` (so session-start warm cache no longer caches a global rep). That addresses the warm-cache vector but NOT this backend bug, which affects the `searchQuery` path.
- Decision (Rafa, 2026-06-08): NOT pursuing client-side `session_id` filtering as a workaround. So until this backend bug is fixed, the plugin's `contextScope:session` can rely on **summary (session-scoped, works correctly) + peerCard (global, by design)** and should treat session-scoped *conclusions* as unavailable.
- `conclusions.query` with `filters: { session_id }` was tested but returned empty in both filtered/unfiltered cases (likely needs observer/observed in filters) — inconclusive, not pursued.
