import { test, expect, afterEach } from "bun:test";
import { getContextScope, getWriteMode, shouldCaptureToolCalls, getInjectOnCompact, getPreCompactAnchor } from "./config.js";

afterEach(() => {
  delete process.env.HONCHO_INJECT_ON_COMPACT;
});

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

test("injectOnCompact defaults to slim, preCompactAnchor defaults to false", () => {
  delete process.env.HONCHO_INJECT_ON_COMPACT;
  expect(getInjectOnCompact({} as any)).toBe("slim");
  expect(getPreCompactAnchor({} as any)).toBe(false);
});

test("explicit injectOnCompact and preCompactAnchor are honored", () => {
  delete process.env.HONCHO_INJECT_ON_COMPACT;
  expect(getInjectOnCompact({ injectOnCompact: "off" } as any)).toBe("off");
  expect(getInjectOnCompact({ injectOnCompact: "full" } as any)).toBe("full");
  expect(getPreCompactAnchor({ preCompactAnchor: true } as any)).toBe(true);
});

test("HONCHO_INJECT_ON_COMPACT env overrides config; invalid values are ignored", () => {
  process.env.HONCHO_INJECT_ON_COMPACT = "off";
  expect(getInjectOnCompact({ injectOnCompact: "full" } as any)).toBe("off");
  process.env.HONCHO_INJECT_ON_COMPACT = "bogus";
  expect(getInjectOnCompact({ injectOnCompact: "full" } as any)).toBe("full");
  expect(getInjectOnCompact({} as any)).toBe("slim");
  delete process.env.HONCHO_INJECT_ON_COMPACT;
});
