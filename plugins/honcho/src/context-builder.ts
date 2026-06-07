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

  const ctx = await session.context({
    summary: opts.summary ?? true,
    peerTarget: config.peerName,
    ...(peerPerspective ? { peerPerspective } : {}),
    ...(searchQuery
      ? {
          limitToSession: true,
          representationOptions: {
            searchQuery,
            searchTopK: 5,
            searchMaxDistance: 0.7,
            maxConclusions,
            includeMostFrequent: true,
          },
        }
      : {}),
  });

  const rawSummary = ctx.summary;
  const summary =
    typeof rawSummary === "string"
      ? rawSummary
      : (rawSummary?.content ?? null);

  return {
    representation: ctx.peerRepresentation ?? null,
    peerCard: ctx.peerCard ?? null,
    summary,
  };
}
