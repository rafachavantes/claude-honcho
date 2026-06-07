import { test, expect, beforeEach } from "bun:test";
import { drainQueue } from "./flush.js";
import { queueMessage, getQueuedMessages, clearMessageQueue } from "./cache.js";

beforeEach(() => clearMessageQueue());

test("drainQueue uploads all queued for cwd then removes them", async () => {
  queueMessage("u1", "rafa", "/cwd", "inst", { type: "user_prompt" });
  queueMessage("a1", "assistant", "/cwd", "inst", { type: "assistant_response" });
  const uploaded: any[] = [];
  await drainQueue({ cwd: "/cwd", upload: async (msgs) => { uploaded.push(...msgs); } });
  expect(uploaded.length).toBe(2);
  expect(getQueuedMessages("/cwd").length).toBe(0);
});

test("drainQueue keeps messages if upload throws", async () => {
  queueMessage("u1", "rafa", "/cwd");
  await drainQueue({ cwd: "/cwd", upload: async () => { throw new Error("net"); } }).catch(() => {});
  expect(getQueuedMessages("/cwd").length).toBe(1);
});

test("drainQueue no-ops on empty queue", async () => {
  let called = false;
  await drainQueue({ cwd: "/empty", upload: async () => { called = true; } });
  expect(called).toBe(false);
});
