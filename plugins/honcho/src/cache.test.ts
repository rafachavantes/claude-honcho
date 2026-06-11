import { test, expect, beforeEach, afterEach } from "bun:test";
import { setPostCompactFlag, consumePostCompactFlag, clearPostCompactFlag } from "./cache.js";

const CWD = "/test-postcompact-flag";

beforeEach(() => clearPostCompactFlag(CWD));
afterEach(() => clearPostCompactFlag(CWD));

test("flag is one-shot: consume returns true once, then false", () => {
  setPostCompactFlag(CWD, "inst-1");
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(true);
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(false);
});

test("no flag set -> consume returns false", () => {
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(false);
});

test("flag for another instance is left untouched", () => {
  setPostCompactFlag(CWD, "inst-1");
  expect(consumePostCompactFlag(CWD, "inst-2")).toBe(false);
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(true);
});

test("missing instance ids fall back to cwd-only matching", () => {
  setPostCompactFlag(CWD, undefined);
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(true);
  setPostCompactFlag(CWD, "inst-1");
  expect(consumePostCompactFlag(CWD, undefined)).toBe(true);
});

test("clearPostCompactFlag removes a pending flag", () => {
  setPostCompactFlag(CWD, "inst-1");
  clearPostCompactFlag(CWD);
  expect(consumePostCompactFlag(CWD, "inst-1")).toBe(false);
});
