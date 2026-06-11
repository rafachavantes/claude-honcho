import { test, expect } from "bun:test";
import { decideInjection, SLIM_POINTER } from "./injection-policy.js";

test("non-compact sources always inject full", () => {
  for (const source of ["startup", "resume", "clear", undefined]) {
    expect(decideInjection(source, "full")).toBe("full");
    expect(decideInjection(source, "slim")).toBe("full");
    expect(decideInjection(source, "off")).toBe("full");
  }
});

test("compact source follows injectOnCompact config", () => {
  expect(decideInjection("compact", "full")).toBe("full");
  expect(decideInjection("compact", "slim")).toBe("slim");
  expect(decideInjection("compact", "off")).toBe("off");
});

test("slim pointer is one short line", () => {
  expect(SLIM_POINTER).not.toContain("\n");
  expect(SLIM_POINTER.length).toBeLessThan(160);
});
