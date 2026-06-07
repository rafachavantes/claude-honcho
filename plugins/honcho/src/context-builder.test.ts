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

test("session scope uses session.context with limitToSession + perspective", async () => {
  const calls: any[] = [];
  const r = await buildScopedContext(fakeHoncho(calls), { contextScope: "session", peerName: "rafa", aiPeer: "assistant", observationMode: "directional" } as any, { sessionName: "s", searchQuery: "q", maxConclusions: 12 });
  expect(calls[0].kind).toBe("session.context");
  expect(calls[0].o.limitToSession).toBe(true);
  expect(calls[0].o.peerTarget).toBe("rafa");
  expect(calls[0].o.peerPerspective).toBe("assistant");
  expect(calls[0].o.representationOptions.searchQuery).toBe("q");
  expect(r.representation).toBe("SCOPED");
  expect(r.summary).toBe("SUM");
});

test("session scope WITHOUT searchQuery omits representationOptions to avoid bleed", async () => {
  const calls: any[] = [];
  const r = await buildScopedContext(fakeHoncho(calls), { contextScope: "session", peerName: "rafa", aiPeer: "assistant", observationMode: "unified" } as any, { sessionName: "s", maxConclusions: 12 });
  expect(calls[0].o.representationOptions).toBeUndefined();
  expect(calls[0].o.limitToSession).toBeUndefined();
  expect(calls[0].o.peerPerspective).toBeUndefined();
  // Without searchQuery the representation cannot be scoped → must NOT be surfaced
  // (peerTarget alone returns the GLOBAL representation = cross-project bleed).
  // summary + peerCard are still returned.
  expect(r.representation).toBeNull();
  expect(r.summary).toBe("SUM");
  expect(r.peerCard).toEqual(["card"]);
});
