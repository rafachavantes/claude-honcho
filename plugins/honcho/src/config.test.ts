import { test, expect } from "bun:test";
import { getContextScope, getWriteMode, shouldCaptureToolCalls } from "./config.js";

test("defaults preserve upstream behavior", () => {
  expect(getContextScope({} as any)).toBe("global");
  expect(getWriteMode({} as any)).toBe("inline");
  expect(shouldCaptureToolCalls({} as any)).toBe(true);
});
test("explicit values are honored", () => {
  expect(getContextScope({ contextScope: "session" } as any)).toBe("session");
  expect(getWriteMode({ writeMode: "detached" } as any)).toBe("detached");
  expect(shouldCaptureToolCalls({ captureToolCalls: false } as any)).toBe(false);
});
