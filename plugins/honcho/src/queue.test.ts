import { test, expect, beforeEach } from "bun:test";
import { queueMessage, getQueuedMessages, markMessagesUploadedByIds, clearMessageQueue } from "./cache.js";

beforeEach(() => clearMessageQueue());

test("queued messages get unique ids and preserve metadata + peerId", () => {
  queueMessage("hello", "rafa", "/cwd", undefined, { type: "user_prompt" });
  queueMessage("hi back", "assistant", "/cwd", undefined, { type: "assistant_response" });
  const msgs = getQueuedMessages("/cwd");
  expect(msgs.length).toBe(2);
  expect(new Set(msgs.map(m => m.id)).size).toBe(2);
  expect(msgs[0].peerId).toBe("rafa");
  expect(msgs[1].metadata?.type).toBe("assistant_response");
});

test("mark-by-ids removes only those ids, keeps the rest", () => {
  queueMessage("a", "rafa", "/cwd");
  queueMessage("b", "rafa", "/cwd");
  const [m1] = getQueuedMessages("/cwd");
  markMessagesUploadedByIds([m1.id]);
  const left = getQueuedMessages("/cwd");
  expect(left.length).toBe(1);
  expect(left[0].content).toBe("b");
});
