import { test, expect } from "bun:test";
import { acquireLock, releaseLock } from "./lock.js";
import { tmpdir } from "os";
import { join } from "path";

test("second acquire fails while held, succeeds after release", () => {
  const p = join(tmpdir(), `honcho-test-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`);
  expect(acquireLock(p)).toBe(true);
  expect(acquireLock(p)).toBe(false);
  releaseLock(p);
  expect(acquireLock(p)).toBe(true);
  releaseLock(p);
});

test("stale lock is broken when ttl is exceeded", () => {
  const p = join(tmpdir(), `honcho-stale-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`);
  expect(acquireLock(p, 30000)).toBe(true);   // hold it
  // ttl=0 → existing lock is treated as stale and broken
  expect(acquireLock(p, 0)).toBe(true);
  releaseLock(p);
});
