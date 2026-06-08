import { test, expect } from "bun:test";
import { buildScopedContext } from "./context-builder.js";

function fakeHoncho(calls: any[]) {
  return {
    peer: async (id: string) => ({ context: async (o: any) => { calls.push({ kind: "peer.context", id, o }); return { representation: "GLOBAL", peerCard: ["card"] }; } }),
    session: async (name: string) => ({ context: async (o: any) => { calls.push({ kind: "session.context", name, o }); return { peerRepresentation: "SCOPED", peerCard: ["card"], summary: { content: "SUM" } }; } }),
  } as any;
}

test("global scope uses peer.context", async () => {
  const calls: any[] = [];
  const r = await buildScopedContext(fakeHoncho(calls), { contextScope: "global", peerName: "rafa", aiPeer: "assistant", observationMode: "directional" } as any, { sessionName: "s", searchQuery: "q", maxConclusions: 12 });
  expect(calls[0].kind).toBe("peer.context");
  expect(calls[0].id).toBe("assistant");
  expect(calls[0].o.target).toBe("rafa");
  expect(r.representation).toBe("GLOBAL");
  expect(r.summary).toBeNull();
});

test("session scope uses session.context with summary + perspective (directional)", async () => {
  const calls: any[] = [];
  const r = await buildScopedContext(fakeHoncho(calls), { contextScope: "session", peerName: "rafa", aiPeer: "assistant", observationMode: "directional" } as any, { sessionName: "s", searchQuery: "q", maxConclusions: 12 });
  expect(calls[0].kind).toBe("session.context");
  expect(calls[0].o.summary).toBe(true);
  expect(calls[0].o.peerTarget).toBe("rafa");
  expect(calls[0].o.peerPerspective).toBe("assistant");
  // Backend limit_to_session is a no-op for the semantic/most-derived branches,
  // so we never ask it to scope the representation and never surface conclusions.
  expect(calls[0].o.limitToSession).toBeUndefined();
  expect(calls[0].o.representationOptions).toBeUndefined();
  // representation is always dropped in session scope (backend cannot scope conclusions);
  // summary (session-scoped) + peerCard (global) are kept.
  expect(r.representation).toBeNull();
  expect(r.summary).toBe("SUM");
  expect(r.peerCard).toEqual(["card"]);
});

test("session scope drops representation even WITH a searchQuery (backend cannot scope it)", async () => {
  const calls: any[] = [];
  const r = await buildScopedContext(fakeHoncho(calls), { contextScope: "session", peerName: "rafa", aiPeer: "assistant", observationMode: "unified" } as any, { sessionName: "s", searchQuery: "anything", maxConclusions: 12 });
  expect(calls[0].o.representationOptions).toBeUndefined();
  expect(calls[0].o.limitToSession).toBeUndefined();
  expect(calls[0].o.peerPerspective).toBeUndefined(); // unified
  expect(r.representation).toBeNull();
  expect(r.summary).toBe("SUM");
  expect(r.peerCard).toEqual(["card"]);
});
