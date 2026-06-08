import type { Honcho } from "@honcho-ai/sdk";
import { getContextScope, getObservationMode, type HonchoCLAUDEConfig } from "./config.js";

export interface ScopedContext {
  representation: string | null;
  peerCard: string[] | null;
  summary: string | null;
}

export async function buildScopedContext(
  honcho: Honcho,
  config: HonchoCLAUDEConfig,
  opts: { sessionName: string; searchQuery?: string; maxConclusions?: number; summary?: boolean },
): Promise<ScopedContext> {
  const { searchQuery, maxConclusions = 12, sessionName } = opts;
  const scope = getContextScope(config);
  const observationMode = getObservationMode(config);

  if (scope === "global") {
    // Legacy path: use peer.context
    const isDirectional = observationMode === "directional";
    const peerId = isDirectional ? config.aiPeer : config.peerName;
    const target = isDirectional ? config.peerName : undefined;

    const peer = await honcho.peer(peerId);
    const ctx = await peer.context({
      ...(target ? { target } : {}),
      ...(searchQuery ? { searchQuery, searchTopK: 5, searchMaxDistance: 0.7 } : {}),
      maxConclusions,
      includeMostFrequent: true,
    });

    return {
      representation: ctx.representation ?? null,
      peerCard: ctx.peerCard ?? null,
      summary: null,
    };
  }

  // Scoped path: use session.context
  const session = await honcho.session(sessionName);
  const peerPerspective = observationMode === "unified" ? undefined : config.aiPeer;

  // Honcho BACKEND bug: `limit_to_session` does NOT scope the semantic / most-derived
  // branches of the representation — only the `recent` branch applies the session
  // filter (plastic-labs/honcho src/crud/representation.py). With a searchQuery the
  // representation is dominated by the (unfiltered) semantic branch, so limit_to_session
  // is effectively a no-op and cross-session conclusions leak. See
  // docs/honcho-upstream-issue-limit-to-session.md in the honcho-install workspace.
  //
  // Until the backend filters all branches, we deliberately DO NOT surface session
  // conclusions at all. What IS correctly scoped and safe to inject:
  //   - summary  → truly session-scoped (the session's own summary)
  //   - peerCard → person-level, global by design (identity, not project work)
  // When the backend is fixed, re-add `limitToSession: true` + `representationOptions`
  // ({ searchQuery, searchTopK, searchMaxDistance, maxConclusions, includeMostFrequent })
  // here and return `ctx.peerRepresentation`.
  const ctx = await session.context({
    summary: opts.summary ?? true,
    peerTarget: config.peerName,
    ...(peerPerspective ? { peerPerspective } : {}),
  });

  const rawSummary = ctx.summary;
  const summary =
    typeof rawSummary === "string"
      ? rawSummary
      : (rawSummary?.content ?? null);

  return {
    representation: null, // intentionally dropped — backend cannot scope conclusions (see note above)
    peerCard: ctx.peerCard ?? null,
    summary,
  };
}
